import { describe, it, expect } from 'vitest';
import { deriveTenantTokens, contrast, clashesWithSemantics } from '../styles/tenantAccent';

describe('white-label accent', () => {
  it('meets WCAG AA in light and dark for a range of brand colours', () => {
    for (const brand of ['#5BC5C8', '#0F766E', '#2E5BFF', '#8E4585', '#FFD400', '#22C55E', '#1E293B']) {
      const t = deriveTenantTokens(brand)!;
      expect(t, brand).not.toBeNull();
      expect(contrast(t.light.accent, '#FFFFFF'), `${brand} light accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark.accent, '#1C1A17'), `${brand} dark accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.light.onAccent, t.light.accent), `${brand} text on accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.light.accentText, t.light.accentSoft), `${brand} accent text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark.accentText, t.dark.accentSoft), `${brand} dark accent text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("refuses brand colours that would look like a clinical status", () => {
    expect(clashesWithSemantics('#DC2626')).toBe(true); // red = critical
    expect(clashesWithSemantics('#F97316')).toBe(true); // orange = warning
    expect(deriveTenantTokens('#E11D48')).toBeNull();
    expect(clashesWithSemantics('#0F766E')).toBe(false);
    expect(clashesWithSemantics('#8E4585')).toBe(false); // plum is fine
  });

  it('rejects invalid input', () => {
    expect(deriveTenantTokens('teal')).toBeNull();
    expect(deriveTenantTokens('#12')).toBeNull();
  });
});
