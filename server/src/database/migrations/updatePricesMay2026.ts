import pool from '../db';

/**
 * May 2026 Price Update Migration
 *
 * Sources:
 *   1. CHARGES_FEE PAYING CLIENTS.xlsx → charge_master (cash/self-pay prices)
 *   2. FINAL PRICE LIST_HEALTH INSURANCE & CORPORATE.xlsx → payer_price_schedules
 *   3. LAB-UPDATED PRICE LIST 2026.docx → lab_test_catalog base_price
 *
 * Strategy:
 *   - charge_master: match by UPPER(service_name), update price
 *   - payer_price_schedules: match charge_master_id + payer, upsert price or exclusion
 *   - lab_test_catalog: match by test_code or UPPER(test_name), update base_price
 */

// ──────────────────────────────────────────────
// 1. CASH CLIENT PRICES (charge_master updates)
// ──────────────────────────────────────────────
const CASH_PRICES: Array<{ service: string; price: number }> = [
  { service: 'REGISTRATION', price: 100 },
  { service: 'PRIMARY CARE CONSULTATION', price: 400 },
  { service: 'GENERAL PRACTITIONER CONSULT', price: 200 },
  { service: 'TELEPHONE CONSULT (GENERAL PRACTIONER', price: 200 },
  { service: 'TELEPHONE CONSULT (PRIMARY CARE)', price: 400 },
  { service: 'REVIEW', price: 0 },
  { service: 'DETENTION', price: 350 },
  { service: 'WOUND DRESSING - MINOR', price: 80 },
  { service: 'WOUND DRESSING - MAJOR', price: 150 },
  { service: 'STERISTRIPPING', price: 80 },
  { service: 'WOUND SUTURING (MINOR)', price: 250 },
  { service: 'WOUND SUTURING (MAJOR)', price: 450 },
  { service: 'INCISION AND DRAINAGE', price: 400 },
  { service: 'STITCH REMOVAL', price: 100 },
  { service: 'NEBULISATION', price: 150 },
  { service: 'CONSUMABLES FOR NEBULISATION', price: 100 },
  { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
  { service: 'OXYGEN (WITHIN 6 HOURS)', price: 450 },
  { service: 'OXYGEN (WITHIN 12 HOURS)', price: 700 },
  { service: 'CONSUMABLES FOR INJECTION', price: 120 },
  { service: 'PHYSICIAN SPECIALIST', price: 600 },
  { service: 'PAEDIATRICS', price: 400 },
  { service: 'OBSTETRICS & GYNECOLOGY', price: 500 },
  { service: 'OBSTETRICS & GYNECOLOGY - 2ND VISIT', price: 300 },
  { service: 'CARDIOLOGY', price: 600 },
  { service: 'NEUROSURGERY', price: 800 },
  { service: 'OPHTHALMOLOGY', price: 600 },
  { service: 'OPTOMETRIST', price: 300 },
  { service: 'PHYSIOTHERAPY', price: 250 },
  { service: 'DIETICIAN', price: 250 },
  { service: 'EAR, NOSE & THROAT', price: 600 },
  { service: 'INTERNAL MEDICINE', price: 600 },
  { service: 'PSYCHIATRY', price: 1000 },
  { service: 'PSYCHOLOGY CLINIC', price: 600 },
  { service: 'DERMATOLOGY', price: 600 },
  { service: 'UROLOGY', price: 600 },
  { service: 'INFECTIOUS DISEASES', price: 600 },
  { service: 'GASTROENTEROLOGY', price: 600 },
  { service: 'ENDOCRINOLOGY', price: 600 },
  { service: 'ORTHOPAEDICS', price: 500 },
  { service: 'PULMONOLOGY', price: 600 },
  { service: 'GENERAL SURGEON', price: 600 },
  { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 240 },
  { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 280 },
  { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 400 },
  { service: 'FETAL ANOMALY SCAN (TWINS)', price: 600 },
  { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 800 },
  { service: 'TRANSVAGINAL SCAN', price: 260 },
  { service: 'PELVIC SCAN', price: 240 },
  { service: 'ABDOMINAL SCAN', price: 240 },
  { service: 'ABDOMINAL / PELVIC SCAN', price: 420 },
  { service: 'BREAST SCAN', price: 480 },
  { service: 'X-RAY CHEST', price: 220 },
  { service: 'X-RAY LUMBAR SPINE', price: 220 },
  { service: 'X-RAY PELVIS', price: 220 },
  { service: 'ELECTROCARDIOGRAM', price: 250 },
  { service: 'ECHOCARDIOGRAM', price: 650 },
];

// Psychology clinic extras (from sheet 2)
const PSYCHOLOGY_PRICES: Array<{ service: string; price: number }> = [
  { service: 'SECOND SESSION - IN PERSON', price: 450 },
  { service: 'SECOND SESSION - ONLINE', price: 350 },
  { service: 'COUPLES THERAPY (FIRST SESSION)', price: 700 },
  { service: 'COUPLES THERAPY (SUBSEQUENT SESSIONS)', price: 500 },
  { service: 'FAMILY THERAPY (FIRST SESSION)', price: 800 },
  { service: 'FAMILY THERAPY (SUBSEQUENT SESSIONS)', price: 500 },
  { service: 'FIRST PATIENT HOME VISIT', price: 800 },
  { service: 'SUBSEQUENT HOME VISITS', price: 500 },
];

// ──────────────────────────────────────────────
// 2. INSURANCE & CORPORATE PRICES
// ──────────────────────────────────────────────
// Map sheet names → payer config
const PAYER_MAP: Record<string, { type: 'insurance' | 'corporate'; id: number }> = {
  'PREMIER':    { type: 'insurance', id: 1 },
  'ACACIA':     { type: 'insurance', id: 3 },
  'ACE':        { type: 'insurance', id: 4 },
  'GLICO':      { type: 'insurance', id: 5 },
  'ORANGE':     { type: 'insurance', id: 6 },
  'GAB HEALTH': { type: 'insurance', id: 7 },
  'MEAL BOX':   { type: 'corporate', id: 1 },
  'BIGPAY':     { type: 'corporate', id: 2 },
};

type PayerEntry = { service: string; price: number | 'EXCLUSION' };

const INSURANCE_PRICES: Record<string, PayerEntry[]> = {
  'PREMIER': [
    { service: 'REGISTRATION', price: 80 },
    { service: 'PRIMARY CARE CONSULTATION', price: 150 },
    { service: 'TELEPHONE REVIEW', price: 'EXCLUSION' },
    { service: 'DETENTION', price: 160 },
    { service: 'WOUND DRESSING - MINOR', price: 70 },
    { service: 'WOUND DRESSING - MAJOR', price: 90 },
    { service: 'STERISTRIPPING', price: 80 },
    { service: 'WOUND SUTURING (MINOR)', price: 180 },
    { service: 'WOUND SUTURING (MAJOR)', price: 200 },
    { service: 'NEBULISATION', price: 120 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 450 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 900 },
    { service: 'CONSUMABLES FOR INJECTION', price: 120 },
    { service: 'PHYSICIAN SPECIALIST', price: 250 },
    { service: 'PAEDIATRICS', price: 250 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 250 },
    { service: 'CARDIOLOGY', price: 330 },
    { service: 'NEUROSURGERY', price: 330 },
    { service: 'OPHTHALMOLOGY', price: 330 },
    { service: 'OPTOMETRIST', price: 250 },
    { service: 'PHYSIOTHERAPY', price: 250 },
    { service: 'DIETICIAN', price: 'EXCLUSION' },
    { service: 'EAR, NOSE & THROAT', price: 250 },
    { service: 'INTERNAL MEDICINE', price: 250 },
    { service: 'PSYCHIATRY', price: 330 },
    { service: 'PSYCHOTHERAPY', price: 'EXCLUSION' },
    { service: 'DERMATOLOGY', price: 250 },
    { service: 'UROLOGY', price: 330 },
    { service: 'INFECTIOUS DISEASES', price: 'EXCLUSION' },
    { service: 'GASTROENTEROLOGY', price: 330 },
    { service: 'ENDOCRINOLOGY', price: 330 },
    { service: 'ORTHOPAEDICS', price: 250 },
    { service: 'PULMONOLOGY', price: 330 },
    { service: 'GENERAL SURGEON', price: 250 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 230 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 230 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 'EXCLUSION' },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 'EXCLUSION' },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 'EXCLUSION' },
    { service: 'TRANSVAGINAL SCAN', price: 230 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 230 },
    { service: 'ELECTROCARDIOGRAM', price: 150 },
    { service: 'ECHOCARDIOGRAM', price: 650 },
  ],
  'ACACIA': [
    { service: 'REGISTRATION', price: 100 },
    { service: 'PRIMARY CARE CONSULTATION', price: 200 },
    { service: 'TELEPHONE REVIEW', price: 0 },
    { service: 'DETENTION', price: 200 },
    { service: 'STERISTRIPPING', price: 70 },
    { service: 'NEBULISATION', price: 160 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 480 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 850 },
    { service: 'CONSUMABLES FOR INJECTION', price: 160 },
    { service: 'PHYSICIAN SPECIALIST', price: 350 },
    { service: 'PAEDIATRICS', price: 300 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 350 },
    { service: 'CARDIOLOGY', price: 350 },
    { service: 'NEUROSURGERY', price: 350 },
    { service: 'OPHTHALMOLOGY', price: 350 },
    { service: 'OPTOMETRIST', price: 380 },
    { service: 'PHYSIOTHERAPY', price: 300 },
    { service: 'DIETICIAN', price: 300 },
    { service: 'EAR, NOSE & THROAT', price: 350 },
    { service: 'INTERNAL MEDICINE', price: 350 },
    { service: 'PSYCHIATRY', price: 350 },
    { service: 'PSYCHOTHERAPY', price: 350 },
    { service: 'DERMATOLOGY', price: 350 },
    { service: 'UROLOGY', price: 350 },
    { service: 'INFECTIOUS DISEASES', price: 350 },
    { service: 'GASTROENTEROLOGY', price: 350 },
    { service: 'ENDOCRINOLOGY', price: 350 },
    { service: 'ORTHOPAEDICS', price: 350 },
    { service: 'PULMONOLOGY', price: 350 },
    { service: 'GENERAL SURGERY', price: 350 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 250 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 250 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 320 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 480 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 740 },
    { service: 'TRANSVAGINAL SCAN', price: 260 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 260 },
    { service: 'ELECTROCARDIOGRAM', price: 260 },
    { service: 'MANUAL VACUUM EVACUATION', price: 1000 },
  ],
  'ACE': [
    { service: 'REGISTRATION', price: 80 },
    { service: 'PRIMARY CARE CONSULTATION', price: 250 },
    { service: 'DETENTION', price: 200 },
    { service: 'STERISTRIPPING', price: 60 },
    { service: 'NEBULISATION', price: 120 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 70 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 450 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 800 },
    { service: 'CONSUMABLES FOR INJECTION', price: 150 },
    { service: 'PHYSICIAN SPECIALIST', price: 400 },
    { service: 'PAEDIATRICS', price: 350 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 350 },
    { service: 'CARDIOLOGY', price: 350 },
    { service: 'NEUROSURGERY', price: 350 },
    { service: 'OPHTHALMOLOGY', price: 400 },
    { service: 'OPTOMETRIST', price: 300 },
    { service: 'PHYSIOTHERAPY', price: 250 },
    { service: 'DIETICIAN', price: 280 },
    { service: 'EAR, NOSE & THROAT', price: 420 },
    { service: 'INTERNAL MEDICINE', price: 420 },
    { service: 'PSYCHIATRY', price: 420 },
    { service: 'PSYCHOTHERAPY', price: 420 },
    { service: 'DERMATOLOGY', price: 420 },
    { service: 'UROLOGY', price: 420 },
    { service: 'INFECTIOUS DISEASES', price: 420 },
    { service: 'GASTROENTEROLOGY', price: 420 },
    { service: 'ENDOCRINOLOGY', price: 420 },
    { service: 'ORTHOPAEDICS', price: 420 },
    { service: 'PULMONOLOGY', price: 420 },
    { service: 'GENERAL SURGERY', price: 420 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 200 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 200 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 300 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 400 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 600 },
    { service: 'TRANSVAGINAL SCAN', price: 200 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 200 },
    { service: 'ELECTROCARDIOGRAM', price: 200 },
    { service: 'MANUAL VACUUM EVACUATION', price: 1250 },
    { service: 'REMOVAL OF LUMPS AND BUMPS', price: 500 },
  ],
  'GLICO': [
    { service: 'REGISTRATION', price: 80 },
    { service: 'PRIMARY CARE CONSULTATION', price: 280 },
    { service: 'TELEPHONE REVIEW', price: 0 },
    { service: 'DETENTION', price: 280 },
    { service: 'WOUND DRESSING - MINOR', price: 60 },
    { service: 'WOUND DRESSING - MAJOR', price: 80 },
    { service: 'STERISTRIPPING', price: 60 },
    { service: 'WOUND SUTURING (MINOR)', price: 150 },
    { service: 'WOUND SUTURING (MAJOR)', price: 180 },
    { service: 'NEBULISATION', price: 160 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 468 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 850 },
    { service: 'CONSUMABLES FOR INJECTION', price: 160 },
    { service: 'PHYSICIAN SPECIALIST', price: 480 },
    { service: 'PAEDIATRICS', price: 425 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 510 },
    { service: 'CARDIOLOGY', price: 510 },
    { service: 'NEUROSURGERY', price: 510 },
    { service: 'OPHTHALMOLOGY', price: 510 },
    { service: 'OPTOMETRIST', price: 383 },
    { service: 'PHYSIOTHERAPY', price: 298 },
    { service: 'DIETICIAN', price: 298 },
    { service: 'EAR, NOSE & THROAT', price: 510 },
    { service: 'INTERNAL MEDICINE', price: 510 },
    { service: 'PSYCHIATRY', price: 510 },
    { service: 'PSYCHOTHERAPY', price: 510 },
    { service: 'DERMATOLOGY', price: 510 },
    { service: 'UROLOGY', price: 510 },
    { service: 'INFECTIOUS DISEASES', price: 510 },
    { service: 'GASTROENTEROLOGY', price: 510 },
    { service: 'ENDOCRINOLOGY', price: 510 },
    { service: 'ORTHOPAEDICS', price: 510 },
    { service: 'PULMONOLOGY', price: 510 },
    { service: 'GENERAL SURGERY', price: 510 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 240 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 240 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 320 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 480 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 640 },
    { service: 'TRANSVAGINAL SCAN', price: 240 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 240 },
    { service: 'ELECTROCARDIOGRAM', price: 240 },
    { service: 'MANUAL VACUUM EVACUATION', price: 1120 },
  ],
  'ORANGE': [
    { service: 'REGISTRATION', price: 100 },
    { service: 'PRIMARY CARE CONSULTATION', price: 300 },
    { service: 'DETENTION', price: 350 },
    { service: 'STERISTRIPPING', price: 72 },
    { service: 'WOUND SUTURING (MAJOR)', price: 180 },
    { service: 'NEBULISATION', price: 180 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 100 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 550 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 850 },
    { service: 'CONSUMABLES FOR INJECTION', price: 180 },
    { service: 'PHYSICIAN SPECIALIST', price: 460 },
    { service: 'PAEDIATRICS', price: 400 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 460 },
    { service: 'CARDIOLOGY', price: 460 },
    { service: 'NEUROSURGERY', price: 460 },
    { service: 'OPHTHALMOLOGY', price: 400 },
    { service: 'OPTOMETRIST', price: 300 },
    { service: 'PHYSIOTHERAPY', price: 300 },
    { service: 'DIETICIAN', price: 300 },
    { service: 'EAR, NOSE & THROAT', price: 400 },
    { service: 'INTERNAL MEDICINE', price: 450 },
    { service: 'PSYCHIATRY', price: 450 },
    { service: 'PSYCHOTHERAPY', price: 450 },
    { service: 'DERMATOLOGY', price: 420 },
    { service: 'UROLOGY', price: 300 },
    { service: 'INFECTIOUS DISEASES', price: 450 },
    { service: 'GASTROENTEROLOGY', price: 450 },
    { service: 'ENDOCRINOLOGY', price: 450 },
    { service: 'ORTHOPAEDICS', price: 480 },
    { service: 'PULMONOLOGY', price: 450 },
    { service: 'GENERAL SURGERY', price: 450 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 300 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 300 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 400 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 600 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 800 },
    { service: 'TRANSVAGINAL SCAN', price: 300 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 300 },
    { service: 'ELECTROCARDIOGRAM', price: 300 },
    { service: 'MANUAL VACUUM EVACUATION', price: 1300 },
  ],
  'GAB HEALTH': [
    { service: 'REGISTRATION', price: 80 },
    { service: 'PRIMARY CARE CONSULTATION', price: 180 },
    { service: 'TELEPHONE REVIEW', price: 0 },
    { service: 'DETENTION', price: 200 },
    { service: 'STERISTRIPPING', price: 50 },
    { service: 'NEBULISATION', price: 200 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 85 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 480 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 800 },
    { service: 'CONSUMABLES FOR INJECTION', price: 100 },
    { service: 'PHYSICIAN SPECIALIST', price: 400 },
    { service: 'PAEDIATRICS', price: 350 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 350 },
    { service: 'CARDIOLOGY', price: 400 },
    { service: 'NEUROSURGERY', price: 400 },
    { service: 'OPHTHALMOLOGY', price: 400 },
    { service: 'OPTOMETRIST', price: 250 },
    { service: 'PHYSIOTHERAPY', price: 200 },
    { service: 'DIETICIAN', price: 250 },
    { service: 'EAR, NOSE & THROAT', price: 400 },
    { service: 'INTERNAL MEDICINE', price: 400 },
    { service: 'DERMATOLOGY', price: 350 },
    { service: 'UROLOGY', price: 400 },
    { service: 'GASTROENTEROLOGY', price: 400 },
    { service: 'ENDOCRINOLOGY', price: 400 },
    { service: 'ORTHOPAEDICS', price: 400 },
    { service: 'PULMONOLOGY', price: 400 },
    { service: 'GENERAL SURGERY', price: 400 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 195 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 195 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 260 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 390 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 520 },
    { service: 'TRANSVAGINAL SCAN', price: 195 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 195 },
    { service: 'ELECTROCARDIOGRAM', price: 195 },
    { service: 'MANUAL VACUUM EVACUATION', price: 1000 },
    { service: 'REMOVAL OF LUMPS AND BUMPS', price: 600 },
  ],
  'MEAL BOX': [
    { service: 'REGISTRATION', price: 120 },
    { service: 'PRIMARY CARE CONSULTATION', price: 225 },
    { service: 'DETENTION', price: 250 },
    { service: 'WOUND DRESSING - MINOR', price: 80 },
    { service: 'WOUND DRESSING - MAJOR', price: 150 },
    { service: 'STERISTRIPPING', price: 80 },
    { service: 'WOUND SUTURING (MINOR)', price: 180 },
    { service: 'WOUND SUTURING (MAJOR)', price: 200 },
    { service: 'NEBULISATION', price: 150 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 450 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 700 },
    { service: 'CONSUMABLES FOR INJECTION', price: 120 },
    { service: 'PHYSICIAN SPECIALIST', price: 600 },
    { service: 'PAEDIATRICS', price: 500 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 600 },
    { service: 'CARDIOLOGY', price: 600 },
    { service: 'NEUROSURGERY', price: 800 },
    { service: 'OPHTHALMOLOGY', price: 600 },
    { service: 'OPTOMETRIST', price: 450 },
    { service: 'PHYSIOTHERAPY', price: 250 },
    { service: 'DIETICIAN', price: 250 },
    { service: 'EAR, NOSE & THROAT', price: 600 },
    { service: 'INTERNAL MEDICINE', price: 600 },
    { service: 'PSYCHIATRY', price: 1000 },
    { service: 'PSYCHOTHERAPY', price: 600 },
    { service: 'DERMATOLOGY', price: 600 },
    { service: 'UROLOGY', price: 600 },
    { service: 'INFECTIOUS DISEASES', price: 600 },
    { service: 'GASTROENTEROLOGY', price: 600 },
    { service: 'ENDOCRINOLOGY', price: 600 },
    { service: 'ORTHOPAEDICS', price: 600 },
    { service: 'PULMONOLOGY', price: 600 },
    { service: 'GENERAL SURGEON', price: 600 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 240 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 280 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 400 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 600 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 800 },
    { service: 'TRANSVAGINAL SCAN', price: 260 },
    { service: 'PELVIC SCAN', price: 240 },
    { service: 'ABDOMINAL SCAN', price: 240 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 420 },
    { service: 'BREAST SCAN', price: 480 },
    { service: 'X-RAY CHEST', price: 220 },
    { service: 'X-RAY LUMBAR SPINE', price: 220 },
    { service: 'X-RAY PELVIS', price: 220 },
    { service: 'ELECTROCARDIOGRAM', price: 250 },
    { service: 'ECHOCARDIOGRAM', price: 726 },
  ],
  'BIGPAY': [
    { service: 'REGISTRATION', price: 120 },
    { service: 'PRIMARY CARE CONSULTATION', price: 225 },
    { service: 'DETENTION', price: 250 },
    { service: 'WOUND DRESSING - MINOR', price: 80 },
    { service: 'WOUND DRESSING - MAJOR', price: 150 },
    { service: 'STERISTRIPPING', price: 80 },
    { service: 'WOUND SUTURING (MINOR)', price: 180 },
    { service: 'WOUND SUTURING (MAJOR)', price: 200 },
    { service: 'NEBULISATION', price: 150 },
    { service: 'OXYGEN (WITHIN 1 HOUR)', price: 80 },
    { service: 'OXYGEN (WITHIN 6 HOURS)', price: 450 },
    { service: 'OXYGEN (WITHIN 12 HOURS)', price: 700 },
    { service: 'CONSUMABLES FOR INJECTION', price: 120 },
    { service: 'PHYSICIAN SPECIALIST', price: 600 },
    { service: 'PAEDIATRICS', price: 500 },
    { service: 'OBSTETRICS & GYNAECOLOGY', price: 600 },
    { service: 'CARDIOLOGY', price: 600 },
    { service: 'NEUROSURGERY', price: 800 },
    { service: 'OPHTHALMOLOGY', price: 600 },
    { service: 'OPTOMETRIST', price: 450 },
    { service: 'PHYSIOTHERAPY', price: 250 },
    { service: 'DIETICIAN', price: 250 },
    { service: 'EAR, NOSE & THROAT', price: 600 },
    { service: 'INTERNAL MEDICINE', price: 600 },
    { service: 'PSYCHIATRY', price: 1000 },
    { service: 'PSYCHOTHERAPY', price: 600 },
    { service: 'DERMATOLOGY', price: 600 },
    { service: 'UROLOGY', price: 600 },
    { service: 'INFECTIOUS DISEASES', price: 600 },
    { service: 'GASTROENTEROLOGY', price: 600 },
    { service: 'ENDOCRINOLOGY', price: 600 },
    { service: 'ORTHOPAEDICS', price: 600 },
    { service: 'PULMONOLOGY', price: 600 },
    { service: 'GENERAL SURGEON', price: 600 },
    { service: 'OBSTETRIC SCAN (EARLY 5-13 WEEKS)', price: 240 },
    { service: 'LATE OBSTETRIC SCAN (GROWTH SCAN)', price: 280 },
    { service: 'FETAL ANOMALY SCAN (SINGLE)', price: 400 },
    { service: 'FETAL ANOMALY SCAN (TWINS)', price: 600 },
    { service: 'FETAL ANOMALY SCAN (TRIPLETS)', price: 800 },
    { service: 'TRANSVAGINAL SCAN', price: 260 },
    { service: 'PELVIC SCAN', price: 240 },
    { service: 'ABDOMINAL SCAN', price: 240 },
    { service: 'ABDOMINAL / PELVIC SCAN', price: 420 },
    { service: 'BREAST SCAN', price: 480 },
    { service: 'X-RAY CHEST', price: 220 },
    { service: 'X-RAY LUMBAR SPINE', price: 220 },
    { service: 'X-RAY PELVIS', price: 220 },
    { service: 'ELECTROCARDIOGRAM', price: 250 },
    { service: 'ECHOCARDIOGRAM', price: 726 },
  ],
};

// ──────────────────────────────────────────────
// 3. LAB TEST PRICES (from MDS-Lancet 2026 fee schedule)
// ──────────────────────────────────────────────
const LAB_PRICES: Array<{ code: string; name: string; price: number }> = [
  // Fertility & Hormones
  { code: 'TFT', name: 'Thyroid Function Test - TSH, T3, T4', price: 310 },
  { code: 'TSH', name: 'TSH', price: 150 },
  { code: 'FT3', name: 'Free T3', price: 150 },
  { code: 'FT4', name: 'Free T4', price: 150 },
  { code: 'UPT', name: 'Urine Pregnancy Test', price: 80 },
  { code: 'BHCG', name: 'Total ßhCG (Blood quantitative)', price: 230 },
  { code: 'E2', name: 'Estradiol', price: 160 },
  { code: 'FSH', name: 'FSH', price: 155 },
  { code: 'LH', name: 'LH', price: 155 },
  { code: 'PROG', name: 'Progesterone', price: 160 },
  { code: 'PROL', name: 'Prolactin', price: 155 },
  { code: 'AMH', name: 'Anti-Mullerian Hormone', price: 600 },
  { code: 'SHBG', name: 'Sex Hormone Binding Globulin', price: 350 },
  { code: 'FREE-TESTO', name: 'Free Testosterone', price: 500 },
  { code: 'CORTISOL', name: 'Cortisol - Blood', price: 290 },
  { code: 'TESTO', name: 'Testosterone (Total)', price: 220 },
  // Sepsis
  { code: 'PCT', name: 'Procalcitonin Quantitative', price: 650 },
  // Tumour Markers
  { code: 'AFP', name: 'AFP', price: 230 },
  { code: 'TPSA', name: 'Total PSA', price: 200 },
  { code: 'FPSA', name: 'Free PSA Ratio', price: 400 },
  { code: 'CA153', name: 'Breast Cancer Antigen (CA 15.3)', price: 320 },
  { code: 'CEA', name: 'CEA (Carcinoembryonic Antigen)', price: 280 },
  { code: 'CA125', name: 'Ovarian Cancer (CA 125)', price: 320 },
  { code: 'CA199', name: 'G.I. Tumour Antigen (CA 19.9)', price: 300 },
  { code: 'CA724', name: 'CA 72-4', price: 400 },
  // Pancreatic
  { code: 'AMY', name: 'Amylase', price: 110 },
  { code: 'LIP', name: 'Lipase', price: 190 },
  { code: 'INS-F', name: 'Insulin Fasting', price: 350 },
  { code: 'INS-R', name: 'Insulin Random', price: 350 },
  { code: 'CPEP-F', name: 'C-Peptide (Fasting)', price: 350 },
  { code: 'CPEP-R', name: 'C-Peptide (Random)', price: 350 },
  // Liver Function
  { code: 'LFT', name: 'Liver Function Test', price: 220 },
  { code: 'TBILI', name: 'Total Bilirubin', price: 40 },
  { code: 'DBILI', name: 'Direct Bilirubin', price: 40 },
  { code: 'TP', name: 'Total Protein', price: 40 },
  { code: 'ALB', name: 'Albumin', price: 70 },
  { code: 'AST', name: 'AST (SGOT)', price: 50 },
  { code: 'ALT', name: 'ALT (SGPT)', price: 50 },
  { code: 'ALP', name: 'Alkaline Phosphate', price: 50 },
  { code: 'GGT', name: 'Gamma G.T.', price: 50 },
  // Renal / Bone
  { code: 'BUE', name: 'BUE & Creatinine', price: 180 },
  { code: 'NA', name: 'Sodium (Na+)', price: 40 },
  { code: 'K', name: 'Potassium', price: 40 },
  { code: 'CL', name: 'Chloride', price: 40 },
  { code: 'CREAT', name: 'Creatinine', price: 50 },
  { code: 'CO2', name: 'Biocarbonate', price: 40 },
  { code: 'UREA', name: 'Urea', price: 55 },
  { code: 'UA', name: 'Uric Acid', price: 55 },
  { code: 'MALB', name: 'U-Microalbumin/Creat Ratio', price: 180 },
  { code: 'ELEC', name: 'Electrolytes (Na, K, Cl)', price: 160 },
  { code: 'CA', name: 'Calcium (Corrected)', price: 100 },
  { code: 'ICA', name: 'Ionized Calcium', price: 110 },
  { code: 'MG', name: 'Magnesium', price: 95 },
  { code: 'PHOS', name: 'Phosphate', price: 95 },
  { code: 'U24P', name: '24 Hour Urine Protein', price: 150 },
  { code: 'CRCL', name: 'Creatinine Clearance', price: 160 },
  // Lipid Profile
  { code: 'LIPID', name: 'Lipid Profile', price: 180 },
  { code: 'CHOL', name: 'Total Cholesterol', price: 75 },
  { code: 'HDL', name: 'HDL Cholesterol', price: 75 },
  { code: 'LDL', name: 'LDL Cholesterol', price: 75 },
  { code: 'TRIG', name: 'Triglycerides', price: 75 },
  { code: 'G6PD', name: 'G 6 P D (Quantitative)', price: 200 },
  // Diabetes
  { code: 'RBS', name: 'Blood Glucose (Random)', price: 60 },
  { code: 'FBS', name: 'Blood Glucose (Fasting)', price: 60 },
  { code: '2HRPP', name: '2 HR Post Prandial Glucose', price: 150 },
  { code: 'GTT', name: '75g 2HR GTT', price: 170 },
  { code: 'HBA1C', name: 'HbA1c', price: 180 },
  // Cardiac
  { code: 'TROPI', name: 'Troponin I', price: 300 },
  { code: 'TROPT', name: 'hs-Troponin T', price: 300 },
  { code: 'CARDIAC', name: 'Cardiac Profile', price: 750 },
  { code: 'CKMB', name: 'CK-MB', price: 220 },
  { code: 'CPK', name: 'CK-NAC (CPK)', price: 80 },
  { code: 'LDH', name: 'LDH', price: 90 },
  { code: 'CRP', name: 'CRP (hs-CRP)', price: 130 },
  { code: 'PROBNP', name: 'proBNP', price: 500 },
  // Anaemia
  { code: 'FE', name: 'Iron', price: 100 },
  { code: 'FER', name: 'Ferritin', price: 200 },
  { code: 'TRANS', name: 'Transferrin', price: 200 },
];

// ──────────────────────────────────────────────
// Helper: fuzzy match service name against charge_master
// ──────────────────────────────────────────────
function normalizeService(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function updatePricesMay2026(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build lookup: normalized service_name → charge_master row
    const cmResult = await client.query('SELECT id, service_name FROM charge_master WHERE is_active = true');
    const cmByName = new Map<string, number>();
    for (const row of cmResult.rows) {
      cmByName.set(normalizeService(row.service_name), row.id);
    }

    // Also handle GYNAECOLOGY vs GYNECOLOGY spelling variants
    function findChargeId(service: string): number | undefined {
      const norm = normalizeService(service);
      if (cmByName.has(norm)) return cmByName.get(norm);
      // Try GYNAECOLOGY → GYNECOLOGY and vice versa
      const alt1 = norm.replace('GYNECOLOGY', 'GYNAECOLOGY');
      if (cmByName.has(alt1)) return cmByName.get(alt1);
      const alt2 = norm.replace('GYNAECOLOGY', 'GYNECOLOGY');
      if (cmByName.has(alt2)) return cmByName.get(alt2);
      // Try GENERAL SURGERY → GENERAL SURGEON and vice versa
      const alt3 = norm.replace('GENERAL SURGERY', 'GENERAL SURGEON');
      if (cmByName.has(alt3)) return cmByName.get(alt3);
      const alt4 = norm.replace('GENERAL SURGEON', 'GENERAL SURGERY');
      if (cmByName.has(alt4)) return cmByName.get(alt4);
      return undefined;
    }

    // ── 1. Update charge_master cash prices ──
    let cashUpdated = 0;
    let cashMissing: string[] = [];
    for (const item of [...CASH_PRICES, ...PSYCHOLOGY_PRICES]) {
      const cmId = findChargeId(item.service);
      if (cmId) {
        await client.query(
          'UPDATE charge_master SET price = $1, updated_at = NOW() WHERE id = $2',
          [item.price, cmId]
        );
        cashUpdated++;
      } else {
        cashMissing.push(item.service);
      }
    }
    console.log(`  Cash prices: ${cashUpdated} updated, ${cashMissing.length} not found in charge_master`);
    if (cashMissing.length > 0) {
      console.log(`    Missing: ${cashMissing.join(', ')}`);
    }

    // ── 2. Upsert payer price schedules ──
    let payerUpdated = 0;
    let payerInserted = 0;
    let payerMissing: string[] = [];

    for (const [payerName, entries] of Object.entries(INSURANCE_PRICES)) {
      const payer = PAYER_MAP[payerName];
      if (!payer) { console.log(`  Skipping unknown payer: ${payerName}`); continue; }

      for (const entry of entries) {
        const cmId = findChargeId(entry.service);
        if (!cmId) {
          payerMissing.push(`${payerName}:${entry.service}`);
          continue;
        }

        const isExcluded = entry.price === 'EXCLUSION';
        const price = isExcluded ? null : entry.price;
        const insuranceId = payer.type === 'insurance' ? payer.id : null;
        const corporateId = payer.type === 'corporate' ? payer.id : null;

        // Try update first
        const updateResult = await client.query(
          `UPDATE payer_price_schedules
           SET price = $1, is_excluded = $2, updated_at = NOW()
           WHERE charge_master_id = $3
             AND payer_type = $4
             AND (insurance_provider_id = $5 OR ($5 IS NULL AND insurance_provider_id IS NULL))
             AND (corporate_client_id = $6 OR ($6 IS NULL AND corporate_client_id IS NULL))`,
          [price, isExcluded, cmId, payer.type, insuranceId, corporateId]
        );

        if (updateResult.rowCount === 0) {
          await client.query(
            `INSERT INTO payer_price_schedules
             (charge_master_id, payer_type, insurance_provider_id, corporate_client_id, price, is_excluded)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [cmId, payer.type, insuranceId, corporateId, price, isExcluded]
          );
          payerInserted++;
        } else {
          payerUpdated++;
        }
      }
    }
    console.log(`  Payer prices: ${payerUpdated} updated, ${payerInserted} inserted, ${payerMissing.length} not matched`);
    if (payerMissing.length > 0) {
      console.log(`    Missing: ${payerMissing.slice(0, 10).join(', ')}${payerMissing.length > 10 ? ` ...and ${payerMissing.length - 10} more` : ''}`);
    }

    // ── 3. Update lab test prices ──
    let labUpdated = 0;
    let labMissing: string[] = [];

    for (const test of LAB_PRICES) {
      // Try matching by test_code first (case-insensitive), then by name
      const result = await client.query(
        `UPDATE lab_test_catalog SET base_price = $1, updated_at = NOW()
         WHERE UPPER(test_code) = UPPER($2) AND is_active = true`,
        [test.price, test.code]
      );
      if (result.rowCount && result.rowCount > 0) {
        labUpdated++;
      } else {
        // Try name match
        const nameResult = await client.query(
          `UPDATE lab_test_catalog SET base_price = $1, updated_at = NOW()
           WHERE UPPER(test_name) = UPPER($2) AND is_active = true`,
          [test.price, test.name]
        );
        if (nameResult.rowCount && nameResult.rowCount > 0) {
          labUpdated++;
        } else {
          labMissing.push(`${test.code}: ${test.name}`);
        }
      }
    }
    console.log(`  Lab prices: ${labUpdated} updated, ${labMissing.length} not found in lab_test_catalog`);
    if (labMissing.length > 0) {
      console.log(`    Not matched (may need to be added as new tests):`);
      labMissing.forEach(m => console.log(`      - ${m}`));
    }

    await client.query('COMMIT');
    console.log('\n  Price update migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  Migration failed, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  updatePricesMay2026()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default updatePricesMay2026;
