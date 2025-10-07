import express from 'express';
import { register, login, getCurrentUser } from '../controllers/authController';
import {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  getPatientSummary,
} from '../controllers/patientController';
import {
  createEncounter,
  getEncounters,
  getEncounterById,
  updateEncounter,
  addDiagnosis,
} from '../controllers/encounterController';
import {
  createAppointment,
  getAppointments,
  updateAppointment,
  cancelAppointment,
  getTodayAppointments,
} from '../controllers/appointmentController';
import {
  prescribeMedication,
  getPatientMedications,
  updateMedication,
  discontinueMedication,
  checkAllergies,
} from '../controllers/medicationController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = express.Router();

// Auth routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authenticateToken, getCurrentUser);

// Patient routes
router.post('/patients', authenticateToken, authorizeRoles('doctor', 'nurse', 'admin', 'receptionist'), createPatient);
router.get('/patients', authenticateToken, getPatients);
router.get('/patients/:id', authenticateToken, getPatientById);
router.put('/patients/:id', authenticateToken, authorizeRoles('doctor', 'nurse', 'admin', 'receptionist'), updatePatient);
router.get('/patients/:id/summary', authenticateToken, getPatientSummary);

// Encounter routes
router.post('/encounters', authenticateToken, authorizeRoles('doctor', 'nurse'), createEncounter);
router.get('/encounters', authenticateToken, getEncounters);
router.get('/encounters/:id', authenticateToken, getEncounterById);
router.put('/encounters/:id', authenticateToken, authorizeRoles('doctor', 'nurse'), updateEncounter);
router.post('/encounters/diagnoses', authenticateToken, authorizeRoles('doctor'), addDiagnosis);

// Appointment routes
router.post('/appointments', authenticateToken, createAppointment);
router.get('/appointments', authenticateToken, getAppointments);
router.get('/appointments/today', authenticateToken, getTodayAppointments);
router.put('/appointments/:id', authenticateToken, updateAppointment);
router.post('/appointments/:id/cancel', authenticateToken, cancelAppointment);

// Medication routes
router.post('/medications', authenticateToken, authorizeRoles('doctor'), prescribeMedication);
router.get('/medications/patient/:patient_id', authenticateToken, getPatientMedications);
router.put('/medications/:id', authenticateToken, authorizeRoles('doctor'), updateMedication);
router.post('/medications/:id/discontinue', authenticateToken, authorizeRoles('doctor'), discontinueMedication);
router.post('/medications/check-allergies', authenticateToken, authorizeRoles('doctor', 'nurse'), checkAllergies);

export default router;
