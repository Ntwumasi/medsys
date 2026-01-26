import express from 'express';
import { register, login, getCurrentUser, impersonateUser } from '../controllers/authController';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  activateUser,
} from '../controllers/userController';
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
  updateChiefComplaint,
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
  getVitalSignsHistory,
  alertDoctor,
  getNurseNotifications,
  doctorStartEncounter,
  getEncountersByRoom,
  getAvailableRooms,
  getAvailableNurses,
  getAvailableDoctors,
  getPatientQueue,
  getNurseAssignedPatients,
  doctorCompleteEncounter,
  releaseRoom,
  getCompletedEncounters,
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
  getDoctorAlerts,
} from '../controllers/ordersController';
import {
  getCorporateClients,
  createCorporateClient,
  updateCorporateClient,
  deleteCorporateClient,
  getInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider,
  getPatientPayerSources,
} from '../controllers/payerSourcesController';
import {
  getInvoiceById,
  getInvoicesByPatient,
  getInvoiceByEncounter,
  createOrGetInvoice,
  updateInvoice,
} from '../controllers/invoiceController';
import {
  getAllCharges,
  addChargeToInvoice,
  getInvoiceItems,
  removeInvoiceItem,
  createCharge,
  updateCharge,
} from '../controllers/chargeMasterController';
import {
  routePatientToDepartment,
  getDepartmentQueue,
  updateRoutingStatus,
  getPatientRoutingHistory,
  cancelRouting,
} from '../controllers/departmentRoutingController';
import {
  searchPatients,
  searchEncounters,
  quickSearch,
} from '../controllers/searchController';
import {
  orderNurseProcedure,
  getNurseProcedures,
  startNurseProcedure,
  completeNurseProcedure,
  getAvailableNurseProcedures,
  cancelNurseProcedure,
} from '../controllers/nurseProceduresController';
import {
  getHP,
  saveHPSection,
  getHPStatus,
} from '../controllers/hpController';
import { parseDictation } from '../controllers/smartDictationController';
import {
  getSystemUpdates,
  createSystemUpdate,
  updateSystemUpdate,
  deleteSystemUpdate,
  getUpdateStats,
} from '../controllers/systemUpdatesController';
import {
  getShortStayBeds,
  assignBed,
  releaseBed,
  getEncounterShortStayHistory,
} from '../controllers/shortStayController';
import {
  getInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  adjustStock,
  dispenseMedication,
  getInventoryCategories,
  getLowStockAlerts,
  getExpiringMedications,
  getPayerPricingRules,
  calculatePrice,
  getRevenueSummary,
  getPatientDrugHistory,
} from '../controllers/inventoryController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = express.Router();

// Auth routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authenticateToken, getCurrentUser);
router.post('/auth/impersonate/:userId', authenticateToken, authorizeRoles('admin'), impersonateUser);

// User Management routes (Admin only)
router.get('/users', authenticateToken, authorizeRoles('admin'), getAllUsers);
router.get('/users/:id', authenticateToken, authorizeRoles('admin'), getUserById);
router.post('/users', authenticateToken, authorizeRoles('admin'), createUser);
router.put('/users/:id', authenticateToken, authorizeRoles('admin'), updateUser);
router.delete('/users/:id', authenticateToken, authorizeRoles('admin'), deleteUser);
router.post('/users/:id/activate', authenticateToken, authorizeRoles('admin'), activateUser);

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
router.patch('/encounters/:id/chief-complaint', authenticateToken, authorizeRoles('nurse', 'receptionist'), updateChiefComplaint);
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
router.post('/workflow/assign-room', authenticateToken, authorizeRoles('receptionist', 'nurse'), assignRoom);
router.post('/workflow/assign-nurse', authenticateToken, authorizeRoles('receptionist'), assignNurse);
router.get('/workflow/queue', authenticateToken, authorizeRoles('receptionist', 'nurse', 'doctor'), getPatientQueue);
router.get('/workflow/completed-encounters', authenticateToken, authorizeRoles('receptionist', 'nurse', 'doctor'), getCompletedEncounters);
router.get('/workflow/rooms', authenticateToken, getAvailableRooms);
router.get('/workflow/nurses', authenticateToken, authorizeRoles('receptionist'), getAvailableNurses);
router.get('/workflow/doctors', authenticateToken, authorizeRoles('receptionist'), getAvailableDoctors);
router.post('/workflow/release-room', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), releaseRoom);

// Workflow routes - Nurse
router.post('/workflow/nurse/start', authenticateToken, authorizeRoles('nurse'), nurseStartEncounter);
router.post('/workflow/nurse/vitals', authenticateToken, authorizeRoles('nurse'), addVitalSigns);
router.get('/workflow/vitals-history/:patient_id', authenticateToken, authorizeRoles('nurse', 'doctor'), getVitalSignsHistory);
router.post('/workflow/nurse/alert-doctor', authenticateToken, authorizeRoles('nurse'), alertDoctor);
router.get('/workflow/nurse/notifications', authenticateToken, authorizeRoles('nurse'), getNurseNotifications);
router.get('/workflow/nurse/patients', authenticateToken, authorizeRoles('nurse'), getNurseAssignedPatients);

// Workflow routes - Doctor
router.post('/workflow/doctor/start', authenticateToken, authorizeRoles('doctor'), doctorStartEncounter);
router.get('/workflow/doctor/rooms', authenticateToken, authorizeRoles('doctor'), getEncountersByRoom);
router.post('/workflow/doctor/complete-encounter', authenticateToken, authorizeRoles('doctor'), doctorCompleteEncounter);

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

// Get doctor alerts - recently completed results
router.get('/orders/doctor-alerts', authenticateToken, authorizeRoles('doctor'), getDoctorAlerts);

// Payer sources routes - Corporate Clients
router.get('/payer-sources/corporate-clients', authenticateToken, getCorporateClients);
router.post('/payer-sources/corporate-clients', authenticateToken, authorizeRoles('admin'), createCorporateClient);
router.put('/payer-sources/corporate-clients/:id', authenticateToken, authorizeRoles('admin'), updateCorporateClient);
router.delete('/payer-sources/corporate-clients/:id', authenticateToken, authorizeRoles('admin'), deleteCorporateClient);

// Payer sources routes - Insurance Providers
router.get('/payer-sources/insurance-providers', authenticateToken, getInsuranceProviders);
router.post('/payer-sources/insurance-providers', authenticateToken, authorizeRoles('admin'), createInsuranceProvider);
router.put('/payer-sources/insurance-providers/:id', authenticateToken, authorizeRoles('admin'), updateInsuranceProvider);
router.delete('/payer-sources/insurance-providers/:id', authenticateToken, authorizeRoles('admin'), deleteInsuranceProvider);

// Get patient payer sources
router.get('/payer-sources/patient/:patient_id', authenticateToken, getPatientPayerSources);

// Invoice routes
router.get('/invoices/:id', authenticateToken, getInvoiceById);
router.get('/invoices/patient/:patient_id', authenticateToken, getInvoicesByPatient);
router.get('/invoices/encounter/:encounter_id', authenticateToken, getInvoiceByEncounter);
router.post('/invoices', authenticateToken, authorizeRoles('receptionist', 'admin'), createOrGetInvoice);
router.put('/invoices/:id', authenticateToken, authorizeRoles('receptionist', 'admin'), updateInvoice);

// Charge Master routes
router.get('/charge-master', authenticateToken, getAllCharges);
router.post('/charge-master', authenticateToken, authorizeRoles('admin'), createCharge);
router.put('/charge-master/:id', authenticateToken, authorizeRoles('admin'), updateCharge);

// Invoice Items routes
router.get('/invoice-items/:invoice_id', authenticateToken, getInvoiceItems);
router.post('/invoice-items', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist', 'admin'), addChargeToInvoice);
router.delete('/invoice-items/:id', authenticateToken, authorizeRoles('receptionist', 'admin'), removeInvoiceItem);

// Department Routing routes
router.post('/department-routing', authenticateToken, authorizeRoles('nurse', 'doctor'), routePatientToDepartment);
router.get('/department-routing/:department/queue', authenticateToken, getDepartmentQueue);
router.put('/department-routing/:id/status', authenticateToken, updateRoutingStatus);
router.get('/department-routing/encounter/:encounter_id', authenticateToken, getPatientRoutingHistory);
router.post('/department-routing/:id/cancel', authenticateToken, authorizeRoles('nurse', 'doctor'), cancelRouting);

// Search routes
router.get('/search/patients', authenticateToken, searchPatients);
router.get('/search/encounters', authenticateToken, searchEncounters);
router.get('/search/quick', authenticateToken, quickSearch);

// Nurse Procedures routes
router.post('/nurse-procedures', authenticateToken, authorizeRoles('doctor'), orderNurseProcedure);
router.get('/nurse-procedures', authenticateToken, authorizeRoles('nurse', 'doctor'), getNurseProcedures);
router.get('/nurse-procedures/available', authenticateToken, authorizeRoles('doctor', 'nurse'), getAvailableNurseProcedures);
router.post('/nurse-procedures/:id/start', authenticateToken, authorizeRoles('nurse'), startNurseProcedure);
router.post('/nurse-procedures/:id/complete', authenticateToken, authorizeRoles('nurse'), completeNurseProcedure);
router.post('/nurse-procedures/:id/cancel', authenticateToken, authorizeRoles('doctor', 'nurse'), cancelNurseProcedure);

// H&P (History & Physical) routes
router.get('/hp/:encounter_id', authenticateToken, authorizeRoles('nurse', 'doctor'), getHP);
router.post('/hp/save', authenticateToken, authorizeRoles('nurse', 'doctor'), saveHPSection);
router.get('/hp/:encounter_id/status', authenticateToken, authorizeRoles('nurse', 'doctor'), getHPStatus);
router.post('/hp/parse-dictation', authenticateToken, authorizeRoles('nurse', 'doctor'), parseDictation);

// System Updates / Roadmap routes (public read access)
router.get('/system-updates', getSystemUpdates);
router.get('/system-updates/stats', getUpdateStats);
router.post('/system-updates', authenticateToken, authorizeRoles('admin'), createSystemUpdate);
router.put('/system-updates/:id', authenticateToken, authorizeRoles('admin'), updateSystemUpdate);
router.delete('/system-updates/:id', authenticateToken, authorizeRoles('admin'), deleteSystemUpdate);

// Short Stay Unit routes
router.get('/short-stay/beds', authenticateToken, authorizeRoles('doctor', 'nurse'), getShortStayBeds);
router.post('/short-stay/assign', authenticateToken, authorizeRoles('doctor'), assignBed);
router.post('/short-stay/release/:bed_id', authenticateToken, authorizeRoles('doctor', 'nurse'), releaseBed);
router.get('/short-stay/encounter/:encounter_id', authenticateToken, authorizeRoles('doctor', 'nurse'), getEncounterShortStayHistory);

// Pharmacy Inventory routes
router.get('/inventory', authenticateToken, authorizeRoles('pharmacy', 'admin'), getInventory);
router.get('/inventory/categories', authenticateToken, authorizeRoles('pharmacy', 'admin'), getInventoryCategories);
router.get('/inventory/low-stock', authenticateToken, authorizeRoles('pharmacy', 'admin'), getLowStockAlerts);
router.get('/inventory/expiring', authenticateToken, authorizeRoles('pharmacy', 'admin'), getExpiringMedications);
router.get('/inventory/:id', authenticateToken, authorizeRoles('pharmacy', 'admin'), getInventoryItem);
router.post('/inventory', authenticateToken, authorizeRoles('pharmacy', 'admin'), createInventoryItem);
router.put('/inventory/:id', authenticateToken, authorizeRoles('pharmacy', 'admin'), updateInventoryItem);
router.post('/inventory/:id/adjust', authenticateToken, authorizeRoles('pharmacy', 'admin'), adjustStock);
router.post('/inventory/dispense', authenticateToken, authorizeRoles('pharmacy'), dispenseMedication);

// Payer Pricing routes
router.get('/pricing-rules', authenticateToken, authorizeRoles('pharmacy', 'admin'), getPayerPricingRules);
router.post('/pricing/calculate', authenticateToken, authorizeRoles('pharmacy', 'admin', 'receptionist'), calculatePrice);

// Pharmacy Revenue & Drug History routes
router.get('/pharmacy/revenue', authenticateToken, authorizeRoles('pharmacy', 'admin'), getRevenueSummary);
router.get('/pharmacy/drug-history/:patient_id', authenticateToken, authorizeRoles('pharmacy', 'doctor', 'nurse'), getPatientDrugHistory);

export default router;
