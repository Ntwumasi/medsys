/**
 * Input Validation Schemas
 *
 * Uses Zod for runtime type validation to prevent injection attacks
 * and ensure data integrity.
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Common validation patterns
const emailSchema = z.string().email('Invalid email format').max(255);
const phoneSchema = z.string().regex(/^[\d\s\-\+\(\)]*$/, 'Invalid phone number format').max(20).optional().or(z.literal(''));
const uuidSchema = z.string().uuid('Invalid ID format');
const positiveIntSchema = z.number().int().positive();
const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date format');

// Password validation (matches existing requirements)
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character');

// Username validation
const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dots, underscores, and hyphens');

// ============ Auth Schemas ============

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(128),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: z.enum(['patient', 'receptionist', 'nurse', 'doctor', 'pharmacist', 'pharmacy', 'pharmacy_tech', 'lab', 'imaging', 'admin', 'accountant']),
  phone: phoneSchema,
}).passthrough();

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  new_password: passwordSchema,
});

// ============ Patient Schemas ============

// Helper: optional string that accepts empty string and trims
const optStr = (max: number) =>
  z.string().max(max).optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v));

// Gender accepts any case ("Male", "male", "MALE") and normalizes to lowercase.
const genderSchema = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    z.enum(['male', 'female', 'other'])
  )
  .optional();

const payerSourceSchema = z.object({
  payer_type: z.enum(['self_pay', 'corporate', 'insurance']).optional(),
  corporate_client_id: z.number().int().positive().optional().nullable(),
  insurance_provider_id: z.number().int().positive().optional().nullable(),
}).passthrough();

export const createPatientSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: emailSchema.optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  phone: phoneSchema,
  date_of_birth: dateSchema.optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  gender: genderSchema,

  // Address / location
  address: optStr(500),
  city: optStr(100),
  state: optStr(100),
  region: optStr(100),
  nationality: optStr(100),
  gps_address: optStr(100),
  preferred_clinic: optStr(100),

  // Emergency contact (form sends *_name / *_phone / *_relationship)
  emergency_contact_name: optStr(100),
  emergency_contact_phone: optStr(20),
  emergency_contact_relationship: optStr(100),

  // Insurance (legacy single fields still supported)
  insurance_provider: optStr(100),
  insurance_number: optStr(50),

  // Personal
  marital_status: optStr(50),
  occupation: optStr(100),

  // Clinical
  allergies: optStr(2000),
  blood_group: optStr(10),
  notes: optStr(2000),

  // Primary care physician
  pcp_name: optStr(255),
  pcp_phone: optStr(20),

  // VIP / health status fields
  vip_status: z.enum(['silver', 'gold', 'platinum']).optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  hiv_status: optStr(50),
  hepatitis_b_status: optStr(50),
  hepatitis_c_status: optStr(50),
  tb_status: optStr(50),
  sickle_cell_status: optStr(50),
  other_health_conditions: optStr(2000),

  // New payer sources array
  payer_sources: z.array(payerSourceSchema).optional(),
}).passthrough();

export const updatePatientSchema = createPatientSchema.partial();

// ============ Appointment Schemas ============

export const createAppointmentSchema = z.object({
  patient_id: z.number().int().positive().optional().nullable(),
  patient_name: z.string().max(200).optional(),
  // provider_id is optional/nullable: receptionist can pick "Any available doctor"
  provider_id: z.number().int().positive().optional().nullable(),
  appointment_date: dateSchema,
  duration_minutes: z.number().int().min(5).max(480).optional(),
  appointment_type: z.string().max(100).optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
}).passthrough();

// ============ Document Upload Schema ============

export const uploadDocumentSchema = z.object({
  patient_id: z.number().int().positive(),
  encounter_id: z.number().int().positive().optional().nullable(),
  lab_order_id: z.number().int().positive().optional().nullable(),
  document_type: z.enum(['lab_result', 'imaging', 'prescription', 'referral', 'consent', 'insurance', 'other']).optional(),
  document_name: z.string().min(1).max(255),
  file_data: z.string().min(1, 'File data is required'),
  file_type: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  is_confidential: z.boolean().optional(),
}).passthrough();

// ============ Message Schema ============

export const createMessageSchema = z.object({
  recipient_id: z.number().int().positive(),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Message body is required').max(10000),
  parent_id: z.number().int().positive().optional().nullable(),
  patient_id: z.number().int().positive().optional().nullable(),
}).passthrough();

// ============ Clinical Notes Schema ============

export const clinicalNoteSchema = z.object({
  encounter_id: z.number().int().positive(),
  patient_id: z.number().int().positive().optional().nullable(),
  note_type: z.enum(['progress', 'procedure', 'consultation', 'discharge', 'soap', 'other']),
  content: z.string().min(1, 'Note content is required').max(50000),
}).passthrough();

// ============ Middleware Factory ============

/**
 * Creates a validation middleware for the given Zod schema.
 * Validates req.body and returns 400 with error details if validation fails.
 */
export const validateBody = <T extends z.ZodType>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
        return;
      }

      // Replace req.body with validated/sanitized data
      req.body = result.data;
      next();
    } catch (error) {
      console.error('Validation error:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  };
};

/**
 * Creates a validation middleware for query parameters.
 */
export const validateQuery = <T extends z.ZodType>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          error: 'Invalid query parameters',
          details: errors,
        });
        return;
      }

      req.query = result.data;
      next();
    } catch (error) {
      console.error('Query validation error:', error);
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  };
};

/**
 * Creates a validation middleware for route parameters.
 */
export const validateParams = <T extends z.ZodType>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          error: 'Invalid route parameters',
          details: errors,
        });
        return;
      }

      req.params = result.data;
      next();
    } catch (error) {
      console.error('Params validation error:', error);
      res.status(400).json({ error: 'Invalid route parameters' });
    }
  };
};

// Export schemas for use in controllers
export const schemas = {
  login: loginSchema,
  register: registerSchema,
  changePassword: changePasswordSchema,
  resetPassword: resetPasswordSchema,
  createPatient: createPatientSchema,
  updatePatient: updatePatientSchema,
  createAppointment: createAppointmentSchema,
  uploadDocument: uploadDocumentSchema,
  createMessage: createMessageSchema,
  clinicalNote: clinicalNoteSchema,
};

export default schemas;
