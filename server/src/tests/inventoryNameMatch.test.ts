import { describe, it, expect, vi } from 'vitest';
import { findInventoryByName } from '../controllers/ordersController';

// Fake client: the first query is the exact-name lookup, the second the loose one.
const client = (exact: any[], loose: any[]) => {
  const query = vi.fn().mockResolvedValueOnce({ rows: exact }).mockResolvedValueOnce({ rows: loose });
  return { query };
};

describe('free-text medication → inventory item', () => {
  it('matches the same name regardless of case and stray spaces', async () => {
    const c = client([{ id: 463, medication_name: 'E45 CREAM ', selling_price: '265.00' }], []);
    expect((await findInventoryByName(c, '  E45   Cream '))?.id).toBe(463);
    expect(c.query.mock.calls[0][1]).toEqual(['E45 Cream']);
  });

  it('falls back to a contains match only when exactly one item fits', async () => {
    expect((await findInventoryByName(client([], [{ id: 465 }]), 'Elocom cream'))?.id).toBe(465);
    expect(await findInventoryByName(client([], [{ id: 1 }, { id: 2 }]), 'Amoxicillin')).toBeNull();
  });

  it('escapes LIKE wildcards in the exact lookup', async () => {
    const c = client([], []);
    await findInventoryByName(c, 'Zinc 5%_x');
    expect(c.query.mock.calls[0][1]).toEqual(['Zinc 5\\%\\_x']);
  });
});
