import express from 'express';
import {
  register,
  login,
  logout,
  logoutAll,
  getCurrentUser,
  impersonateUser,
  switchToDemoRole,
  changePassword,
  requestPasswordReset,
  resetPassword,
  getLoginHistory,
  getAllLoginAttempts,
  getBreakglassAlerts,
  unlockAccount,
  forcePasswordReset,
} from '../controllers/authController';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  activateUser,
  getActiveDoctors,
  resetUserPassword,
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
  markNoShow,
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
  assignDoctor,
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
  getReceptionistAlerts,
  markAlertAsRead,
  checkoutPatient,
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
  processRefill,
  getAllEncounterOrders,
  getDoctorAlerts,
  getCriticalResultAlerts,
  acknowledgeCriticalResult,
  createCriticalResultAlert,
  dispenseWalkInOrder,
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
  getAllInvoices,
  getInvoiceById,
  getInvoicesByPatient,
  getInvoiceByEncounter,
  createOrGetInvoice,
  updateInvoice,
  deferPayment,
  getPendingPayments,
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
  getDepartmentWalkIns,
  updateRoutingStatus,
  getPatientRoutingHistory,
  cancelRouting,
  getPharmacyWalkIns,
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
  signSOAP,
} from '../controllers/hpController';
import { parseDictation } from '../controllers/smartDictationController';
import {
  explainDrugInteraction,
  verifyDosage,
  suggestSubstitutions,
  generateCounseling,
  parseVoiceCommand,
  getAIStatus,
} from '../controllers/aiController';
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
  getRefillsCalendar,
  recordPurchase,
  getPurchaseHistory,
  deletePurchase,
  getInventoryBatches,
  updateBatchQuantity,
  updateBatchQuantities,
  getDispensingAnalytics,
  getExpiryCalendar,
  getPatientMedicationTimeline,
  searchInventoryMedications,
} from '../controllers/inventoryController';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierProducts,
} from '../controllers/supplierController';
import {
  getLabInventory,
  getLabInventoryItem,
  createLabInventoryItem,
  updateLabInventoryItem,
  adjustLabStock,
  useLabSupply,
  getLabInventoryCategories,
  getLowLabStockAlerts,
  getExpiringLabSupplies,
  getEquipmentCalibrationDue,
  recordCalibration,
  getLabTestCatalog,
  createLabTest,
  updateLabTest,
} from '../controllers/labInventoryController';
import {
  getLabAnalytics,
  getTestsPerPeriod,
  getTurnaroundTimeMetrics,
  getTestVolumeByType,
  getCriticalResultsStats,
  getDailyWorkload,
  exportAnalyticsCSV,
} from '../controllers/labAnalyticsController';
import {
  getPatientDocuments,
  uploadDocument,
  getDocument,
  deleteDocument,
} from '../controllers/documentsController';
import {
  getQCResults,
  recordQCResult,
  getLeveyJenningsData,
  getQCSummary,
  deleteQCResult,
} from '../controllers/labQCController';
import {
  getUserNotifications,
  createSelfNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '../controllers/notificationsController';
import {
  sendMessage,
  getInbox,
  getThread,
  getUnreadCount,
  markAsRead,
  getMessageableUsers,
  deleteMessage,
} from '../controllers/messageController';
import {
  getUnscheduledFollowUps,
  scheduleFollowUp,
  getFollowUpStats,
  skipFollowUp,
} from '../controllers/followUpController';
import { processFollowUpReminders } from '../services/followUpReminderService';
import {
  getFollowUpQueue,
  logFollowUpCall,
  getCallHistory,
} from '../controllers/nurseCallLogController';
import {
  getFollowUpTasks,
  completeTask as completeFollowUpTask,
  getDueTasks,
} from '../controllers/nurseFollowUpTaskController';
import {
  getNurseInventory,
  createNurseInventoryItem,
  updateNurseInventoryItem,
  recordNursePurchase,
  getNursePurchases,
} from '../controllers/nurseInventoryController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import {
  validateBody,
  loginSchema,
  registerSchema,
  changePasswordSchema,
  resetPasswordSchema,
  createPatientSchema,
  updatePatientSchema,
  createAppointmentSchema,
  uploadDocumentSchema,
  createMessageSchema,
  clinicalNoteSchema,
} from '../utils/validation';
import notificationRoutes from './notifications';
import auditRoutes from './audit';
import accountantRoutes from './accountant';
import claimsRoutes from './claims';
import reminderRoutes from './reminders';
import quickbooksRoutes from './quickbooks';
import qbDataRoutes from './qbData';
import drugInteractionService from '../services/drugInteractionService';
import labResultsService from '../services/labResultsService';

const router = express.Router();

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Auth routes (with input validation)
router.post('/auth/register', validateBody(registerSchema), register);
router.post('/auth/login', validateBody(loginSchema), login);
router.post('/auth/logout', authenticateToken, logout);
router.post('/auth/logout-all', authenticateToken, logoutAll);
router.get('/auth/me', authenticateToken, getCurrentUser);
router.post('/auth/impersonate/:userId', authenticateToken, authorizeRoles('admin'), impersonateUser);
router.post('/auth/switch-to-demo/:role', authenticateToken, switchToDemoRole);
router.post('/auth/change-password', authenticateToken, validateBody(changePasswordSchema), changePassword);
router.post('/auth/request-reset', requestPasswordReset);
router.post('/auth/reset-password', validateBody(resetPasswordSchema), resetPassword);
router.get('/auth/login-history', authenticateToken, getLoginHistory);

// Admin security routes
router.get('/admin/login-attempts', authenticateToken, authorizeRoles('admin'), getAllLoginAttempts);
router.get('/admin/breakglass-alerts', authenticateToken, authorizeRoles('admin'), getBreakglassAlerts);
router.post('/admin/unlock-account/:userId', authenticateToken, authorizeRoles('admin'), unlockAccount);
router.post('/admin/force-password-reset/:userId', authenticateToken, authorizeRoles('admin'), forcePasswordReset);

// Notification routes (user-specific)
router.get('/notifications', authenticateToken, getUserNotifications);
router.post('/notifications', authenticateToken, createSelfNotification);
router.put('/notifications/:id/read', authenticateToken, markNotificationRead);
router.put('/notifications/read-all', authenticateToken, markAllNotificationsRead);
router.delete('/notifications/:id', authenticateToken, deleteNotification);
router.delete('/notifications', authenticateToken, clearAllNotifications);

// Messaging routes (with input validation)
router.post('/messages', authenticateToken, validateBody(createMessageSchema), sendMessage);
router.get('/messages/inbox', authenticateToken, getInbox);
router.get('/messages/unread-count', authenticateToken, getUnreadCount);
router.get('/messages/users', authenticateToken, getMessageableUsers);
router.get('/messages/thread/:otherUserId', authenticateToken, getThread);
router.put('/messages/:messageId/read', authenticateToken, markAsRead);
router.delete('/messages/:messageId', authenticateToken, deleteMessage);

// Get active doctors (for nurses to select when ordering labs)
router.get('/users/doctors', authenticateToken, authorizeRoles('nurse', 'doctor', 'admin'), getActiveDoctors);

// User Management routes (Admin only)
router.get('/users', authenticateToken, authorizeRoles('admin'), getAllUsers);
router.get('/users/:id', authenticateToken, authorizeRoles('admin'), getUserById);
router.post('/users', authenticateToken, authorizeRoles('admin'), createUser);
router.put('/users/:id', authenticateToken, authorizeRoles('admin'), updateUser);
router.delete('/users/:id', authenticateToken, authorizeRoles('admin'), deleteUser);
router.post('/users/:id/activate', authenticateToken, authorizeRoles('admin'), activateUser);
router.post('/users/:id/reset-password', authenticateToken, authorizeRoles('admin'), resetUserPassword);

// Patient routes (with input validation)
router.post('/patients', authenticateToken, authorizeRoles('doctor', 'nurse', 'admin', 'receptionist'), validateBody(createPatientSchema), createPatient);
router.get('/patients', authenticateToken, getPatients);
router.get('/patients/:id', authenticateToken, getPatientById);
router.put('/patients/:id', authenticateToken, authorizeRoles('doctor', 'nurse', 'admin', 'receptionist'), validateBody(updatePatientSchema), updatePatient);
router.get('/patients/:id/summary', authenticateToken, getPatientSummary);

// Encounter routes
router.post('/encounters', authenticateToken, authorizeRoles('doctor', 'nurse', 'lab', 'pharmacist', 'pharmacy_tech'), createEncounter);
router.get('/encounters', authenticateToken, getEncounters);
router.get('/encounters/:id', authenticateToken, getEncounterById);
router.put('/encounters/:id', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), updateEncounter);
router.patch('/encounters/:id/chief-complaint', authenticateToken, authorizeRoles('nurse', 'receptionist'), updateChiefComplaint);
router.post('/encounters/diagnoses', authenticateToken, authorizeRoles('doctor'), addDiagnosis);

// Appointment routes (with input validation)
router.post('/appointments', authenticateToken, validateBody(createAppointmentSchema), createAppointment);
router.get('/appointments', authenticateToken, getAppointments);
router.get('/appointments/today', authenticateToken, getTodayAppointments);
router.put('/appointments/:id', authenticateToken, validateBody(createAppointmentSchema.partial()), updateAppointment);
router.post('/appointments/:id/cancel', authenticateToken, cancelAppointment);
router.post('/appointments/:id/no-show', authenticateToken, markNoShow);

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
router.post('/workflow/assign-doctor', authenticateToken, authorizeRoles('receptionist'), assignDoctor);
router.get('/workflow/queue', authenticateToken, authorizeRoles('receptionist', 'nurse', 'doctor'), getPatientQueue);
router.get('/workflow/completed-encounters', authenticateToken, authorizeRoles('receptionist', 'nurse', 'doctor'), getCompletedEncounters);
router.get('/workflow/rooms', authenticateToken, getAvailableRooms);
router.get('/workflow/nurses', authenticateToken, authorizeRoles('receptionist'), getAvailableNurses);
router.get('/workflow/doctors', authenticateToken, authorizeRoles('receptionist'), getAvailableDoctors);
router.post('/workflow/release-room', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), releaseRoom);

// Workflow routes - Receptionist alerts
router.get('/workflow/receptionist/alerts', authenticateToken, authorizeRoles('receptionist'), getReceptionistAlerts);
router.post('/workflow/alerts/:alert_id/read', authenticateToken, markAlertAsRead);

// Workflow routes - Receptionist checkout
router.post('/workflow/checkout', authenticateToken, authorizeRoles('receptionist'), checkoutPatient);

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

// Clinical notes routes (with input validation)
router.post('/clinical-notes', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), validateBody(clinicalNoteSchema), createClinicalNote);
router.get('/clinical-notes/encounter/:encounter_id', authenticateToken, getEncounterNotes);
router.get('/clinical-notes/patient/:patient_id', authenticateToken, getPatientNotes);
router.put('/clinical-notes/:id', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist'), validateBody(clinicalNoteSchema.partial()), updateClinicalNote);
router.post('/clinical-notes/:id/sign', authenticateToken, authorizeRoles('doctor'), signClinicalNote);
router.get('/clinical-notes/encounter/:encounter_id/signed', authenticateToken, getSignedNotes);

// Orders routes - Lab
router.post('/orders/lab', authenticateToken, authorizeRoles('doctor', 'nurse'), createLabOrder);
router.get('/orders/lab', authenticateToken, getLabOrders);
router.put('/orders/lab/:id', authenticateToken, updateLabOrder);

// Orders routes - Imaging (nurses can create for verbal orders)
router.post('/orders/imaging', authenticateToken, authorizeRoles('doctor', 'nurse'), createImagingOrder);
router.get('/orders/imaging', authenticateToken, getImagingOrders);
router.put('/orders/imaging/:id', authenticateToken, updateImagingOrder);

// Orders routes - Pharmacy
router.post('/orders/pharmacy', authenticateToken, authorizeRoles('doctor'), createPharmacyOrder);
router.get('/orders/pharmacy', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'doctor', 'nurse', 'admin'), getPharmacyOrders);
router.put('/orders/pharmacy/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), updatePharmacyOrder);
router.post('/orders/pharmacy/:id/refill', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'receptionist', 'admin'), processRefill);

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
router.get('/invoices', authenticateToken, getAllInvoices);
router.get('/invoices/pending-payments', authenticateToken, getPendingPayments);
router.get('/invoices/:id', authenticateToken, getInvoiceById);
router.get('/invoices/patient/:patient_id', authenticateToken, getInvoicesByPatient);
router.get('/invoices/encounter/:encounter_id', authenticateToken, getInvoiceByEncounter);
router.post('/invoices', authenticateToken, authorizeRoles('receptionist', 'admin'), createOrGetInvoice);
router.put('/invoices/:id', authenticateToken, authorizeRoles('receptionist', 'admin'), updateInvoice);
router.post('/invoices/:id/defer-payment', authenticateToken, authorizeRoles('receptionist', 'admin'), deferPayment);

// Charge Master routes
router.get('/charge-master', authenticateToken, getAllCharges);
router.post('/charge-master', authenticateToken, authorizeRoles('admin'), createCharge);
router.put('/charge-master/:id', authenticateToken, authorizeRoles('admin'), updateCharge);

// Invoice Items routes
router.get('/invoice-items/:invoice_id', authenticateToken, getInvoiceItems);
router.post('/invoice-items', authenticateToken, authorizeRoles('doctor', 'nurse', 'receptionist', 'admin'), addChargeToInvoice);
router.delete('/invoice-items/:id', authenticateToken, authorizeRoles('receptionist', 'admin'), removeInvoiceItem);

// Department Routing routes
router.post('/department-routing', authenticateToken, authorizeRoles('nurse', 'doctor', 'receptionist', 'lab', 'pharmacist', 'pharmacy_tech'), routePatientToDepartment);
router.get('/department-routing/:department/queue', authenticateToken, getDepartmentQueue);
router.get('/department-routing/:department/walk-ins', authenticateToken, getDepartmentWalkIns);
router.put('/department-routing/:id/status', authenticateToken, updateRoutingStatus);
router.get('/department-routing/encounter/:encounter_id', authenticateToken, getPatientRoutingHistory);
router.post('/department-routing/:id/cancel', authenticateToken, authorizeRoles('nurse', 'doctor'), cancelRouting);
router.get('/pharmacy/walk-ins', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech'), getPharmacyWalkIns);
router.post('/pharmacy/walk-in-dispense', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech'), dispenseWalkInOrder);

// Search routes
router.get('/search/patients', authenticateToken, searchPatients);
router.get('/search/encounters', authenticateToken, searchEncounters);
router.get('/search/quick', authenticateToken, quickSearch);

// Nurse Procedures routes
router.post('/nurse-procedures', authenticateToken, authorizeRoles('doctor', 'nurse'), orderNurseProcedure);
router.get('/nurse-procedures', authenticateToken, authorizeRoles('nurse', 'doctor'), getNurseProcedures);
router.get('/nurse-procedures/available', authenticateToken, authorizeRoles('doctor', 'nurse'), getAvailableNurseProcedures);
router.post('/nurse-procedures/:id/start', authenticateToken, authorizeRoles('nurse'), startNurseProcedure);
router.post('/nurse-procedures/:id/complete', authenticateToken, authorizeRoles('nurse'), completeNurseProcedure);
router.post('/nurse-procedures/:id/cancel', authenticateToken, authorizeRoles('doctor', 'nurse'), cancelNurseProcedure);

// H&P (History & Physical) routes
router.get('/hp/:encounter_id', authenticateToken, authorizeRoles('nurse', 'doctor'), getHP);
router.post('/hp/save', authenticateToken, authorizeRoles('nurse', 'doctor'), saveHPSection);
router.get('/hp/:encounter_id/status', authenticateToken, authorizeRoles('nurse', 'doctor'), getHPStatus);
router.post('/hp/:encounter_id/sign', authenticateToken, authorizeRoles('doctor'), signSOAP);
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
router.get('/inventory', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getInventory);
router.get('/inventory/categories', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getInventoryCategories);
router.get('/inventory/search', authenticateToken, searchInventoryMedications);
router.get('/inventory/low-stock', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getLowStockAlerts);
router.get('/inventory/expiring', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getExpiringMedications);
// Static /inventory/* paths MUST come before /inventory/:id so Express
// doesn't swallow "purchases", "dispense", etc. as an id parameter.
router.get('/inventory/purchases', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getPurchaseHistory);
router.delete('/inventory/purchases/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), deletePurchase);
router.post('/inventory/dispense', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech'), dispenseMedication);
router.post('/inventory/purchase', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), recordPurchase);
router.get('/inventory/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getInventoryItem);
router.post('/inventory', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), createInventoryItem);
router.put('/inventory/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), updateInventoryItem);
router.post('/inventory/:id/adjust', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), adjustStock);
router.get('/inventory/:id/batches', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getInventoryBatches);
router.put('/inventory/:id/batches', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), updateBatchQuantities);
router.put('/inventory/:id/batches/:batchId', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), updateBatchQuantity);

// Analytics routes
router.get('/analytics/dispensing', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getDispensingAnalytics);

// AI routes for pharmacy
router.get('/ai/status', authenticateToken, getAIStatus);
router.post('/ai/drug-interactions', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'doctor', 'admin'), explainDrugInteraction);
router.post('/ai/dosage-verify', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'doctor', 'admin'), verifyDosage);
router.post('/ai/substitutions', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'doctor', 'admin'), suggestSubstitutions);
router.post('/ai/counseling', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), generateCounseling);
router.post('/ai/voice-command', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), parseVoiceCommand);
router.get('/inventory/expiry-calendar', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getExpiryCalendar);
router.get('/patients/:patientId/medication-timeline', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin', 'doctor', 'nurse'), getPatientMedicationTimeline);

// Payer Pricing routes
router.get('/pricing-rules', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin'), getPayerPricingRules);
router.post('/pricing/calculate', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'admin', 'receptionist'), calculatePrice);

// Pharmacy Revenue & Drug History routes
router.get('/pharmacy/revenue', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), getRevenueSummary);
router.get('/pharmacy/drug-history/:patient_id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'doctor', 'nurse'), getPatientDrugHistory);
router.get('/pharmacy/refills', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'pharmacy_tech', 'receptionist', 'admin'), getRefillsCalendar);

// Supplier routes
router.get('/suppliers', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), getSuppliers);
router.get('/suppliers/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), getSupplierById);
router.get('/suppliers/:id/products', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), getSupplierProducts);
router.post('/suppliers', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), createSupplier);
router.put('/suppliers/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), updateSupplier);
router.delete('/suppliers/:id', authenticateToken, authorizeRoles('pharmacy', 'pharmacist', 'admin'), deleteSupplier);

// Lab Inventory routes
router.get('/lab-inventory', authenticateToken, authorizeRoles('lab', 'admin'), getLabInventory);
router.get('/lab-inventory/categories', authenticateToken, authorizeRoles('lab', 'admin'), getLabInventoryCategories);
router.get('/lab-inventory/low-stock', authenticateToken, authorizeRoles('lab', 'admin'), getLowLabStockAlerts);
router.get('/lab-inventory/expiring', authenticateToken, authorizeRoles('lab', 'admin'), getExpiringLabSupplies);
router.get('/lab-inventory/calibration-due', authenticateToken, authorizeRoles('lab', 'admin'), getEquipmentCalibrationDue);
router.get('/lab-inventory/:id', authenticateToken, authorizeRoles('lab', 'admin'), getLabInventoryItem);
router.post('/lab-inventory', authenticateToken, authorizeRoles('lab', 'admin'), createLabInventoryItem);
router.put('/lab-inventory/:id', authenticateToken, authorizeRoles('lab', 'admin'), updateLabInventoryItem);
router.post('/lab-inventory/:id/adjust', authenticateToken, authorizeRoles('lab', 'admin'), adjustLabStock);
router.post('/lab-inventory/:id/calibrate', authenticateToken, authorizeRoles('lab', 'admin'), recordCalibration);
router.post('/lab-inventory/use', authenticateToken, authorizeRoles('lab'), useLabSupply);

// Lab Test Catalog routes
router.get('/lab/test-catalog', authenticateToken, getLabTestCatalog);
router.post('/lab/test-catalog', authenticateToken, authorizeRoles('lab', 'admin'), createLabTest);
router.put('/lab/test-catalog/:id', authenticateToken, authorizeRoles('lab', 'admin'), updateLabTest);

// Lab Analytics routes
router.get('/lab/analytics', authenticateToken, authorizeRoles('lab', 'admin'), getLabAnalytics);
router.get('/lab/analytics/tests-per-period', authenticateToken, authorizeRoles('lab', 'admin'), getTestsPerPeriod);
router.get('/lab/analytics/tat', authenticateToken, authorizeRoles('lab', 'admin'), getTurnaroundTimeMetrics);
router.get('/lab/analytics/volume-by-type', authenticateToken, authorizeRoles('lab', 'admin'), getTestVolumeByType);
router.get('/lab/analytics/critical-stats', authenticateToken, authorizeRoles('lab', 'admin'), getCriticalResultsStats);
router.get('/lab/analytics/workload', authenticateToken, authorizeRoles('lab', 'admin'), getDailyWorkload);
router.get('/lab/analytics/export', authenticateToken, authorizeRoles('lab', 'admin'), exportAnalyticsCSV);

// Critical Result Alerts routes
router.get('/lab/critical-alerts', authenticateToken, authorizeRoles('lab', 'doctor'), getCriticalResultAlerts);
router.post('/lab/critical-alerts', authenticateToken, authorizeRoles('lab'), createCriticalResultAlert);
router.post('/lab/critical-alerts/:id/acknowledge', authenticateToken, authorizeRoles('doctor'), acknowledgeCriticalResult);

// Patient Documents routes (with input validation)
router.get('/documents/patient/:patient_id', authenticateToken, getPatientDocuments);
router.post('/documents', authenticateToken, validateBody(uploadDocumentSchema), uploadDocument);
router.get('/documents/:id', authenticateToken, getDocument);
router.delete('/documents/:id', authenticateToken, authorizeRoles('lab', 'doctor', 'admin'), deleteDocument);

// Lab QC routes
router.get('/lab/qc', authenticateToken, authorizeRoles('lab', 'admin'), getQCResults);
router.get('/lab/qc/summary', authenticateToken, authorizeRoles('lab', 'admin'), getQCSummary);
router.get('/lab/qc/levey-jennings/:test_code', authenticateToken, authorizeRoles('lab', 'admin'), getLeveyJenningsData);
router.post('/lab/qc', authenticateToken, authorizeRoles('lab'), recordQCResult);
router.delete('/lab/qc/:id', authenticateToken, authorizeRoles('lab', 'admin'), deleteQCResult);

// Real-time notification routes (SSE)
router.use('/notifications', notificationRoutes);

// Audit log routes
router.use('/audit', auditRoutes);

// Accountant routes
router.use('/accountant', accountantRoutes);

// Insurance claims routes
router.use('/claims', claimsRoutes);

// Payment reminders routes
router.use('/reminders', reminderRoutes);

// QuickBooks integration routes
router.use('/quickbooks', quickbooksRoutes);

// QuickBooks data routes (for accountant dashboard)
router.use('/qb', qbDataRoutes);

// Drug Interaction Check routes
router.post('/drug-interactions/check', authenticateToken, authorizeRoles('doctor', 'nurse', 'pharmacy', 'pharmacist', 'pharmacy_tech'), async (req, res) => {
  try {
    const { patientId, medication } = req.body;
    const interactions = await drugInteractionService.checkInteractions(patientId, medication);
    res.json({ interactions, hasSevere: interactions.some(i => i.severity === 'severe' || i.severity === 'contraindicated') });
  } catch (error) {
    console.error('Error checking drug interactions:', error);
    res.status(500).json({ error: 'Failed to check drug interactions' });
  }
});

router.post('/drug-interactions/check-multiple', authenticateToken, authorizeRoles('doctor', 'nurse', 'pharmacy', 'pharmacist', 'pharmacy_tech'), async (req, res) => {
  try {
    const { medications } = req.body;
    const interactions = await drugInteractionService.checkMultipleInteractions(medications);
    res.json({ interactions, hasSevere: interactions.some(i => i.severity === 'severe' || i.severity === 'contraindicated') });
  } catch (error) {
    console.error('Error checking drug interactions:', error);
    res.status(500).json({ error: 'Failed to check drug interactions' });
  }
});

router.get('/drug-interactions/:drugName', authenticateToken, async (req, res) => {
  try {
    const drugName = req.params.drugName as string;
    const interactions = await drugInteractionService.getDrugInteractions(drugName);
    res.json({ interactions });
  } catch (error) {
    console.error('Error getting drug interactions:', error);
    res.status(500).json({ error: 'Failed to get drug interactions' });
  }
});

// Lab Results Evaluation routes
router.post('/lab-results/evaluate', authenticateToken, authorizeRoles('lab', 'doctor', 'nurse'), async (req, res) => {
  try {
    const { testName, results, patientGender, patientAge } = req.body;
    const parsed = await labResultsService.evaluateResults(testName, results, patientGender, patientAge);
    res.json({
      ...parsed,
      formattedResults: labResultsService.formatResultsWithStatus(parsed)
    });
  } catch (error) {
    console.error('Error evaluating lab results:', error);
    res.status(500).json({ error: 'Failed to evaluate lab results' });
  }
});

router.get('/lab-results/reference/:testName', authenticateToken, async (req, res) => {
  try {
    const testName = req.params.testName as string;
    const gender = typeof req.query.gender === 'string' ? req.query.gender : undefined;
    const age = typeof req.query.age === 'string' ? parseInt(req.query.age) : undefined;
    const range = await labResultsService.getReferenceRange(
      testName,
      gender,
      age
    );
    res.json({ range });
  } catch (error) {
    console.error('Error getting reference range:', error);
    res.status(500).json({ error: 'Failed to get reference range' });
  }
});

router.get('/lab-results/critical/:orderId', authenticateToken, authorizeRoles('lab', 'doctor'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId as string);
    const hasCritical = await labResultsService.checkCriticalResults(orderId);
    res.json({ hasCritical });
  } catch (error) {
    console.error('Error checking critical results:', error);
    res.status(500).json({ error: 'Failed to check critical results' });
  }
});

// Follow-up appointment routes
router.get('/follow-up/unscheduled', authenticateToken, authorizeRoles('receptionist', 'admin'), getUnscheduledFollowUps);
router.get('/follow-up/stats', authenticateToken, authorizeRoles('receptionist', 'admin'), getFollowUpStats);
router.post('/follow-up/schedule', authenticateToken, authorizeRoles('receptionist', 'admin'), scheduleFollowUp);
router.post('/follow-up/skip', authenticateToken, authorizeRoles('receptionist', 'admin'), skipFollowUp);

// Nurse follow-up call log
router.get('/nurse/call-log/queue', authenticateToken, authorizeRoles('nurse', 'admin'), getFollowUpQueue);
router.post('/nurse/call-log', authenticateToken, authorizeRoles('nurse', 'admin'), logFollowUpCall);
router.get('/nurse/call-log/history', authenticateToken, authorizeRoles('nurse', 'admin'), getCallHistory);

// Nurse follow-up task system (auto follow-ups + doctor-initiated reviews)
router.get('/nurse/follow-up-tasks', authenticateToken, authorizeRoles('nurse', 'admin'), getFollowUpTasks);
router.get('/nurse/follow-up-tasks/due', authenticateToken, authorizeRoles('nurse', 'admin'), getDueTasks);
router.post('/nurse/follow-up-tasks/complete', authenticateToken, authorizeRoles('nurse', 'admin'), completeFollowUpTask);

// Nurse inventory & procurement (head nurse manages procurement, all nurses see stock)
router.get('/nurse/inventory', authenticateToken, authorizeRoles('nurse', 'admin'), getNurseInventory);
router.post('/nurse/inventory', authenticateToken, authorizeRoles('nurse', 'admin'), createNurseInventoryItem);
router.put('/nurse/inventory/:id', authenticateToken, authorizeRoles('nurse', 'admin'), updateNurseInventoryItem);
router.post('/nurse/inventory/purchase', authenticateToken, authorizeRoles('nurse', 'admin'), recordNursePurchase);
router.get('/nurse/inventory/purchases', authenticateToken, authorizeRoles('nurse', 'admin'), getNursePurchases);

// Manual trigger for follow-up reminders (admin only, for testing)
router.post('/follow-up/send-reminders', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await processFollowUpReminders();
    res.json({ message: 'Reminder processing complete', ...result });
  } catch (error) {
    console.error('Error processing follow-up reminders:', error);
    res.status(500).json({ error: 'Failed to process reminders' });
  }
});

export default router;
