import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
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

// All routes require authentication
router.use(authenticateToken);

// CRUD operations
router.post('/', createClaim);
router.get('/', getClaims);
router.get('/pending-review', getClaimsPendingReview);
router.get('/ready-for-submission', getClaimsReadyForSubmission);
router.get('/:id', getClaimById);
router.put('/:id', updateClaim);

// Validation and coverage
router.post('/:id/validate', validateDiagnosis);
router.get('/:id/coverage', checkCoverage);

// Workflow actions
router.post('/:id/submit-for-review', submitForDoctorReview);
router.post('/:id/doctor-approve', doctorApproveClaim);
router.post('/:id/doctor-reject', doctorRejectClaim);
router.post('/:id/submit', submitClaim);
router.put('/:id/status', updateClaimStatus);

export default router;
