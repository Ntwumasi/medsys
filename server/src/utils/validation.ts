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
  role: z.enum(['patient', 'receptionist', 'nurse', 'doctor', 'pharmacist', 'lab', 'imaging', 'admin', 'accountant']),
  phone: phoneSchema,
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  new_password: passwordSchema,
});

// ============ Patient Schemas ============

export const createPatientSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: emailSchema.optional().or(z.literal('')),
  phone: phoneSchema,
  date_of_birth: dateSchema.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  address: z.string().max(500).optional(),
  emergency_contact: z.string().max(100).optional(),
  emergency_phone: phoneSchema,
  insurance_provider: z.string().max(100).optional(),
  insurance_id: z.string().max(50).optional(),
  allergies: z.string().max(1000).optional(),
  blood_group: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

// ============ Appointment Schemas ============

export const createAppointmentSchema = z.object({
  patient_id: z.number().int().positive().optional(),
  patient_name: z.string().max(200).optional(),
  provider_id: z.number().int().positive(),
  appointment_date: dateSchema,
  duration_minutes: z.number().int().min(5).max(480).optional(),
  appointment_type: z.string().max(100).optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

// ============ Document Upload Schema ============

export const uploadDocumentSchema = z.object({
  patient_id: z.number().int().positive(),
  encounter_id: z.number().int().positive().optional(),
  lab_order_id: z.number().int().positive().optional(),
  document_type: z.enum(['lab_result', 'imaging', 'prescription', 'referral', 'consent', 'insurance', 'other']).optional(),
  document_name: z.string().min(1).max(255),
  file_data: z.string().min(1, 'File data is required'),
  file_type: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  is_confidential: z.boolean().optional(),
});

// ============ Message Schema ============

export const createMessageSchema = z.object({
  recipient_id: z.number().int().positive(),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Message body is required').max(10000),
  parent_id: z.number().int().positive().optional(),
  patient_id: z.number().int().positive().optional(),
});

// ============ Clinical Notes Schema ============

export const clinicalNoteSchema = z.object({
  encounter_id: z.number().int().positive(),
  note_type: z.enum(['progress', 'procedure', 'consultation', 'discharge', 'soap', 'other']),
  content: z.string().min(1, 'Note content is required').max(50000),
});

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
