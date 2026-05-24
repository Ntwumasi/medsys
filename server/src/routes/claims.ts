import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import {
  createClaim,
  getClaims,
  getClaimById,
  updateClaim,
  validateDiagnosis,
  checkCoverage,
  submitForDoctorReview,
  doctorApproveClaim,
  doctorRejectClaim,
  submitClaim,
  updateClaimStatus,
  getClaimsPendingReview,
  getClaimsReadyForSubmission,
} from '../controllers/claimsController';

const router = Router();

router.use(authenticateToken);

// Anyone in clinical or billing roles can view claims; only doctors can
// approve/reject; only billing roles can submit. Patient is excluded —
// a patient must never be able to approve their own claim.
const CLAIM_VIEWERS = ['admin', 'accountant', 'receptionist', 'doctor', 'nurse'] as const;
const CLAIM_EDITORS = ['admin', 'accountant', 'receptionist'] as const;

// CRUD operations
router.post('/',                       authorizeRoles(...CLAIM_EDITORS), createClaim);
router.get('/',                        authorizeRoles(...CLAIM_VIEWERS), getClaims);
router.get('/pending-review',          authorizeRoles(...CLAIM_VIEWERS), getClaimsPendingReview);
router.get('/ready-for-submission',    authorizeRoles(...CLAIM_VIEWERS), getClaimsReadyForSubmission);
router.get('/:id',                     authorizeRoles(...CLAIM_VIEWERS), getClaimById);
router.put('/:id',                     authorizeRoles(...CLAIM_EDITORS), updateClaim);

// Validation and coverage
router.post('/:id/validate',           authorizeRoles(...CLAIM_EDITORS), validateDiagnosis);
router.get('/:id/coverage',            authorizeRoles(...CLAIM_VIEWERS), checkCoverage);

// Workflow actions — doctor-approve/reject locked to doctor + admin only.
router.post('/:id/submit-for-review',  authorizeRoles(...CLAIM_EDITORS), submitForDoctorReview);
router.post('/:id/doctor-approve',     authorizeRoles('doctor', 'admin'), doctorApproveClaim);
router.post('/:id/doctor-reject',      authorizeRoles('doctor', 'admin'), doctorRejectClaim);
router.post('/:id/submit',             authorizeRoles(...CLAIM_EDITORS), submitClaim);
router.put('/:id/status',              authorizeRoles(...CLAIM_EDITORS), updateClaimStatus);

export default router;
