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
import {
  checkInPatient,
  assignRoom,
  assignNurse,
  nurseStartEncounter,
  addVitalSigns,
  alertDoctor,
  doctorStartEncounter,
  getEncountersByRoom,
  getAvailableRooms,
  getAvailableNurses,
  getPatientQueue,
  getNurseAssignedPatients,
  releaseRoom,
} from '../controllers/workflowController';
import {
  createClinicalNote,
  getEncounterNotes,
  getPatientNotes,
  updateClinicalNote,
  signClinicalNote,
  getSignedNotes,
} from '../controllers/clinicalNotesController';
import {
  createLabOrder,
  getLabOrders,
  updateLabOrder,
  createImagingOrder,
  getImagingOrders,
  updateImagingOrder,
  createPharmacyOrder,
  getPharmacyOrders,
  updatePharmacyOrder,
  getAllEncounterOrders,
} from '../controllers/ordersController';
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

// Workflow routes - Receptionist
router.post('/workflow/check-in', authenticateToken, authorizeRoles('receptionist'), checkInPatient);
router.post('/workflow/assign-room', authenticateToken, authorizeRoles('receptionist'), assignRoom);
router.post('/workflow/assign-nurse', authenticateToken, authorizeRoles('receptionist'), assignNurse);
router.get('/workflow/queue', authenticateToken, authorizeRoles('receptionist', 'nurse', 'doctor'), getPatientQueue);
router.get('/workflow/rooms', authenticateToken, getAvailableRooms);
router.get('/workflow/nurses', authenticateToken, authorizeRoles('receptionist'), getAvailableNurses);
router.post('/workflow/release-room', authenticateToken, authorizeRoles('doctor', 'nurse'), releaseRoom);

// Workflow routes - Nurse
router.post('/workflow/nurse/start', authenticateToken, authorizeRoles('nurse'), nurseStartEncounter);
router.post('/workflow/nurse/vitals', authenticateToken, authorizeRoles('nurse'), addVitalSigns);
router.post('/workflow/nurse/alert-doctor', authenticateToken, authorizeRoles('nurse'), alertDoctor);
router.get('/workflow/nurse/patients', authenticateToken, authorizeRoles('nurse'), getNurseAssignedPatients);

// Workflow routes - Doctor
router.post('/workflow/doctor/start', authenticateToken, authorizeRoles('doctor'), doctorStartEncounter);
router.get('/workflow/doctor/rooms', authenticateToken, authorizeRoles('doctor'), getEncountersByRoom);

// Clinical notes routes
router.post('/clinical-notes', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), createClinicalNote);
router.get('/clinical-notes/encounter/:encounter_id', authenticateToken, getEncounterNotes);
router.get('/clinical-notes/patient/:patient_id', authenticateToken, getPatientNotes);
router.put('/clinical-notes/:id', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), updateClinicalNote);
router.post('/clinical-notes/:id/sign', authenticateToken, authorizeRoles('doctor'), signClinicalNote);
router.get('/clinical-notes/encounter/:encounter_id/signed', authenticateToken, getSignedNotes);

// Orders routes - Lab
router.post('/orders/lab', authenticateToken, authorizeRoles('doctor'), createLabOrder);
router.get('/orders/lab', authenticateToken, getLabOrders);
router.put('/orders/lab/:id', authenticateToken, updateLabOrder);

// Orders routes - Imaging
router.post('/orders/imaging', authenticateToken, authorizeRoles('doctor'), createImagingOrder);
router.get('/orders/imaging', authenticateToken, getImagingOrders);
router.put('/orders/imaging/:id', authenticateToken, updateImagingOrder);

// Orders routes - Pharmacy
router.post('/orders/pharmacy', authenticateToken, authorizeRoles('doctor'), createPharmacyOrder);
router.get('/orders/pharmacy', authenticateToken, getPharmacyOrders);
router.put('/orders/pharmacy/:id', authenticateToken, updatePharmacyOrder);

// Get all orders for an encounter
router.get('/orders/encounter/:encounter_id', authenticateToken, getAllEncounterOrders);

export default router;
