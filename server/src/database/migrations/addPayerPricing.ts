import pool from '../db';

// ============================================================
// Multi-Payer Pricing Migration
// ============================================================
// Creates payer_price_schedules table, seeds insurance providers,
// updates charge_master with correct GHS cash prices from the
// 2026 price lists, and populates payer-specific rates for
// 6 insurance providers and 2 corporate clients.
// ============================================================

interface ServiceDef {
  code: string;
  name: string;
  category: string;
  price: number; // Cash/self-pay price in GHS
  description?: string;
}

interface PayerPrice {
  service_code: string;
  price: number | null; // null = excluded
  is_excluded: boolean;
}

// ============================================================
// SERVICE DEFINITIONS (Cash/Self-Pay Prices)
// Source: CHARGES_FEE PAYING CLIENTS.xlsx
// ============================================================

const services: ServiceDef[] = [
  // --- REGISTRATION ---
  { code: 'REG-001', name: 'Registration', category: 'registration', price: 100, description: 'Patient registration fee' },

  // --- CONSULTATIONS ---
  { code: 'CONS-PCP', name: 'Primary Care Consultation', category: 'consultation', price: 400, description: 'Primary care physician consultation' },
  { code: 'CONS-GP', name: 'General Practitioner Consult', category: 'consultation', price: 200, description: 'General practitioner consultation' },
  { code: 'CONS-TEL-GP', name: 'Telephone Consult (General Practitioner)', category: 'consultation', price: 200, description: 'Telephone consultation with GP' },
  { code: 'CONS-TEL-PCP', name: 'Telephone Consult (Primary Care)', category: 'consultation', price: 400, description: 'Telephone consultation with PCP' },
  { code: 'CONS-REVIEW', name: 'Review', category: 'consultation', price: 0, description: 'Follow-up review visit (no charge)' },
  { code: 'CONS-DETENTION', name: 'Detention', category: 'consultation', price: 350, description: 'Observation/detention fee' },

  // --- PROCEDURES ---
  { code: 'PROC-DRESS-MINOR', name: 'Wound Dressing - Minor', category: 'procedure', price: 80, description: 'Minor wound dressing' },
  { code: 'PROC-DRESS-MAJOR', name: 'Wound Dressing - Major', category: 'procedure', price: 150, description: 'Major wound dressing' },
  { code: 'PROC-STERISTRIP', name: 'Steristripping', category: 'procedure', price: 80, description: 'Wound closure with steristrips' },
  { code: 'PROC-SUTURE-MINOR', name: 'Wound Suturing (Minor)', category: 'procedure', price: 250, description: 'Minor wound suturing' },
  { code: 'PROC-SUTURE-MAJOR', name: 'Wound Suturing (Major)', category: 'procedure', price: 450, description: 'Major wound suturing' },
  { code: 'PROC-IND', name: 'Incision and Drainage', category: 'procedure', price: 400, description: 'Incision and drainage procedure' },
  { code: 'PROC-STITCH-REM', name: 'Stitch Removal', category: 'procedure', price: 100, description: 'Removal of stitches/sutures' },
  { code: 'PROC-NEBULISATION', name: 'Nebulisation', category: 'procedure', price: 150, description: 'Nebuliser treatment' },
  { code: 'PROC-NEB-CONS', name: 'Consumables for Nebulisation', category: 'procedure', price: 100, description: 'Nebulisation consumables' },
  { code: 'PROC-O2-1HR', name: 'Oxygen (Within 1 Hour)', category: 'procedure', price: 80, description: 'Oxygen therapy up to 1 hour' },
  { code: 'PROC-O2-6HR', name: 'Oxygen (Within 6 Hours)', category: 'procedure', price: 450, description: 'Oxygen therapy up to 6 hours' },
  { code: 'PROC-O2-12HR', name: 'Oxygen (Within 12 Hours)', category: 'procedure', price: 700, description: 'Oxygen therapy up to 12 hours' },
  { code: 'PROC-INJ-CONS', name: 'Consumables for Injection', category: 'procedure', price: 120, description: 'Injection consumables' },

  // --- SPECIALIST CONSULTATIONS ---
  { code: 'SPEC-PHYSICIAN', name: 'Physician Specialist', category: 'consultation', price: 600, description: 'Specialist physician consultation' },
  { code: 'SPEC-PAED', name: 'Paediatrics', category: 'consultation', price: 400, description: 'Paediatric specialist consultation' },
  { code: 'SPEC-OBGYN', name: 'Obstetrics & Gynaecology', category: 'consultation', price: 500, description: 'OB/GYN specialist consultation' },
  { code: 'SPEC-OBGYN-FU', name: 'Obstetrics & Gynaecology - 2nd Visit', category: 'consultation', price: 300, description: 'OB/GYN follow-up visit' },
  { code: 'SPEC-CARDIO', name: 'Cardiology', category: 'consultation', price: 600, description: 'Cardiology specialist consultation' },
  { code: 'SPEC-NEURO', name: 'Neurosurgery', category: 'consultation', price: 800, description: 'Neurosurgery specialist consultation' },
  { code: 'SPEC-OPHTH', name: 'Ophthalmology', category: 'consultation', price: 600, description: 'Ophthalmology specialist consultation' },
  { code: 'SPEC-OPTOM', name: 'Optometrist', category: 'consultation', price: 300, description: 'Optometrist consultation' },
  { code: 'SPEC-PHYSIO', name: 'Physiotherapy', category: 'consultation', price: 250, description: 'Physiotherapy session' },
  { code: 'SPEC-DIET', name: 'Dietician', category: 'consultation', price: 250, description: 'Dietician consultation' },
  { code: 'SPEC-ENT', name: 'Ear, Nose & Throat', category: 'consultation', price: 600, description: 'ENT specialist consultation' },
  { code: 'SPEC-INTMED', name: 'Internal Medicine', category: 'consultation', price: 600, description: 'Internal medicine specialist consultation' },
  { code: 'SPEC-PSYCH', name: 'Psychiatry', category: 'consultation', price: 1000, description: 'Psychiatry specialist consultation' },
  { code: 'SPEC-PSYCHOL', name: 'Psychology Clinic / Psychotherapy', category: 'consultation', price: 600, description: 'Psychology/psychotherapy session' },
  { code: 'SPEC-DERM', name: 'Dermatology', category: 'consultation', price: 600, description: 'Dermatology specialist consultation' },
  { code: 'SPEC-UROL', name: 'Urology', category: 'consultation', price: 600, description: 'Urology specialist consultation' },
  { code: 'SPEC-INFECT', name: 'Infectious Diseases', category: 'consultation', price: 600, description: 'Infectious diseases specialist consultation' },
  { code: 'SPEC-GASTRO', name: 'Gastroenterology', category: 'consultation', price: 600, description: 'Gastroenterology specialist consultation' },
  { code: 'SPEC-ENDO', name: 'Endocrinology', category: 'consultation', price: 600, description: 'Endocrinology specialist consultation' },
  { code: 'SPEC-ORTHO', name: 'Orthopaedics', category: 'consultation', price: 500, description: 'Orthopaedics specialist consultation' },
  { code: 'SPEC-PULM', name: 'Pulmonology', category: 'consultation', price: 600, description: 'Pulmonology specialist consultation' },
  { code: 'SPEC-SURG', name: 'General Surgeon', category: 'consultation', price: 600, description: 'General surgery specialist consultation' },

  // --- DIAGNOSTIC TESTS / IMAGING ---
  { code: 'DIAG-OBS-EARLY', name: 'Obstetric Scan (Early 5-13 Weeks)', category: 'imaging', price: 240, description: 'Early pregnancy obstetric ultrasound' },
  { code: 'DIAG-OBS-LATE', name: 'Late Obstetric Scan (Growth Scan)', category: 'imaging', price: 280, description: 'Late pregnancy growth scan' },
  { code: 'DIAG-ANOM-SINGLE', name: 'Fetal Anomaly Scan (Single)', category: 'imaging', price: 400, description: 'Fetal anomaly scan - singleton' },
  { code: 'DIAG-ANOM-TWINS', name: 'Fetal Anomaly Scan (Twins)', category: 'imaging', price: 600, description: 'Fetal anomaly scan - twins' },
  { code: 'DIAG-ANOM-TRIP', name: 'Fetal Anomaly Scan (Triplets)', category: 'imaging', price: 800, description: 'Fetal anomaly scan - triplets' },
  { code: 'DIAG-TVS', name: 'Transvaginal Scan', category: 'imaging', price: 260, description: 'Transvaginal ultrasound scan' },
  { code: 'DIAG-PELV', name: 'Pelvic Scan', category: 'imaging', price: 240, description: 'Pelvic ultrasound scan' },
  { code: 'DIAG-ABD', name: 'Abdominal Scan', category: 'imaging', price: 240, description: 'Abdominal ultrasound scan' },
  { code: 'DIAG-ABD-PELV', name: 'Abdominal / Pelvic Scan', category: 'imaging', price: 420, description: 'Combined abdominal and pelvic scan' },
  { code: 'DIAG-BREAST', name: 'Breast Scan', category: 'imaging', price: 480, description: 'Breast ultrasound scan' },
  { code: 'DIAG-XR-CHEST', name: 'X-Ray Chest', category: 'imaging', price: 220, description: 'Chest X-ray' },
  { code: 'DIAG-XR-LUMBAR', name: 'X-Ray Lumbar Spine', category: 'imaging', price: 220, description: 'Lumbar spine X-ray' },
  { code: 'DIAG-XR-PELVIS', name: 'X-Ray Pelvis', category: 'imaging', price: 220, description: 'Pelvic X-ray' },
  { code: 'DIAG-ECG', name: 'Electrocardiogram', category: 'imaging', price: 250, description: '12-lead ECG' },
  { code: 'DIAG-ECHO', name: 'Echocardiogram', category: 'imaging', price: 650, description: 'Cardiac echocardiogram' },

  // --- PSYCHOLOGY SESSIONS (from Psychology - Justina Owu-Agyiri sheet) ---
  { code: 'PSYCH-SESSION-2', name: 'Psychology 2nd Session (In Person)', category: 'consultation', price: 450, description: 'Second in-person psychology session' },
  { code: 'PSYCH-SESSION-34', name: 'Psychology 3rd/4th Session (In Person)', category: 'consultation', price: 400, description: 'Third or fourth in-person psychology session' },
  { code: 'PSYCH-VIRTUAL', name: 'Psychology Session (Virtual)', category: 'consultation', price: 380, description: 'Virtual psychology session (2nd-4th)' },
  { code: 'PSYCH-FAM-1', name: 'Family Therapy (First Session)', category: 'consultation', price: 800, description: 'First family therapy session' },
  { code: 'PSYCH-FAM-FU', name: 'Family Therapy (Subsequent Sessions)', category: 'consultation', price: 500, description: 'Subsequent family therapy sessions' },
  { code: 'PSYCH-COUPLE-1', name: 'Couples Therapy (First Session)', category: 'consultation', price: 700, description: 'First couples therapy session' },
  { code: 'PSYCH-COUPLE-FU', name: 'Couples Therapy (Subsequent Sessions)', category: 'consultation', price: 500, description: 'Subsequent couples therapy sessions' },
  { code: 'PSYCH-CHILD', name: 'Psychology (Children Under 18)', category: 'consultation', price: 400, description: 'Psychology session for children under 18' },

  // --- MINOR SURGICAL PROCEDURES ---
  { code: 'SURG-MVE', name: 'Manual Vacuum Evacuation', category: 'procedure', price: 1300, description: 'Manual vacuum evacuation procedure' },
  { code: 'SURG-LUMP', name: 'Removal of Lumps and Bumps', category: 'procedure', price: 600, description: 'Excision of lumps and bumps' },

  // --- HOME VISITS ---
  { code: 'CONS-HOME', name: 'First Patient Home Visit', category: 'consultation', price: 800, description: 'Initial patient home visit' },
];

// ============================================================
// PAYER-SPECIFIC PRICING
// Source: FINAL PRICE LIST_HEALTH INSURANCE & CORPORATE.xlsx
// ============================================================
// null price + is_excluded=true means service is EXCLUDED for that payer.
// Services not listed here fall back to the cash rate.
// Lab tests use MDS Lancet rates uniformly - no overrides needed.
// For range prices (e.g., "50-70"), we use the higher end.
// ============================================================

// --- PREMIER HEALTH INSURANCE ---
const premierPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 80, is_excluded: false },
  { service_code: 'CONS-PCP', price: 150, is_excluded: false },
  { service_code: 'CONS-TEL-GP', price: null, is_excluded: true },
  { service_code: 'CONS-TEL-PCP', price: null, is_excluded: true },
  { service_code: 'CONS-DETENTION', price: 160, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 70, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 90, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 80, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 180, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 200, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 120, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 80, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 450, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 900, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 120, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 250, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 250, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 250, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 330, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 330, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 330, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 250, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 250, is_excluded: false },
  { service_code: 'SPEC-DIET', price: null, is_excluded: true },
  { service_code: 'SPEC-ENT', price: 250, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 250, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 330, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: null, is_excluded: true },
  { service_code: 'SPEC-DERM', price: 250, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 330, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: null, is_excluded: true },
  { service_code: 'SPEC-GASTRO', price: 330, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 330, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 250, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 330, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 250, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 230, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 230, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: null, is_excluded: true },
  { service_code: 'DIAG-ANOM-TWINS', price: null, is_excluded: true },
  { service_code: 'DIAG-ANOM-TRIP', price: null, is_excluded: true },
  { service_code: 'DIAG-TVS', price: 230, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 230, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 150, is_excluded: false },
  { service_code: 'DIAG-ECHO', price: 650, is_excluded: false },
  { service_code: 'SURG-MVE', price: null, is_excluded: true },
  { service_code: 'SURG-LUMP', price: null, is_excluded: true },
];

// --- ACACIA HEALTH INSURANCE ---
const acaciaPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 100, is_excluded: false },
  { service_code: 'CONS-PCP', price: 200, is_excluded: false },
  { service_code: 'CONS-TEL-PCP', price: 0, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 200, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 70, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 80, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 70, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 180, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 220, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 160, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 80, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 480, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 850, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 160, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 350, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 300, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 350, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 350, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 350, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 350, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 380, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 300, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 300, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 350, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 350, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 350, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 350, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 350, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 350, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 350, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 350, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 350, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 350, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 350, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 350, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 250, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 250, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 320, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 480, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 740, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 260, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 260, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 260, is_excluded: false },
  { service_code: 'SURG-MVE', price: 1000, is_excluded: false },
  { service_code: 'SURG-LUMP', price: 580, is_excluded: false },
];

// --- ACE MEDICAL INSURANCE ---
const acePrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 80, is_excluded: false },
  { service_code: 'CONS-PCP', price: 250, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 200, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 65, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 80, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 60, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 170, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 200, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 120, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 70, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 450, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 800, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 150, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 400, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 350, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 350, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 350, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 350, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 400, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 300, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 250, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 280, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 420, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 420, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 420, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 420, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 420, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 420, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 420, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 420, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 420, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 420, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 420, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 420, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 200, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 200, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 300, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 400, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 600, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 200, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 200, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 200, is_excluded: false },
  { service_code: 'SURG-MVE', price: 1250, is_excluded: false },
  { service_code: 'SURG-LUMP', price: 500, is_excluded: false },
];

// --- GLICO HEALTHCARE ---
const glicoPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 80, is_excluded: false },
  { service_code: 'CONS-PCP', price: 280, is_excluded: false },
  { service_code: 'CONS-TEL-PCP', price: 0, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 280, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 60, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 80, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 60, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 150, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 180, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 160, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 80, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 468, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 850, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 160, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 480, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 425, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 510, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 510, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 510, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 510, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 383, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 298, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 298, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 510, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 510, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 510, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 510, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 510, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 510, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 510, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 510, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 510, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 510, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 510, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 510, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 240, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 240, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 320, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 480, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 640, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 240, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 240, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 240, is_excluded: false },
  { service_code: 'SURG-MVE', price: 1120, is_excluded: false },
  { service_code: 'SURG-LUMP', price: 600, is_excluded: false },
];

// --- ORANGE HEALTH INSURANCE ---
const orangePrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 100, is_excluded: false },
  { service_code: 'CONS-PCP', price: 300, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 350, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 70, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 90, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 72, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 180, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 180, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 180, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 100, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 550, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 850, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 180, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 460, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 400, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 460, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 460, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 460, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 400, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 300, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 300, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 300, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 400, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 450, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 450, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 450, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 420, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 300, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 450, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 450, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 450, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 480, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 450, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 450, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 300, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 300, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 400, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 600, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 800, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 300, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 300, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 300, is_excluded: false },
  { service_code: 'SURG-MVE', price: 1300, is_excluded: false },
];

// --- GAB HEALTH INSURANCE ---
const gabPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 80, is_excluded: false },
  { service_code: 'CONS-PCP', price: 180, is_excluded: false },
  { service_code: 'CONS-TEL-PCP', price: 0, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 200, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 80, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 100, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 50, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 220, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 280, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 200, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 85, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 480, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 800, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 100, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 400, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 350, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 350, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 400, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 400, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 400, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 250, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 200, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 250, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 400, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 400, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 350, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 400, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 400, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 400, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 400, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 400, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 400, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 195, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 195, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 260, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 390, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 520, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 195, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 195, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 195, is_excluded: false },
  { service_code: 'SURG-MVE', price: 1000, is_excluded: false },
  { service_code: 'SURG-LUMP', price: 600, is_excluded: false },
];

// --- THE MEAL BOX (Corporate) ---
const mealBoxPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 120, is_excluded: false },
  { service_code: 'CONS-PCP', price: 225, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 250, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 80, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 150, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 80, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 180, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 200, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 150, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 80, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 450, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 700, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 120, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 600, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 500, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 600, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 600, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 800, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 600, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 450, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 250, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 250, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 600, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 600, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 1000, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 600, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 600, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 600, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 600, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 600, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 600, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 600, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 600, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 600, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 240, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 280, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 400, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 600, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 800, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 260, is_excluded: false },
  { service_code: 'DIAG-PELV', price: 240, is_excluded: false },
  { service_code: 'DIAG-ABD', price: 240, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 420, is_excluded: false },
  { service_code: 'DIAG-BREAST', price: 480, is_excluded: false },
  { service_code: 'DIAG-XR-CHEST', price: 220, is_excluded: false },
  { service_code: 'DIAG-XR-LUMBAR', price: 220, is_excluded: false },
  { service_code: 'DIAG-XR-PELVIS', price: 220, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 250, is_excluded: false },
  { service_code: 'DIAG-ECHO', price: 726, is_excluded: false },
];

// --- BIGPAY GHANA LTD (Corporate) ---
// Same rates as Meal Box
const bigpayPrices: PayerPrice[] = [
  { service_code: 'REG-001', price: 120, is_excluded: false },
  { service_code: 'CONS-PCP', price: 225, is_excluded: false },
  { service_code: 'CONS-DETENTION', price: 250, is_excluded: false },
  { service_code: 'PROC-DRESS-MINOR', price: 80, is_excluded: false },
  { service_code: 'PROC-DRESS-MAJOR', price: 150, is_excluded: false },
  { service_code: 'PROC-STERISTRIP', price: 80, is_excluded: false },
  { service_code: 'PROC-SUTURE-MINOR', price: 180, is_excluded: false },
  { service_code: 'PROC-SUTURE-MAJOR', price: 200, is_excluded: false },
  { service_code: 'PROC-NEBULISATION', price: 150, is_excluded: false },
  { service_code: 'PROC-O2-1HR', price: 80, is_excluded: false },
  { service_code: 'PROC-O2-6HR', price: 450, is_excluded: false },
  { service_code: 'PROC-O2-12HR', price: 700, is_excluded: false },
  { service_code: 'PROC-INJ-CONS', price: 120, is_excluded: false },
  { service_code: 'SPEC-PHYSICIAN', price: 600, is_excluded: false },
  { service_code: 'SPEC-PAED', price: 500, is_excluded: false },
  { service_code: 'SPEC-OBGYN', price: 600, is_excluded: false },
  { service_code: 'SPEC-CARDIO', price: 600, is_excluded: false },
  { service_code: 'SPEC-NEURO', price: 800, is_excluded: false },
  { service_code: 'SPEC-OPHTH', price: 600, is_excluded: false },
  { service_code: 'SPEC-OPTOM', price: 450, is_excluded: false },
  { service_code: 'SPEC-PHYSIO', price: 250, is_excluded: false },
  { service_code: 'SPEC-DIET', price: 250, is_excluded: false },
  { service_code: 'SPEC-ENT', price: 600, is_excluded: false },
  { service_code: 'SPEC-INTMED', price: 600, is_excluded: false },
  { service_code: 'SPEC-PSYCH', price: 1000, is_excluded: false },
  { service_code: 'SPEC-PSYCHOL', price: 600, is_excluded: false },
  { service_code: 'SPEC-DERM', price: 600, is_excluded: false },
  { service_code: 'SPEC-UROL', price: 600, is_excluded: false },
  { service_code: 'SPEC-INFECT', price: 600, is_excluded: false },
  { service_code: 'SPEC-GASTRO', price: 600, is_excluded: false },
  { service_code: 'SPEC-ENDO', price: 600, is_excluded: false },
  { service_code: 'SPEC-ORTHO', price: 600, is_excluded: false },
  { service_code: 'SPEC-PULM', price: 600, is_excluded: false },
  { service_code: 'SPEC-SURG', price: 600, is_excluded: false },
  { service_code: 'DIAG-OBS-EARLY', price: 240, is_excluded: false },
  { service_code: 'DIAG-OBS-LATE', price: 280, is_excluded: false },
  { service_code: 'DIAG-ANOM-SINGLE', price: 400, is_excluded: false },
  { service_code: 'DIAG-ANOM-TWINS', price: 600, is_excluded: false },
  { service_code: 'DIAG-ANOM-TRIP', price: 800, is_excluded: false },
  { service_code: 'DIAG-TVS', price: 260, is_excluded: false },
  { service_code: 'DIAG-PELV', price: 240, is_excluded: false },
  { service_code: 'DIAG-ABD', price: 240, is_excluded: false },
  { service_code: 'DIAG-ABD-PELV', price: 420, is_excluded: false },
  { service_code: 'DIAG-BREAST', price: 480, is_excluded: false },
  { service_code: 'DIAG-XR-CHEST', price: 220, is_excluded: false },
  { service_code: 'DIAG-XR-LUMBAR', price: 220, is_excluded: false },
  { service_code: 'DIAG-XR-PELVIS', price: 220, is_excluded: false },
  { service_code: 'DIAG-ECG', price: 250, is_excluded: false },
  { service_code: 'DIAG-ECHO', price: 726, is_excluded: false },
];

// ============================================================
// Old placeholder service codes to deactivate
// (replaced by correct codes above)
// ============================================================
const oldCodesToDeactivate = [
  'CONS-NEW', 'CONS-FU', 'CONS-ER',
  'LAB-CBC', 'LAB-CMP', 'LAB-LIPID', 'LAB-UA', 'LAB-GLUC',
  'LAB-A1C', 'LAB-LFT', 'LAB-KFT', 'LAB-TFT', 'LAB-MAL',
  'LAB-HIV', 'LAB-HEP',
  'IMG-XR-CHEST', 'IMG-XR-ABD', 'IMG-XR-EXT', 'IMG-XR-SPINE',
  'IMG-US-ABD', 'IMG-US-PELV', 'IMG-US-OB',
  'IMG-ECG',
  'PROC-DRESS-S', 'PROC-DRESS-C', 'PROC-SUTURE-S', 'PROC-SUTURE-C',
  'PROC-NEB', 'PROC-INJ', 'PROC-BP',
];

// ============================================================
// MIGRATION FUNCTION
// ============================================================

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // -------------------------------------------------------
    // STEP 1: Seed missing insurance providers
    // -------------------------------------------------------
    console.log('Seeding insurance providers...');
    const insuranceProviders = [
      'Premier Health Insurance',
      'Acacia Health Insurance',
      'ACE Medical Insurance',
      'GLICO Healthcare',
      'Orange Health Insurance',
      'GAB Health Insurance',
    ];

    for (const name of insuranceProviders) {
      await client.query(
        `INSERT INTO insurance_providers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name]
      );
    }

    // -------------------------------------------------------
    // STEP 2: Create payer_price_schedules table
    // -------------------------------------------------------
    console.log('Creating payer_price_schedules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payer_price_schedules (
        id SERIAL PRIMARY KEY,
        charge_master_id INTEGER NOT NULL REFERENCES charge_master(id) ON DELETE CASCADE,
        payer_type VARCHAR(20) NOT NULL CHECK (payer_type IN ('insurance', 'corporate')),
        insurance_provider_id INTEGER REFERENCES insurance_providers(id),
        corporate_client_id INTEGER REFERENCES corporate_clients(id),
        price DECIMAL(10, 2),
        is_excluded BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_payer_schedule CHECK (
          (payer_type = 'insurance' AND insurance_provider_id IS NOT NULL AND corporate_client_id IS NULL) OR
          (payer_type = 'corporate' AND corporate_client_id IS NOT NULL AND insurance_provider_id IS NULL)
        )
      )
    `);

    // Partial unique indexes (handles NULLs correctly)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pps_insurance_unique
      ON payer_price_schedules(charge_master_id, insurance_provider_id)
      WHERE payer_type = 'insurance'
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pps_corporate_unique
      ON payer_price_schedules(charge_master_id, corporate_client_id)
      WHERE payer_type = 'corporate'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pps_charge_master
      ON payer_price_schedules(charge_master_id)
    `);

    // -------------------------------------------------------
    // STEP 3: Deactivate old placeholder entries
    // -------------------------------------------------------
    console.log('Deactivating old placeholder entries...');
    for (const code of oldCodesToDeactivate) {
      await client.query(
        `UPDATE charge_master SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE service_code = $1`,
        [code]
      );
    }

    // -------------------------------------------------------
    // STEP 4: Upsert services with correct cash prices
    // -------------------------------------------------------
    console.log('Upserting services with correct cash prices...');
    for (const svc of services) {
      await client.query(
        `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (service_code) DO UPDATE SET
           service_name = EXCLUDED.service_name,
           price = EXCLUDED.price,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           is_active = true,
           updated_at = CURRENT_TIMESTAMP`,
        [svc.name, svc.code, svc.category, svc.price, svc.description || null]
      );
    }
    console.log(`  Upserted ${services.length} services`);

    // -------------------------------------------------------
    // STEP 5: Populate payer-specific prices
    // -------------------------------------------------------
    console.log('Populating payer-specific prices...');

    const payerConfigs: Array<{
      name: string;
      type: 'insurance' | 'corporate';
      prices: PayerPrice[];
    }> = [
      { name: 'Premier Health Insurance', type: 'insurance', prices: premierPrices },
      { name: 'Acacia Health Insurance', type: 'insurance', prices: acaciaPrices },
      { name: 'ACE Medical Insurance', type: 'insurance', prices: acePrices },
      { name: 'GLICO Healthcare', type: 'insurance', prices: glicoPrices },
      { name: 'Orange Health Insurance', type: 'insurance', prices: orangePrices },
      { name: 'GAB Health Insurance', type: 'insurance', prices: gabPrices },
      { name: 'The Meal Box', type: 'corporate', prices: mealBoxPrices },
      { name: 'Bigpay Ghana Ltd', type: 'corporate', prices: bigpayPrices },
    ];

    for (const payer of payerConfigs) {
      // Look up payer ID
      let payerId: number;
      if (payer.type === 'insurance') {
        const result = await client.query(
          `SELECT id FROM insurance_providers WHERE name = $1`,
          [payer.name]
        );
        if (result.rows.length === 0) {
          console.error(`  Insurance provider not found: ${payer.name}`);
          continue;
        }
        payerId = result.rows[0].id;
      } else {
        const result = await client.query(
          `SELECT id FROM corporate_clients WHERE name = $1`,
          [payer.name]
        );
        if (result.rows.length === 0) {
          console.error(`  Corporate client not found: ${payer.name}`);
          continue;
        }
        payerId = result.rows[0].id;
      }

      let insertedCount = 0;
      for (const pp of payer.prices) {
        // Look up charge_master_id by service_code
        const chargeResult = await client.query(
          `SELECT id FROM charge_master WHERE service_code = $1`,
          [pp.service_code]
        );

        if (chargeResult.rows.length === 0) {
          console.error(`  Charge not found for code: ${pp.service_code}`);
          continue;
        }

        const chargeId = chargeResult.rows[0].id;

        if (payer.type === 'insurance') {
          await client.query(
            `INSERT INTO payer_price_schedules
              (charge_master_id, payer_type, insurance_provider_id, price, is_excluded)
             VALUES ($1, 'insurance', $2, $3, $4)
             ON CONFLICT (charge_master_id, insurance_provider_id) WHERE payer_type = 'insurance'
             DO UPDATE SET
               price = EXCLUDED.price,
               is_excluded = EXCLUDED.is_excluded,
               updated_at = CURRENT_TIMESTAMP`,
            [chargeId, payerId, pp.price, pp.is_excluded]
          );
        } else {
          await client.query(
            `INSERT INTO payer_price_schedules
              (charge_master_id, payer_type, corporate_client_id, price, is_excluded)
             VALUES ($1, 'corporate', $2, $3, $4)
             ON CONFLICT (charge_master_id, corporate_client_id) WHERE payer_type = 'corporate'
             DO UPDATE SET
               price = EXCLUDED.price,
               is_excluded = EXCLUDED.is_excluded,
               updated_at = CURRENT_TIMESTAMP`,
            [chargeId, payerId, pp.price, pp.is_excluded]
          );
        }
        insertedCount++;
      }
      console.log(`  ${payer.name}: ${insertedCount} price overrides`);
    }

    await client.query('COMMIT');

    // Print summary
    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM charge_master WHERE is_active = true) as active_services,
        (SELECT COUNT(*) FROM charge_master WHERE is_active = false) as inactive_services,
        (SELECT COUNT(*) FROM payer_price_schedules) as price_overrides,
        (SELECT COUNT(*) FROM insurance_providers) as insurance_providers,
        (SELECT COUNT(*) FROM corporate_clients) as corporate_clients
    `);
    console.log('\n=== Migration Summary ===');
    console.log(summary.rows[0]);
    console.log('Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
