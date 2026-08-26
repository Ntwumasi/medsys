import { describe, it, expect } from 'vitest';
import { createPatientSchema, formatValidationMessage } from '../utils/validation';

/**
 * Reception reported "Validation failed" with no indication of which field was
 * wrong. The 400 body has always carried `details`, but nothing rendered it.
 * These lock in that the response now names the field in plain language.
 */
const messageFor = (body: unknown): string => {
  const result = createPatientSchema.safeParse(body);
  if (result.success) throw new Error('expected validation to fail');
  return formatValidationMessage(
    result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
  );
};

const validPatient = {
  first_name: 'Ama',
  last_name: 'Mensah',
  phone: '0241234567',
  date_of_birth: '1990-05-04',
  gender: 'Female',
};

describe('patient registration validation messages', () => {
  it('accepts a realistic registration', () => {
    expect(createPatientSchema.safeParse(validPatient).success).toBe(true);
  });

  it('accepts the blank-heavy payload the registration form sends', () => {
    const result = createPatientSchema.safeParse({
      ...validPatient,
      email: '', address: '', city: '', region: '', vip_status: '',
      emergency_contact_name: '', emergency_contact_phone: '', allergies: '',
    });
    expect(result.success).toBe(true);
  });

  it('names the field when a required one is missing', () => {
    expect(messageFor({ ...validPatient, first_name: '' })).toContain('First name');
  });

  it('explains what a phone number may contain', () => {
    const msg = messageFor({ ...validPatient, phone: 'PENDING' });
    expect(msg).toContain('Phone');
    expect(msg).toContain('digits');
  });

  it('reports one line per field, not one per rule', () => {
    // Two numbers in one box trips both the format regex AND the length cap.
    const msg = messageFor({ ...validPatient, phone: '0241234567 / 0201234567' });
    expect(msg.match(/Phone/g)).toHaveLength(1);
  });

  it('names every offending field when several fail', () => {
    const msg = messageFor({ ...validPatient, first_name: '', email: 'nope' });
    expect(msg).toContain('First name');
    expect(msg).toContain('Email');
  });

  it('rewrites developer-facing Zod text', () => {
    const msg = messageFor({ ...validPatient, address: 'x'.repeat(600) });
    expect(msg).toContain('500 characters or fewer');
    expect(msg).not.toContain('String must contain');
  });

  // The Staff payer checkbox shipped 2026-07-15 with both DB CHECK constraints
  // migrated to accept 'staff', but this enum was left behind — so every staff
  // registration 400'd. Zero staff rows existed in production as a result.
  it.each(['self_pay', 'corporate', 'insurance', 'staff'])(
    'accepts the %s payer type the registration form can send',
    (payerType) => {
      const extra =
        payerType === 'corporate' ? { corporate_client_id: 1 }
        : payerType === 'insurance' ? { insurance_provider_id: 1 }
        : {};
      const result = createPatientSchema.safeParse({
        ...validPatient,
        payer_sources: [{ payer_type: payerType, ...extra }],
      });
      expect(result.success).toBe(true);
    }
  );

  it('humanizes nested payer source paths', () => {
    const msg = messageFor({ ...validPatient, payer_sources: [{ payer_type: '' }] });
    expect(msg).toContain('Payer source 1');
    expect(msg).not.toContain('payer_sources.0');
  });
});
