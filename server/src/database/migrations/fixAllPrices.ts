import pool from '../db';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Comprehensive Price Verification & Fix Migration
 *
 * Reads ALL data from 3 source documents:
 *   1. CHARGES_FEE PAYING CLIENTS.xlsx -> charge_master (cash prices)
 *   2. FINAL PRICE LIST_HEALTH INSURANCE & CORPORATE.xlsx -> payer_price_schedules
 *   3. LAB-UPDATED PRICE LIST 2026.docx -> lab_test_catalog (base_price)
 *
 * Compares every price against the database, fixes mismatches,
 * inserts missing services/tests, and reports a full audit.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

// ──────────────────────────────────────────────
// Path resolution
// ──────────────────────────────────────────────
const DOCS_DIR = path.resolve(__dirname, '../../../..', 'docs');
const FILE_CASH   = path.join(DOCS_DIR, 'CHARGES_FEE PAYING CLIENTS.xlsx');
const FILE_PAYER  = path.join(DOCS_DIR, 'FINAL PRICE LIST_HEALTH INSURANCE & CORPORATE.xlsx');
const FILE_LAB    = path.join(DOCS_DIR, 'LAB-UPDATED PRICE LIST 2026.docx');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function normalize(s: string): string {
  return s.toUpperCase().replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a price cell that might be a number, string number, range ("50-70"),
 * "EXCLUSION", "AUTHORIZATION", or other text.
 */
function parsePrice(val: unknown): { price: number | null; isExclusion: boolean; isSkip: boolean } {
  if (val === null || val === undefined || val === '') {
    return { price: null, isExclusion: false, isSkip: true };
  }
  if (typeof val === 'number') {
    return { price: val, isExclusion: false, isSkip: false };
  }
  const s = String(val).trim().toUpperCase();
  if (s === 'EXCLUSION') {
    return { price: null, isExclusion: true, isSkip: false };
  }
  if (s === 'AUTHORIZATION' || s === '' || s.startsWith('MDS') || s === 'VARIABLES' || s.startsWith('PARTNER')) {
    return { price: null, isExclusion: false, isSkip: true };
  }
  // Handle ranges like "50-70", "45.00-70.00", "50=70", "70- 90", "150-170"
  const rangeMatch = s.match(/^[\d.]+\s*[-=]\s*[\d.]+$/);
  if (rangeMatch) {
    // Use the higher end of the range
    const parts = s.split(/[-=]/).map(p => parseFloat(p.trim()));
    const high = Math.max(...parts.filter(n => !isNaN(n)));
    return { price: high, isExclusion: false, isSkip: false };
  }
  // Handle "≥ ¢800.00" or "≥ 580.00"
  const gteMatch = s.match(/[\d.]+/);
  if (gteMatch) {
    return { price: parseFloat(gteMatch[0]), isExclusion: false, isSkip: false };
  }
  return { price: null, isExclusion: false, isSkip: true };
}

/** Check if a row is a header/section/empty row */
function isServiceRow(name: string, price: unknown): boolean {
  const n = name.trim();
  if (!n) return false;
  const upper = n.toUpperCase();
  // Skip header rows
  const skipPhrases = [
    'SERVICES', 'PROCEDURES', 'SPECIALTY CONSULTATION', 'SPECIALIST CONSULTATION',
    'DIAGNOSTIC TESTS', 'MINOR SURGICAL PROCEDURE', 'LABORATORY', 'TEST DEPENDENT',
    'MEDICATION', 'FEE PAYING', 'TARIFFS', 'PATIENT HOME VISITS',
    'MEDICS TARIFFS', 'MEDICS CLINIC', 'AGREED PRICE', 'PROPOSED PRICE',
    'ORANGE HEALTH INSURANCE PROPOSED', 'FINAL PRICE', 'PRICE',
    'PSYCHOLOGY CLINIC - JUSTINA',
  ];
  for (const phrase of skipPhrases) {
    if (upper.startsWith(phrase) && (price === '' || price === ' ' || price === undefined || price === null)) {
      return false;
    }
  }
  // Must have some price-like value
  if (price === '' || price === ' ' || price === undefined || price === null) return false;
  return true;
}

// ──────────────────────────────────────────────
// Counters
// ──────────────────────────────────────────────
interface Stats {
  updated: number;
  unchanged: number;
  notFound: string[];
  inserted: number;
}

function newStats(): Stats {
  return { updated: 0, unchanged: 0, notFound: [], inserted: 0 };
}

// ──────────────────────────────────────────────
// PAYER MAP: sheet name -> payer config
// ──────────────────────────────────────────────
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

// Service name aliases for fuzzy matching
const ALIASES: Record<string, string[]> = {
  'GYNAECOLOGY': ['GYNECOLOGY'],
  'GYNECOLOGY': ['GYNAECOLOGY'],
  'GENERAL SURGERY': ['GENERAL SURGEON'],
  'GENERAL SURGEON': ['GENERAL SURGERY'],
  'PSYCHOLOGY CLINIC': ['PSYCHOLOGY CLINIC / PSYCHOTHERAPY', 'PSYCHOTHERAPY'],
  'PSYCHOTHERAPY': ['PSYCHOLOGY CLINIC / PSYCHOTHERAPY', 'PSYCHOLOGY CLINIC'],
  'PSYCHOLOGY CLINIC / PSYCHOTHERAPY': ['PSYCHOLOGY CLINIC', 'PSYCHOTHERAPY'],
  'OBSTETRICS & GYNECOLOGY': ['OBSTETRICS & GYNAECOLOGY'],
  'OBSTETRICS & GYNAECOLOGY': ['OBSTETRICS & GYNECOLOGY'],
  'OBSTETRICS & GYNECOLOGY - 2ND VISIT': ['OBSTETRICS & GYNAECOLOGY - 2ND VISIT'],
  'OBSTETRICS & GYNAECOLOGY - 2ND VISIT': ['OBSTETRICS & GYNECOLOGY - 2ND VISIT'],
};

// Psychology session name -> service_code for items that may need insertion
const PSYCHOLOGY_INSERT_MAP: Record<string, { code: string; category: string; description: string }> = {
  'THIRD & FOURTH SESSION - IN PERSON': {
    code: 'PSYCH-SESSION-34',
    category: 'consultation',
    description: 'Third or fourth in-person psychology session',
  },
  'SECOND/THIRD/FOURTH - VIRTUAL': {
    code: 'PSYCH-VIRTUAL',
    category: 'consultation',
    description: 'Virtual psychology session (2nd-4th)',
  },
  'CHILDREN UNDER 18': {
    code: 'PSYCH-CHILD',
    category: 'consultation',
    description: 'Psychology session for children under 18',
  },
  'SECOND SESSION - IN PERSON': {
    code: 'PSYCH-SESSION-2',
    category: 'consultation',
    description: 'Second in-person psychology session',
  },
  'FAMILY THERAPY - FIRST SESSION': {
    code: 'PSYCH-FAM-1',
    category: 'consultation',
    description: 'First family therapy session',
  },
  'FAMILY THERAPY - SUBSEQUENT SESSIONS': {
    code: 'PSYCH-FAM-FU',
    category: 'consultation',
    description: 'Subsequent family therapy sessions',
  },
  'COUPLES THERAPY - FIRST SESSION': {
    code: 'PSYCH-COUPLE-1',
    category: 'consultation',
    description: 'First couples therapy session',
  },
  'COUPLES THERAPY - SUBSEQUENT SESSIONS': {
    code: 'PSYCH-COUPLE-FU',
    category: 'consultation',
    description: 'Subsequent couples therapy sessions',
  },
};

// Cash client service name -> service_code for items that may need insertion
const CASH_INSERT_MAP: Record<string, { code: string; category: string; description: string }> = {
  'REGISTRATION': { code: 'REG-001', category: 'registration', description: 'Patient registration fee' },
  'PRIMARY CARE CONSULTATION': { code: 'CONS-PCP', category: 'consultation', description: 'Primary care physician consultation' },
  'GENERAL PRACTITIONER CONSULT': { code: 'CONS-GP', category: 'consultation', description: 'General practitioner consultation' },
  'TELEPHONE CONSULT (GENERAL PRACTIONER)': { code: 'CONS-TEL-GP', category: 'consultation', description: 'Telephone consultation with GP' },
  'TELEPHONE CONSULT (PRIMARY CARE)': { code: 'CONS-TEL-PCP', category: 'consultation', description: 'Telephone consultation with PCP' },
  'REVIEW': { code: 'CONS-REVIEW', category: 'consultation', description: 'Follow-up review visit' },
  'DETENTION': { code: 'CONS-DETENTION', category: 'consultation', description: 'Observation/detention fee' },
  'WOUND DRESSING - MINOR': { code: 'PROC-DRESS-MINOR', category: 'procedure', description: 'Minor wound dressing' },
  'WOUND DRESSING - MAJOR': { code: 'PROC-DRESS-MAJOR', category: 'procedure', description: 'Major wound dressing' },
  'STERISTRIPPING': { code: 'PROC-STERISTRIP', category: 'procedure', description: 'Wound closure with steristrips' },
  'WOUND SUTURING (MINOR)': { code: 'PROC-SUTURE-MINOR', category: 'procedure', description: 'Minor wound suturing' },
  'WOUND SUTURING (MAJOR)': { code: 'PROC-SUTURE-MAJOR', category: 'procedure', description: 'Major wound suturing' },
  'INCISION AND DRAINAGE': { code: 'PROC-IND', category: 'procedure', description: 'Incision and drainage procedure' },
  'STITCH REMOVAL': { code: 'PROC-STITCH-REM', category: 'procedure', description: 'Removal of stitches/sutures' },
  'NEBULISATION': { code: 'PROC-NEBULISATION', category: 'procedure', description: 'Nebuliser treatment' },
  'CONSUMABLES FOR NEBULISATION': { code: 'PROC-NEB-CONS', category: 'procedure', description: 'Nebulisation consumables' },
  'OXYGEN (WITHIN 1 HOUR)': { code: 'PROC-O2-1HR', category: 'procedure', description: 'Oxygen therapy up to 1 hour' },
  'OXYGEN (WITHIN 6 HOURS)': { code: 'PROC-O2-6HR', category: 'procedure', description: 'Oxygen therapy up to 6 hours' },
  'OXYGEN (WITHIN 12 HOURS)': { code: 'PROC-O2-12HR', category: 'procedure', description: 'Oxygen therapy up to 12 hours' },
  'CONSUMABLES FOR INJECTION': { code: 'PROC-INJ-CONS', category: 'procedure', description: 'Injection consumables' },
  'PHYSICIAN SPECIALIST': { code: 'SPEC-PHYSICIAN', category: 'consultation', description: 'Specialist physician consultation' },
  'PAEDIATRICS': { code: 'SPEC-PAED', category: 'consultation', description: 'Paediatric specialist consultation' },
  'OBSTETRICS & GYNECOLOGY': { code: 'SPEC-OBGYN', category: 'consultation', description: 'OB/GYN specialist consultation' },
  'OBSTETRICS & GYNAECOLOGY': { code: 'SPEC-OBGYN', category: 'consultation', description: 'OB/GYN specialist consultation' },
  'OBSTETRICS & GYNECOLOGY - 2ND VISIT': { code: 'SPEC-OBGYN-FU', category: 'consultation', description: 'OB/GYN follow-up visit' },
  'OBSTETRICS & GYNAECOLOGY - 2ND VISIT': { code: 'SPEC-OBGYN-FU', category: 'consultation', description: 'OB/GYN follow-up visit' },
  'CARDIOLOGY': { code: 'SPEC-CARDIO', category: 'consultation', description: 'Cardiology specialist consultation' },
  'NEUROSURGERY': { code: 'SPEC-NEURO', category: 'consultation', description: 'Neurosurgery specialist consultation' },
  'OPHTHALMOLOGY': { code: 'SPEC-OPHTH', category: 'consultation', description: 'Ophthalmology specialist consultation' },
  'OPTOMETRIST': { code: 'SPEC-OPTOM', category: 'consultation', description: 'Optometrist consultation' },
  'PHYSIOTHERAPY': { code: 'SPEC-PHYSIO', category: 'consultation', description: 'Physiotherapy session' },
  'DIETICIAN': { code: 'SPEC-DIET', category: 'consultation', description: 'Dietician consultation' },
  'EAR, NOSE & THROAT': { code: 'SPEC-ENT', category: 'consultation', description: 'ENT specialist consultation' },
  'INTERNAL MEDICINE': { code: 'SPEC-INTMED', category: 'consultation', description: 'Internal medicine specialist' },
  'PSYCHIATRY': { code: 'SPEC-PSYCH', category: 'consultation', description: 'Psychiatry specialist consultation' },
  'PSYCHOLOGY CLINIC': { code: 'SPEC-PSYCHOL', category: 'consultation', description: 'Psychology/psychotherapy session' },
  'PSYCHOTHERAPY': { code: 'SPEC-PSYCHOL', category: 'consultation', description: 'Psychology/psychotherapy session' },
  'DERMATOLOGY': { code: 'SPEC-DERM', category: 'consultation', description: 'Dermatology specialist consultation' },
  'UROLOGY': { code: 'SPEC-UROL', category: 'consultation', description: 'Urology specialist consultation' },
  'INFECTIOUS DISEASES': { code: 'SPEC-INFECT', category: 'consultation', description: 'Infectious diseases specialist' },
  'GASTROENTEROLOGY': { code: 'SPEC-GASTRO', category: 'consultation', description: 'Gastroenterology specialist' },
  'ENDOCRINOLOGY': { code: 'SPEC-ENDO', category: 'consultation', description: 'Endocrinology specialist' },
  'ORTHOPAEDICS': { code: 'SPEC-ORTHO', category: 'consultation', description: 'Orthopaedics specialist' },
  'PULMONOLOGY': { code: 'SPEC-PULM', category: 'consultation', description: 'Pulmonology specialist' },
  'GENERAL SURGEON': { code: 'SPEC-SURG', category: 'consultation', description: 'General surgery specialist' },
  'GENERAL SURGERY': { code: 'SPEC-SURG', category: 'consultation', description: 'General surgery specialist' },
  'OBSTETRIC SCAN (EARLY 5-13 WEEKS)': { code: 'DIAG-OBS-EARLY', category: 'imaging', description: 'Early pregnancy obstetric ultrasound' },
  'LATE OBSTETRIC SCAN (GROWTH SCAN)': { code: 'DIAG-OBS-LATE', category: 'imaging', description: 'Late pregnancy growth scan' },
  'FETAL ANOMALY SCAN (SINGLE)': { code: 'DIAG-ANOM-SINGLE', category: 'imaging', description: 'Fetal anomaly scan - singleton' },
  'FETAL ANOMALY SCAN (TWINS)': { code: 'DIAG-ANOM-TWINS', category: 'imaging', description: 'Fetal anomaly scan - twins' },
  'FETAL ANOMALY SCAN (TRIPLETS)': { code: 'DIAG-ANOM-TRIP', category: 'imaging', description: 'Fetal anomaly scan - triplets' },
  'TRANSVAGINAL SCAN': { code: 'DIAG-TVS', category: 'imaging', description: 'Transvaginal ultrasound scan' },
  'PELVIC SCAN': { code: 'DIAG-PELV', category: 'imaging', description: 'Pelvic ultrasound scan' },
  'ABDOMINAL SCAN': { code: 'DIAG-ABD', category: 'imaging', description: 'Abdominal ultrasound scan' },
  'ABDOMINAL / PELVIC SCAN': { code: 'DIAG-ABD-PELV', category: 'imaging', description: 'Combined abdominal and pelvic scan' },
  'BREAST SCAN': { code: 'DIAG-BREAST', category: 'imaging', description: 'Breast ultrasound scan' },
  'X-RAY CHEST': { code: 'DIAG-XR-CHEST', category: 'imaging', description: 'Chest X-ray' },
  'X-RAY LUMBAR SPINE': { code: 'DIAG-XR-LUMBAR', category: 'imaging', description: 'Lumbar spine X-ray' },
  'X-RAY PELVIS': { code: 'DIAG-XR-PELVIS', category: 'imaging', description: 'Pelvic X-ray' },
  'ELECTROCARDIOGRAM': { code: 'DIAG-ECG', category: 'imaging', description: '12-lead ECG' },
  'ECHOCARDIOGRAM': { code: 'DIAG-ECHO', category: 'imaging', description: 'Cardiac echocardiogram' },
  'MANUAL VACUUM EVACUATION': { code: 'SURG-MVE', category: 'procedure', description: 'Manual vacuum evacuation procedure' },
  'REMOVAL OF LUMPS AND BUMPS': { code: 'SURG-LUMP', category: 'procedure', description: 'Excision of lumps and bumps' },
  'TELEPHONE REVIEW': { code: 'CONS-TEL-PCP', category: 'consultation', description: 'Telephone review' },
  'FIRST PATIENT HOME VISIT': { code: 'CONS-HOME', category: 'consultation', description: 'Initial patient home visit' },
};

// ──────────────────────────────────────────────
// Read Excel helpers
// ──────────────────────────────────────────────
function readSheetRows(wb: unknown, sheetName: string): Array<[string, unknown]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheet = (wb as any).Sheets[sheetName];
  if (!sheet) return [];
  const rows: Array<unknown[]> = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const result: Array<[string, unknown]> = [];
  for (const row of rows) {
    const name = String(row[0] || '').trim();
    const price = row[1];
    if (name && isServiceRow(name, price)) {
      result.push([name, price]);
    }
  }
  return result;
}

// ──────────────────────────────────────────────
// Parse Lab .docx
// ──────────────────────────────────────────────
function parseLabDocx(): Array<{ code: string; name: string; price: number }> {
  const xml = execSync(`unzip -p "${FILE_LAB}" word/document.xml`, {
    maxBuffer: 10 * 1024 * 1024,
  }).toString();

  // Extract paragraphs and get text from each
  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  const textLines: string[] = [];
  for (const p of paragraphs) {
    const texts = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const text = texts.map((t: string) => t.replace(/<[^>]*>/g, '')).join('');
    if (text.trim()) textLines.push(text.trim());
  }

  // The docx is structured as triplets: MNEMONIC, TEST NAME, PRICE
  // with section headers interspersed.
  // Strategy: look for lines that are purely numeric (prices), and
  // the preceding two lines are the mnemonic and test name.
  const results: Array<{ code: string; name: string; price: number }> = [];
  const sectionHeaders = new Set([
    'CHEMICAL PATHOLOGY', 'FERTILITY AND HORMONES', 'SEPSIS',
    'TUMOUR / CANCER MARKERS', 'TUMOUR /CANCER MARKERS',
    'PANCREATIC SCREEN', 'LIVER FUNCTION TEST', 'RENAL / BONE',
    'LIPID PROFILE', 'DIABETES / CARBOHYDRATE METABOLISM',
    'MYOCARDIAL (CARDIOVASCULAR DISEASES)', 'CORONARY ARTERY DISEASE',
    'ANAEMIA WORK-UP', 'CSF/PLEURAL/ASCITIC/SYNOVIAL FLUID',
    'MULTIPLE MYELOMA', 'INFECTIOUS DISEASES', 'HORMONES AND ENZYMES',
    'OCCUPATIONAL HEALTH', 'AUTO IMMUNE / CONNECTIVE TISSUE DISEASE',
    'THERAPEUTIC DRUG MONITORING', 'THYROID MARKERS',
    'ALLERGY AND HUMORAL IMMUNITY', 'HAEMATOLOGY', 'COAGULATION',
    'MICROBIOLOGY', 'MOLECULAR BIOLOGY', 'HISTOLOGY AND CYTOLOGY',
    'MNEMONICS', 'TESTS', 'PRICES', '2026',
    'MDS-LANCET LABORATORIES GHANA LIMITED',
    'GHANA STANDARD FEE SCHEDULE 2026',
    'EFFECTIVE DATE: 1 JANUARY 2026',
  ]);

  // Walk through lines looking for price-triplet pattern
  for (let i = 2; i < textLines.length; i++) {
    const priceLine = textLines[i];
    // Check if this line is a number (price)
    const priceNum = parseFloat(priceLine.replace(/,/g, ''));
    if (isNaN(priceNum) || priceNum <= 0) continue;
    // Price line should be purely numeric (possibly with commas)
    if (!/^[\d,]+(\.\d+)?$/.test(priceLine.replace(/\s/g, ''))) continue;

    // Go back to find the mnemonic and test name
    // The line immediately before is the test name
    const testName = textLines[i - 1];
    const mnemonic = textLines[i - 2];

    // Skip if these look like section headers
    if (sectionHeaders.has(testName.toUpperCase())) continue;
    if (sectionHeaders.has(mnemonic.toUpperCase())) continue;

    // Mnemonic should be relatively short (code-like)
    // and not be a plain number
    if (/^[\d,]+(\.\d+)?$/.test(mnemonic)) continue;

    results.push({
      code: mnemonic.trim(),
      name: testName.trim(),
      price: priceNum,
    });
  }

  return results;
}

// ──────────────────────────────────────────────
// Main migration
// ──────────────────────────────────────────────
async function fixAllPrices(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  COMPREHENSIVE PRICE VERIFICATION & FIX                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // ── Load charge_master lookup ──
    const cmResult = await client.query(
      'SELECT id, service_name, service_code, price FROM charge_master WHERE is_active = true'
    );
    const cmByNorm = new Map<string, { id: number; name: string; code: string; price: number }>();
    for (const row of cmResult.rows) {
      cmByNorm.set(normalize(row.service_name), {
        id: row.id,
        name: row.service_name,
        code: row.service_code,
        price: parseFloat(row.price),
      });
    }

    function findCharge(service: string): { id: number; name: string; code: string; price: number } | undefined {
      const norm = normalize(service);
      if (cmByNorm.has(norm)) return cmByNorm.get(norm);
      // Try aliases
      for (const [key, alts] of Object.entries(ALIASES)) {
        if (norm.includes(key)) {
          for (const alt of alts) {
            const altNorm = norm.replace(key, alt);
            if (cmByNorm.has(altNorm)) return cmByNorm.get(altNorm);
          }
        }
      }
      // Try prefix match: "PRIMARY CARE CONSULTATION (for Dr. ...)" -> "PRIMARY CARE CONSULTATION"
      for (const [cmNorm, cmEntry] of cmByNorm.entries()) {
        if (norm.startsWith(cmNorm + ' (') || norm.startsWith(cmNorm + '(')) {
          return cmEntry;
        }
      }
      return undefined;
    }

    // ================================================================
    // PART 1: CASH CLIENT PRICES (charge_master.price)
    // ================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PART 1: CASH CLIENT PRICES (charge_master)');
    console.log('Source: CHARGES_FEE PAYING CLIENTS.xlsx');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const wb1 = XLSX.readFile(FILE_CASH);
    const cashStats = newStats();

    // Sheet 1: TARIFFS-CASH CLIENT
    console.log('\n── Sheet: TARIFFS-CASH CLIENT ──');
    const cashRows = readSheetRows(wb1, 'TARIFFS-CASH CLIENT');
    for (const [name, rawPrice] of cashRows) {
      const parsed = parsePrice(rawPrice);
      if (parsed.isSkip || parsed.price === null) {
        console.log(`  SKIP     "${name}" (non-numeric price: ${rawPrice})`);
        continue;
      }
      const cm = findCharge(name);
      if (cm) {
        if (Math.abs(cm.price - parsed.price) < 0.01) {
          console.log(`  OK       "${name}" = GHS ${parsed.price} (charge_master id=${cm.id})`);
          cashStats.unchanged++;
        } else {
          console.log(`  UPDATED  "${name}": GHS ${cm.price} -> GHS ${parsed.price} (charge_master id=${cm.id})`);
          await client.query(
            'UPDATE charge_master SET price = $1, updated_at = NOW() WHERE id = $2',
            [parsed.price, cm.id]
          );
          cashStats.updated++;
          // Update local cache
          cm.price = parsed.price;
        }
      } else {
        // Try to insert
        const normName = normalize(name);
        const insertDef = CASH_INSERT_MAP[normName] || CASH_INSERT_MAP[name.trim()];
        if (insertDef) {
          console.log(`  INSERT   "${name}" = GHS ${parsed.price} (new service_code=${insertDef.code})`);
          const insertRes = await client.query(
            `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (service_code) DO UPDATE SET
               price = EXCLUDED.price, updated_at = NOW()
             RETURNING id`,
            [name.trim(), insertDef.code, insertDef.category, parsed.price, insertDef.description]
          );
          cashStats.inserted++;
          cmByNorm.set(normName, {
            id: insertRes.rows[0].id,
            name: name.trim(),
            code: insertDef.code,
            price: parsed.price,
          });
        } else {
          console.log(`  NOT_FOUND "${name}" = GHS ${parsed.price}`);
          cashStats.notFound.push(name.trim());
        }
      }
    }

    // Sheet 2: PSYCHOLOGY
    console.log('\n── Sheet: PSYCHOLOGY - JUSTINA OWU-AGYIRI ──');
    const psychRows = readSheetRows(wb1, 'PSYCHOLOGY - JUSTINA OWU-AGYIRI');
    for (const [name, rawPrice] of psychRows) {
      const parsed = parsePrice(rawPrice);
      if (parsed.isSkip || parsed.price === null) continue;

      const cm = findCharge(name);
      if (cm) {
        if (Math.abs(cm.price - parsed.price) < 0.01) {
          console.log(`  OK       "${name}" = GHS ${parsed.price} (charge_master id=${cm.id})`);
          cashStats.unchanged++;
        } else {
          console.log(`  UPDATED  "${name}": GHS ${cm.price} -> GHS ${parsed.price} (charge_master id=${cm.id})`);
          await client.query(
            'UPDATE charge_master SET price = $1, updated_at = NOW() WHERE id = $2',
            [parsed.price, cm.id]
          );
          cashStats.updated++;
          cm.price = parsed.price;
        }
      } else {
        // Try psychology insert map
        const insertDef = PSYCHOLOGY_INSERT_MAP[name.trim()] || CASH_INSERT_MAP[name.trim()];
        if (insertDef) {
          console.log(`  INSERT   "${name}" = GHS ${parsed.price} (new service_code=${insertDef.code})`);
          const insertRes = await client.query(
            `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (service_code) DO UPDATE SET
               price = EXCLUDED.price, updated_at = NOW()
             RETURNING id`,
            [name.trim(), insertDef.code, insertDef.category, parsed.price, insertDef.description]
          );
          cashStats.inserted++;
          cmByNorm.set(normalize(name), {
            id: insertRes.rows[0].id,
            name: name.trim(),
            code: insertDef.code,
            price: parsed.price,
          });
        } else {
          console.log(`  NOT_FOUND "${name}" = GHS ${parsed.price}`);
          cashStats.notFound.push(name.trim());
        }
      }
    }

    console.log(`\n  Summary: ${cashStats.updated} updated, ${cashStats.unchanged} unchanged, ${cashStats.inserted} inserted, ${cashStats.notFound.length} not found`);
    if (cashStats.notFound.length > 0) {
      console.log(`  Not found: ${cashStats.notFound.join(', ')}`);
    }

    // Refresh charge_master lookup after cash updates
    const cmRefresh = await client.query(
      'SELECT id, service_name, service_code, price FROM charge_master WHERE is_active = true'
    );
    cmByNorm.clear();
    for (const row of cmRefresh.rows) {
      cmByNorm.set(normalize(row.service_name), {
        id: row.id,
        name: row.service_name,
        code: row.service_code,
        price: parseFloat(row.price),
      });
    }

    // ================================================================
    // PART 2: INSURANCE & CORPORATE PAYER PRICES
    // ================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PART 2: INSURANCE & CORPORATE PAYER PRICES (payer_price_schedules)');
    console.log('Source: FINAL PRICE LIST_HEALTH INSURANCE & CORPORATE.xlsx');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const wb2 = XLSX.readFile(FILE_PAYER);
    const payerStatsAll = newStats();

    for (const sheetName of wb2.SheetNames) {
      const payer = PAYER_MAP[sheetName];
      if (!payer) {
        console.log(`\n  SKIP sheet "${sheetName}" - no payer mapping`);
        continue;
      }

      console.log(`\n── Sheet: ${sheetName} (${payer.type} id=${payer.id}) ──`);
      const payerRows = readSheetRows(wb2, sheetName);
      const insuranceId = payer.type === 'insurance' ? payer.id : null;
      const corporateId = payer.type === 'corporate' ? payer.id : null;

      for (const [name, rawPrice] of payerRows) {
        const parsed = parsePrice(rawPrice);
        if (parsed.isSkip) {
          continue;
        }

        const cm = findCharge(name);
        if (!cm) {
          // Try inserting new service if we know its definition
          const normName = normalize(name);
          const insertDef = CASH_INSERT_MAP[normName] || CASH_INSERT_MAP[name.trim()];
          if (insertDef && !parsed.isExclusion && parsed.price !== null) {
            // First ensure the service exists in charge_master
            const existCheck = await client.query(
              'SELECT id, price FROM charge_master WHERE service_code = $1',
              [insertDef.code]
            );
            let cmId: number;
            if (existCheck.rows.length > 0) {
              cmId = existCheck.rows[0].id;
            } else {
              const insRes = await client.query(
                `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
                 VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
                [name.trim(), insertDef.code, insertDef.category, 0, insertDef.description]
              );
              cmId = insRes.rows[0].id;
              cmByNorm.set(normName, { id: cmId, name: name.trim(), code: insertDef.code, price: 0 });
            }
            // Now upsert the payer price
            await upsertPayerPrice(client, cmId, payer.type, insuranceId, corporateId, parsed.price, parsed.isExclusion);
            console.log(`  INSERT+UPSERT "${name}" = GHS ${parsed.price}`);
            payerStatsAll.inserted++;
            continue;
          }
          console.log(`  NOT_FOUND "${name}" for ${sheetName}`);
          payerStatsAll.notFound.push(`${sheetName}:${name.trim()}`);
          continue;
        }

        // Check existing payer price
        const existing = await client.query(
          `SELECT id, price, is_excluded FROM payer_price_schedules
           WHERE charge_master_id = $1
             AND payer_type = $2
             AND (insurance_provider_id = $3 OR ($3 IS NULL AND insurance_provider_id IS NULL))
             AND (corporate_client_id = $4 OR ($4 IS NULL AND corporate_client_id IS NULL))`,
          [cm.id, payer.type, insuranceId, corporateId]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const existingPrice = row.price !== null ? parseFloat(row.price) : null;
          const existingExcluded = row.is_excluded;

          if (parsed.isExclusion) {
            if (existingExcluded) {
              console.log(`  OK       "${name}" = EXCLUSION`);
              payerStatsAll.unchanged++;
            } else {
              console.log(`  UPDATED  "${name}": GHS ${existingPrice} -> EXCLUSION`);
              await client.query(
                `UPDATE payer_price_schedules SET price = NULL, is_excluded = true, updated_at = NOW() WHERE id = $1`,
                [row.id]
              );
              payerStatsAll.updated++;
            }
          } else {
            if (!existingExcluded && existingPrice !== null && Math.abs(existingPrice - (parsed.price || 0)) < 0.01) {
              console.log(`  OK       "${name}" = GHS ${parsed.price}`);
              payerStatsAll.unchanged++;
            } else {
              console.log(`  UPDATED  "${name}": ${existingExcluded ? 'EXCLUSION' : `GHS ${existingPrice}`} -> GHS ${parsed.price}`);
              await client.query(
                `UPDATE payer_price_schedules SET price = $1, is_excluded = false, updated_at = NOW() WHERE id = $2`,
                [parsed.price, row.id]
              );
              payerStatsAll.updated++;
            }
          }
        } else {
          // Insert new payer price
          const priceVal = parsed.isExclusion ? null : parsed.price;
          console.log(`  INSERT   "${name}" = ${parsed.isExclusion ? 'EXCLUSION' : `GHS ${priceVal}`}`);
          await client.query(
            `INSERT INTO payer_price_schedules
             (charge_master_id, payer_type, insurance_provider_id, corporate_client_id, price, is_excluded)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [cm.id, payer.type, insuranceId, corporateId, priceVal, parsed.isExclusion]
          );
          payerStatsAll.inserted++;
        }
      }
    }

    console.log(`\n  Summary: ${payerStatsAll.updated} updated, ${payerStatsAll.unchanged} unchanged, ${payerStatsAll.inserted} inserted, ${payerStatsAll.notFound.length} not found`);
    if (payerStatsAll.notFound.length > 0) {
      console.log(`  Not found:`);
      for (const nf of payerStatsAll.notFound) {
        console.log(`    - ${nf}`);
      }
    }

    // ================================================================
    // PART 3: LAB TEST PRICES (lab_test_catalog.base_price)
    // ================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PART 3: LAB TEST PRICES (lab_test_catalog)');
    console.log('Source: LAB-UPDATED PRICE LIST 2026.docx');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Load lab_test_catalog
    const labResult = await client.query(
      'SELECT id, test_code, test_name, base_price FROM lab_test_catalog WHERE is_active = true'
    );
    const labByCode = new Map<string, { id: number; code: string; name: string; price: number }>();
    for (const row of labResult.rows) {
      labByCode.set(row.test_code.toUpperCase(), {
        id: row.id,
        code: row.test_code,
        name: row.test_name,
        price: row.base_price !== null ? parseFloat(row.base_price) : 0,
      });
    }

    const labTests = parseLabDocx();
    console.log(`  Parsed ${labTests.length} tests from docx\n`);

    const labStats = newStats();

    for (const test of labTests) {
      const entry = labByCode.get(test.code.toUpperCase());
      if (entry) {
        if (Math.abs(entry.price - test.price) < 0.01) {
          console.log(`  OK       [${test.code}] "${test.name}" = GHS ${test.price}`);
          labStats.unchanged++;
        } else {
          console.log(`  UPDATED  [${test.code}] "${test.name}": GHS ${entry.price} -> GHS ${test.price}`);
          await client.query(
            'UPDATE lab_test_catalog SET base_price = $1, updated_at = NOW() WHERE id = $2',
            [test.price, entry.id]
          );
          labStats.updated++;
        }
      } else {
        console.log(`  NOT_FOUND [${test.code}] "${test.name}" = GHS ${test.price}`);
        labStats.notFound.push(`${test.code}: ${test.name}`);
      }
    }

    console.log(`\n  Summary: ${labStats.updated} updated, ${labStats.unchanged} unchanged, ${labStats.notFound.length} not found in lab_test_catalog`);
    if (labStats.notFound.length > 0) {
      console.log(`  Not matched (these test codes are not in lab_test_catalog):`);
      for (const nf of labStats.notFound) {
        console.log(`    - ${nf}`);
      }
    }

    // ================================================================
    // COMMIT & FINAL SUMMARY
    // ================================================================
    await client.query('COMMIT');

    const totalUpdated = cashStats.updated + payerStatsAll.updated + labStats.updated;
    const totalUnchanged = cashStats.unchanged + payerStatsAll.unchanged + labStats.unchanged;
    const totalNotFound = cashStats.notFound.length + payerStatsAll.notFound.length + labStats.notFound.length;
    const totalInserted = cashStats.inserted + payerStatsAll.inserted + labStats.inserted;

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  FINAL SUMMARY                                             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  Cash prices:   ${String(cashStats.updated).padStart(3)} updated, ${String(cashStats.unchanged).padStart(3)} OK, ${String(cashStats.inserted).padStart(3)} inserted, ${String(cashStats.notFound.length).padStart(3)} missing ║`);
    console.log(`║  Payer prices:  ${String(payerStatsAll.updated).padStart(3)} updated, ${String(payerStatsAll.unchanged).padStart(3)} OK, ${String(payerStatsAll.inserted).padStart(3)} inserted, ${String(payerStatsAll.notFound.length).padStart(3)} missing ║`);
    console.log(`║  Lab prices:    ${String(labStats.updated).padStart(3)} updated, ${String(labStats.unchanged).padStart(3)} OK, ${String(labStats.inserted).padStart(3)} inserted, ${String(labStats.notFound.length).padStart(3)} missing ║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  TOTAL:         ${String(totalUpdated).padStart(3)} updated, ${String(totalUnchanged).padStart(3)} OK, ${String(totalInserted).padStart(3)} inserted, ${String(totalNotFound).padStart(3)} missing ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nMigration FAILED, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertPayerPrice(
  client: any,
  chargeId: number,
  payerType: 'insurance' | 'corporate',
  insuranceId: number | null,
  corporateId: number | null,
  price: number | null,
  isExcluded: boolean,
): Promise<void> {
  const updateResult = await client.query(
    `UPDATE payer_price_schedules
     SET price = $1, is_excluded = $2, updated_at = NOW()
     WHERE charge_master_id = $3
       AND payer_type = $4
       AND (insurance_provider_id = $5 OR ($5 IS NULL AND insurance_provider_id IS NULL))
       AND (corporate_client_id = $6 OR ($6 IS NULL AND corporate_client_id IS NULL))`,
    [price, isExcluded, chargeId, payerType, insuranceId, corporateId]
  );

  if (updateResult.rowCount === 0) {
    await client.query(
      `INSERT INTO payer_price_schedules
       (charge_master_id, payer_type, insurance_provider_id, corporate_client_id, price, is_excluded)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [chargeId, payerType, insuranceId, corporateId, price, isExcluded]
    );
  }
}

if (require.main === module) {
  fixAllPrices()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default fixAllPrices;
