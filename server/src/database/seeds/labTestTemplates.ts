/**
 * Lab test catalog + parameter templates seed.
 *
 * Curated by hand from the 14 .docx templates in docs/lab-templates/manual-templates/.
 * When the lab tech opens "Enter results" for a test that matches one of these
 * `test_name`s, the structured multi-row entry form is rendered using the
 * parameter list below. Tests without a template here fall back to the legacy
 * free-text result form.
 *
 * Reference ranges and units come directly from the docx templates. Where
 * a test has male/female or age variants (FBC, chem panels), the seed
 * includes multiple variants and the entry form picks one based on the
 * patient's age + sex.
 *
 * value_type:
 *   - 'numeric'     : numeric value + unit + optional normal/critical range
 *   - 'qualitative' : pick from qualitative_options (e.g. Negative|Positive)
 *   - 'text'        : free-text (urine colour, "Others")
 */

export type ValueType = 'numeric' | 'qualitative' | 'text';

export interface ParameterSeed {
  parameter_name: string;
  parameter_code?: string;
  value_type: ValueType;
  unit?: string;
  normal_low?: number;
  normal_high?: number;
  critical_low?: number;
  critical_high?: number;
  reference_range_text?: string;
  qualitative_options?: string; // pipe-separated
  default_qualitative_value?: string;
  age_group?: 'adult' | 'child_6_12' | 'child_under_6' | null;
  sex?: 'M' | 'F' | null;
  section_label?: string;
  sort_order: number;
}

export interface TestTemplateSeed {
  test_name: string;            // exact match against lab_orders.test_name
  test_code?: string;           // short code used on tubes / analyzer
  category: string;             // 'haematology' | 'chemistry' | 'serology' | 'urinalysis' | 'microbiology'
  specimen_type: string;
  base_price?: number;          // GHS — leave for chargeMaster to override
  notes?: string;               // e.g. signing line, methodology
  parameters: ParameterSeed[];
}

// Common qualitative option sets reused across tests
const QUAL_REACTIVE = 'Non-Reactive|Reactive';
const QUAL_POSITIVE = 'Negative|Positive';
const QUAL_URINE_CHEM = 'Negative|Trace|+|++|+++|++++';
const QUAL_UROBIL = 'Normal|Abnormal';
const QUAL_OBSERVED = 'Not observed|Observed';

// Build a human-friendly reference range string from a low/high pair.
// Mirrors the format the lab uses on printed reports ("4.0 - 12.0 x10^9/L").
const formatRange = (
  lo: number | null,
  hi: number | null,
  unit: string,
): string => {
  if (lo == null && hi == null) return '';
  // Render unit using "x10^N/L" style for the analyzer-native units; pass
  // through everything else as-is.
  const displayUnit = unit.startsWith('10^') ? `x${unit}` : unit;
  if (lo != null && hi != null) return `${lo} - ${hi}${displayUnit ? ' ' + displayUnit : ''}`;
  if (lo != null) return `> ${lo}${displayUnit ? ' ' + displayUnit : ''}`;
  return `< ${hi}${displayUnit ? ' ' + displayUnit : ''}`;
};

// FBC parameter list — the parameter NAMES are the same across age/sex,
// only the reference ranges differ. We define the parameter scaffold once
// and inject ranges from the per-variant tables below.
const fbcParameterTemplate = (
  ranges: Record<string, [number | null, number | null]>,
  ageGroup: ParameterSeed['age_group'],
  sex: ParameterSeed['sex'],
): ParameterSeed[] => {
  const p = (
    name: string,
    code: string,
    unit: string,
    rangeKey: string,
    refText: string,
    section: string,
    sort: number,
  ): ParameterSeed => {
    const [lo, hi] = ranges[rangeKey] ?? [null, null];
    return {
      parameter_name: name,
      parameter_code: code,
      value_type: 'numeric',
      unit,
      normal_low: lo ?? undefined,
      normal_high: hi ?? undefined,
      // Use the explicit refText if provided; otherwise derive from the
      // range so every row in the printed report has something legible.
      reference_range_text: refText || formatRange(lo, hi, unit),
      age_group: ageGroup,
      sex,
      section_label: section,
      sort_order: sort,
    };
  };
  return [
    p('Total White cell Count', 'WBC', '10^9/L', 'WBC', '', 'White Blood Cells', 10),
    p('Neutrophils # (NEU)', 'NEU_ABS', '10^9/L', 'NEU_ABS', '', 'Differential Leucocyte Count', 20),
    p('Lymphocytes # (LYMP)', 'LYMP_ABS', '10^9/L', 'LYMP_ABS', '', 'Differential Leucocyte Count', 21),
    p('Monocytes # (MON)', 'MON_ABS', '10^9/L', 'MON_ABS', '', 'Differential Leucocyte Count', 22),
    p('Eosinophils # (EOS)', 'EOS_ABS', '10^9/L', 'EOS_ABS', '', 'Differential Leucocyte Count', 23),
    p('Basophils # (BASO)', 'BASO_ABS', '10^9/L', 'BASO_ABS', '', 'Differential Leucocyte Count', 24),
    p('Neutrophils %', 'NEU_PCT', '%', 'NEU_PCT', '', 'Differential Leucocyte Count', 30),
    p('Lymphocytes %', 'LYMP_PCT', '%', 'LYMP_PCT', '', 'Differential Leucocyte Count', 31),
    p('Monocytes %', 'MON_PCT', '%', 'MON_PCT', '', 'Differential Leucocyte Count', 32),
    p('Eosinophils %', 'EOS_PCT', '%', 'EOS_PCT', '', 'Differential Leucocyte Count', 33),
    p('Basophils %', 'BASO_PCT', '%', 'BASO_PCT', '', 'Differential Leucocyte Count', 34),
    p('Total RBC Count', 'RBC', '10^12/L', 'RBC', '', 'Red Blood Cells', 40),
    p('Haemoglobin (Hgb)', 'HGB', 'g/dL', 'HGB', '', 'Red Blood Cells', 41),
    p('Haematocrit Value (Hct)', 'HCT', '%', 'HCT', '', 'Red Blood Cells', 42),
    p('Mean Corpuscular Volume (MCV)', 'MCV', 'fL', 'MCV', '', 'Red Blood Cells', 43),
    p('Mean Cell Haemoglobin (MCH)', 'MCH', 'pg', 'MCH', '', 'Red Blood Cells', 44),
    p('Mean Cell Haemoglobin Concentration (MCHC)', 'MCHC', 'g/dL', 'MCHC', '', 'Red Blood Cells', 45),
    p('RDW-CV', 'RDW_CV', '%', 'RDW_CV', '(11-16) %', 'Red Blood Cells', 46),
    p('RDW-SD', 'RDW_SD', 'fL', 'RDW_SD', '(35-56) fL', 'Red Blood Cells', 47),
    p('Platelet Count (PLT)', 'PLT', '10^9/L', 'PLT', '', 'Platelets', 50),
    p('Mean Platelet Volume (MPV)', 'MPV', 'fL', 'MPV', '(6.5-12.0) fL', 'Platelets', 51),
    p('Platelet Distribution Width (PDW)', 'PDW', 'fL', 'PDW', '(9.0-17.0) fL', 'Platelets', 52),
    p('Plateletcrit (PCT)', 'PCT', '%', 'PCT', '(0.108-0.282) %', 'Platelets', 53),
    p('P-LCC', 'P_LCC', '10^9/L', 'P_LCC', '(30-90) x10^9/L', 'Platelets', 54),
    p('P-LCR', 'P_LCR', '%', 'P_LCR', '(11-45) %', 'Platelets', 55),
  ];
};

const fbcAdultFemaleRanges: Record<string, [number, number]> = {
  WBC: [4.0, 12.0], NEU_ABS: [2.0, 7.5], LYMP_ABS: [1.0, 4.0], MON_ABS: [0.2, 1.0],
  EOS_ABS: [0.0, 0.5], BASO_ABS: [0.0, 0.3],
  NEU_PCT: [40, 75], LYMP_PCT: [20, 40], MON_PCT: [3, 10], EOS_PCT: [0.4, 8.0], BASO_PCT: [0, 1.0],
  RBC: [3.8, 5.8], HGB: [11.5, 16.5], HCT: [36, 47],
  MCV: [76, 99], MCH: [26, 34], MCHC: [30, 37],
  RDW_CV: [11, 16], RDW_SD: [35, 56],
  PLT: [150, 450], MPV: [6.5, 12.0], PDW: [9.0, 17.0], PCT: [0.108, 0.282],
  P_LCC: [30, 90], P_LCR: [11, 45],
};

const fbcAdultMaleRanges: Record<string, [number, number]> = {
  ...fbcAdultFemaleRanges,
  HGB: [13.0, 17.0], HCT: [40, 50], RBC: [4.3, 5.9],
};

const fbcChild6_12Ranges: Record<string, [number, number]> = {
  WBC: [5.0, 15.0], NEU_ABS: [1.5, 8.0], LYMP_ABS: [1.5, 7.0], MON_ABS: [0.2, 0.8],
  EOS_ABS: [0.0, 0.45], BASO_ABS: [0.0, 0.2],
  NEU_PCT: [40, 60], LYMP_PCT: [25, 45], MON_PCT: [2.0, 8.0], EOS_PCT: [1.0, 4.0], BASO_PCT: [0, 2.0],
  RBC: [3.9, 5.3], HGB: [11.5, 14.5], HCT: [35, 44],
  MCV: [73, 89], MCH: [24, 30], MCHC: [30, 37],
  RDW_CV: [11, 16], RDW_SD: [35, 56],
  PLT: [150, 450], MPV: [6.5, 12.0], PDW: [9.0, 17.0], PCT: [0.108, 0.282],
  P_LCC: [30, 90], P_LCR: [11, 45],
};

const fbcChildUnder6Ranges: Record<string, [number, number]> = {
  WBC: [4.0, 12.0], NEU_ABS: [2.0, 8.0], LYMP_ABS: [0.8, 7.0], MON_ABS: [0.12, 1.20],
  EOS_ABS: [0.02, 0.80], BASO_ABS: [0.0, 0.1],
  NEU_PCT: [50, 70], LYMP_PCT: [20, 60], MON_PCT: [3.0, 12.0], EOS_PCT: [0.5, 5.0], BASO_PCT: [0, 1.0],
  RBC: [3.5, 5.2], HGB: [12.0, 16.0], HCT: [35, 49],
  MCV: [80, 100], MCH: [27, 34], MCHC: [31, 37],
  RDW_CV: [11, 16], RDW_SD: [35, 56],
  PLT: [100, 300], MPV: [6.5, 12.0], PDW: [9.0, 17.0], PCT: [0.108, 0.282],
  P_LCC: [30, 90], P_LCR: [11, 45],
};

export const labTestTemplates: TestTemplateSeed[] = [
  // ---------------- Single-value glucose tests ----------------
  {
    test_name: 'Fasting Blood Sugar',
    test_code: 'FBS',
    category: 'chemistry',
    specimen_type: 'venous blood',
    parameters: [
      {
        parameter_name: 'Fasting blood glucose',
        parameter_code: 'FBS',
        value_type: 'numeric',
        unit: 'mmol/l',
        normal_low: 3.9,
        normal_high: 5.9,
        critical_low: 2.5,
        critical_high: 25.0,
        reference_range_text: '3.9 - 5.9 mmol/l',
        sort_order: 10,
      },
    ],
  },
  {
    test_name: 'Random Blood Sugar',
    test_code: 'RBS',
    category: 'chemistry',
    specimen_type: 'venous blood',
    parameters: [
      {
        parameter_name: 'Random blood glucose',
        parameter_code: 'RBS',
        value_type: 'numeric',
        unit: 'mmol/l',
        normal_low: 3.9,
        normal_high: 7.7,
        critical_low: 2.5,
        critical_high: 25.0,
        reference_range_text: '3.9 - 7.7 mmol/l',
        sort_order: 10,
      },
    ],
  },

  // ---------------- FBC variants ----------------
  {
    test_name: 'Full Blood Count (Adult Female)',
    test_code: 'FBC_AF',
    category: 'haematology',
    specimen_type: 'EDTA blood',
    parameters: fbcParameterTemplate(fbcAdultFemaleRanges, 'adult', 'F'),
  },
  {
    test_name: 'Full Blood Count (Adult Male)',
    test_code: 'FBC_AM',
    category: 'haematology',
    specimen_type: 'EDTA blood',
    parameters: fbcParameterTemplate(fbcAdultMaleRanges, 'adult', 'M'),
  },
  {
    test_name: 'Full Blood Count (Child 6-12)',
    test_code: 'FBC_C6',
    category: 'haematology',
    specimen_type: 'EDTA blood',
    parameters: fbcParameterTemplate(fbcChild6_12Ranges, 'child_6_12', null),
  },
  {
    test_name: 'Full Blood Count (Child Under 6)',
    test_code: 'FBC_CU',
    category: 'haematology',
    specimen_type: 'EDTA blood',
    parameters: fbcParameterTemplate(fbcChildUnder6Ranges, 'child_under_6', null),
  },

  // ---------------- BUE & Creatinine ----------------
  {
    test_name: 'BUE & Creatinine (Female)',
    test_code: 'BUE_F',
    category: 'chemistry',
    specimen_type: 'serum',
    parameters: [
      { parameter_name: 'Serum Sodium (Na+)', parameter_code: 'NA', value_type: 'numeric', unit: 'mmol/l', normal_low: 136, normal_high: 145, critical_low: 120, critical_high: 160, reference_range_text: '136-145 mmol/l', sex: 'F', sort_order: 10 },
      { parameter_name: 'Serum Potassium (K+)', parameter_code: 'K', value_type: 'numeric', unit: 'mmol/l', normal_low: 3.5, normal_high: 5.1, critical_low: 2.5, critical_high: 6.5, reference_range_text: '3.5 - 5.1 mmol/l', sex: 'F', sort_order: 11 },
      { parameter_name: 'Serum Chloride (Cl-)', parameter_code: 'CL', value_type: 'numeric', unit: 'mmol/l', normal_low: 96, normal_high: 108, reference_range_text: '96-108 mmol/l', sex: 'F', sort_order: 12 },
      { parameter_name: 'Creatinine', parameter_code: 'CREAT', value_type: 'numeric', unit: 'umol/l', normal_low: 44, normal_high: 90, critical_high: 442, reference_range_text: '44 - 90 umol/l', sex: 'F', sort_order: 13 },
      { parameter_name: 'Urea', parameter_code: 'UREA', value_type: 'numeric', unit: 'mmol/l', normal_low: 2.1, normal_high: 7.1, reference_range_text: '2.1 - 7.1 mmol/l', sex: 'F', sort_order: 14 },
      { parameter_name: 'eGFR (CKD-EPI 2021)', parameter_code: 'EGFR', value_type: 'text', unit: 'mL/min', reference_range_text: '> 60 mL/min normal', sex: 'F', sort_order: 15 },
    ],
  },
  {
    test_name: 'BUE & Creatinine (Male)',
    test_code: 'BUE_M',
    category: 'chemistry',
    specimen_type: 'serum',
    parameters: [
      { parameter_name: 'Serum Sodium (Na+)', parameter_code: 'NA', value_type: 'numeric', unit: 'mmol/l', normal_low: 136, normal_high: 145, critical_low: 120, critical_high: 160, reference_range_text: '136-145 mmol/l', sex: 'M', sort_order: 10 },
      { parameter_name: 'Serum Potassium (K+)', parameter_code: 'K', value_type: 'numeric', unit: 'mmol/l', normal_low: 3.5, normal_high: 5.1, critical_low: 2.5, critical_high: 6.5, reference_range_text: '3.5 - 5.1 mmol/l', sex: 'M', sort_order: 11 },
      { parameter_name: 'Serum Chloride (Cl-)', parameter_code: 'CL', value_type: 'numeric', unit: 'mmol/l', normal_low: 96, normal_high: 108, reference_range_text: '96-108 mmol/l', sex: 'M', sort_order: 12 },
      { parameter_name: 'Creatinine', parameter_code: 'CREAT', value_type: 'numeric', unit: 'umol/l', normal_low: 53, normal_high: 106, critical_high: 442, reference_range_text: '53 - 106 umol/l', sex: 'M', sort_order: 13 },
      { parameter_name: 'Urea', parameter_code: 'UREA', value_type: 'numeric', unit: 'mmol/l', normal_low: 2.1, normal_high: 7.1, reference_range_text: '2.1 - 7.1 mmol/l', sex: 'M', sort_order: 14 },
      { parameter_name: 'eGFR (CKD-EPI 2021)', parameter_code: 'EGFR', value_type: 'text', unit: 'mL/min', reference_range_text: '> 60 mL/min normal', sex: 'M', sort_order: 15 },
    ],
  },

  // ---------------- Lipid Profile ----------------
  {
    test_name: 'Lipid Profile (Female)',
    test_code: 'LIPID_F',
    category: 'chemistry',
    specimen_type: 'serum (fasting)',
    parameters: [
      { parameter_name: 'Total Cholesterol', parameter_code: 'TCHOL', value_type: 'numeric', unit: 'mmol/l', normal_high: 5.2, reference_range_text: '< 5.2 mmol/l', sex: 'F', sort_order: 10 },
      { parameter_name: 'Triglyceride', parameter_code: 'TG', value_type: 'numeric', unit: 'mmol/l', normal_high: 1.7, reference_range_text: '< 1.7 mmol/l', sex: 'F', sort_order: 11 },
      { parameter_name: 'High Density Lipoprotein (HDL-C)', parameter_code: 'HDL', value_type: 'numeric', unit: 'mmol/l', normal_low: 1.68, reference_range_text: '> 1.68 mmol/l', sex: 'F', sort_order: 12 },
      { parameter_name: 'Non-HDL Cholesterol', parameter_code: 'NHDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 3.8, reference_range_text: '< 3.8 mmol/l', sex: 'F', sort_order: 13 },
      { parameter_name: 'Low Density Lipoprotein (LDL)', parameter_code: 'LDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 3.0, reference_range_text: '< 3.0 mmol/l', sex: 'F', sort_order: 14 },
      { parameter_name: 'Very Low-Density Lipoprotein (VLDL)', parameter_code: 'VLDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 0.78, reference_range_text: '< 0.78 mmol/l', sex: 'F', sort_order: 15 },
      { parameter_name: 'Coronary Risk (TCHOL/HDL Ratio)', parameter_code: 'TCHOL_HDL', value_type: 'numeric', normal_high: 4.1, reference_range_text: '< 4.1', sex: 'F', sort_order: 16 },
    ],
  },
  {
    test_name: 'Lipid Profile (Male)',
    test_code: 'LIPID_M',
    category: 'chemistry',
    specimen_type: 'serum (fasting)',
    parameters: [
      { parameter_name: 'Total Cholesterol', parameter_code: 'TCHOL', value_type: 'numeric', unit: 'mmol/l', normal_high: 5.2, reference_range_text: '< 5.2 mmol/l', sex: 'M', sort_order: 10 },
      { parameter_name: 'Triglyceride', parameter_code: 'TG', value_type: 'numeric', unit: 'mmol/l', normal_high: 1.7, reference_range_text: '< 1.7 mmol/l', sex: 'M', sort_order: 11 },
      { parameter_name: 'High Density Lipoprotein (HDL-C)', parameter_code: 'HDL', value_type: 'numeric', unit: 'mmol/l', normal_low: 1.45, reference_range_text: '> 1.45 mmol/l', sex: 'M', sort_order: 12 },
      { parameter_name: 'Non-HDL Cholesterol', parameter_code: 'NHDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 3.8, reference_range_text: '< 3.8 mmol/l', sex: 'M', sort_order: 13 },
      { parameter_name: 'Low Density Lipoprotein (LDL)', parameter_code: 'LDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 3.0, reference_range_text: '< 3.0 mmol/l', sex: 'M', sort_order: 14 },
      { parameter_name: 'Very Low-Density Lipoprotein (VLDL)', parameter_code: 'VLDL', value_type: 'numeric', unit: 'mmol/l', normal_high: 0.78, reference_range_text: '< 0.78 mmol/l', sex: 'M', sort_order: 15 },
      { parameter_name: 'Coronary Risk (TCHOL/HDL Ratio)', parameter_code: 'TCHOL_HDL', value_type: 'numeric', normal_high: 4.1, reference_range_text: '< 4.1', sex: 'M', sort_order: 16 },
    ],
  },

  // ---------------- LFT ----------------
  {
    test_name: 'Liver Function Test (Female)',
    test_code: 'LFT_F',
    category: 'chemistry',
    specimen_type: 'serum',
    parameters: [
      { parameter_name: 'Alanine aminotransferase (ALT)', parameter_code: 'ALT', value_type: 'numeric', unit: 'IU/L', normal_low: 0, normal_high: 33, reference_range_text: '0 - 33 IU/L', sex: 'F', sort_order: 10 },
      { parameter_name: 'Aspartate aminotransferase (AST)', parameter_code: 'AST', value_type: 'numeric', unit: 'IU/L', normal_low: 0, normal_high: 32, reference_range_text: '0 - 32 IU/L', sex: 'F', sort_order: 11 },
      { parameter_name: 'Alkaline Phosphatase (ALP)', parameter_code: 'ALP', value_type: 'numeric', unit: 'IU/L', normal_low: 35, normal_high: 105, reference_range_text: '35 - 105 IU/L', sex: 'F', sort_order: 12 },
      { parameter_name: 'Gamma-glutamyl transferase (GGT)', parameter_code: 'GGT', value_type: 'numeric', unit: 'IU/L', normal_high: 38, reference_range_text: '< 38 IU/L', sex: 'F', sort_order: 13 },
      { parameter_name: 'Total Protein (TP)', parameter_code: 'TP', value_type: 'numeric', unit: 'g/L', normal_low: 60, normal_high: 83, reference_range_text: '60 - 83 g/L', sex: 'F', sort_order: 14 },
      { parameter_name: 'Albumin (ALB)', parameter_code: 'ALB', value_type: 'numeric', unit: 'g/L', normal_low: 35, normal_high: 52, reference_range_text: '35 - 52 g/L', sex: 'F', sort_order: 15 },
      { parameter_name: 'Globulin (GLB)', parameter_code: 'GLB', value_type: 'numeric', unit: 'g/dL', normal_low: 20, normal_high: 35, reference_range_text: '20 - 35 g/dL', sex: 'F', sort_order: 16 },
      { parameter_name: 'Total Bilirubin (TBIL)', parameter_code: 'TBIL', value_type: 'numeric', unit: 'umol/l', normal_low: 3.4, normal_high: 20.5, reference_range_text: '3.4 - 20.5 umol/l', sex: 'F', sort_order: 17 },
      { parameter_name: 'Direct/Conjugated Bilirubin (DBIL)', parameter_code: 'DBIL', value_type: 'numeric', unit: 'umol/l', normal_high: 5, reference_range_text: '< 5 umol/l', sex: 'F', sort_order: 18 },
      { parameter_name: 'Indirect/Unconjugated Bilirubin (IBIL)', parameter_code: 'IBIL', value_type: 'numeric', unit: 'umol/l', normal_high: 18.8, reference_range_text: '< 18.8 umol/l', sex: 'F', sort_order: 19 },
    ],
  },
  {
    test_name: 'Liver Function Test (Male)',
    test_code: 'LFT_M',
    category: 'chemistry',
    specimen_type: 'serum',
    parameters: [
      { parameter_name: 'Alanine aminotransferase (ALT)', parameter_code: 'ALT', value_type: 'numeric', unit: 'IU/L', normal_low: 0, normal_high: 41, reference_range_text: '0 - 41 IU/L', sex: 'M', sort_order: 10 },
      { parameter_name: 'Aspartate aminotransferase (AST)', parameter_code: 'AST', value_type: 'numeric', unit: 'IU/L', normal_low: 0, normal_high: 40, reference_range_text: '0 - 40 IU/L', sex: 'M', sort_order: 11 },
      { parameter_name: 'Alkaline Phosphatase (ALP)', parameter_code: 'ALP', value_type: 'numeric', unit: 'IU/L', normal_low: 40, normal_high: 130, reference_range_text: '40 - 130 IU/L', sex: 'M', sort_order: 12 },
      { parameter_name: 'Gamma-glutamyl transferase (GGT)', parameter_code: 'GGT', value_type: 'numeric', unit: 'IU/L', normal_high: 38, reference_range_text: '< 38 IU/L', sex: 'M', sort_order: 13 },
      { parameter_name: 'Total Protein (TP)', parameter_code: 'TP', value_type: 'numeric', unit: 'g/L', normal_low: 60, normal_high: 83, reference_range_text: '60 - 83 g/L', sex: 'M', sort_order: 14 },
      { parameter_name: 'Albumin (ALB)', parameter_code: 'ALB', value_type: 'numeric', unit: 'g/L', normal_low: 35, normal_high: 52, reference_range_text: '35 - 52 g/L', sex: 'M', sort_order: 15 },
      { parameter_name: 'Globulin (GLB)', parameter_code: 'GLB', value_type: 'numeric', unit: 'g/dL', normal_low: 20, normal_high: 35, reference_range_text: '20 - 35 g/dL', sex: 'M', sort_order: 16 },
      { parameter_name: 'Total Bilirubin (TBIL)', parameter_code: 'TBIL', value_type: 'numeric', unit: 'umol/l', normal_low: 3.4, normal_high: 20.5, reference_range_text: '3.4 - 20.5 umol/l', sex: 'M', sort_order: 17 },
      { parameter_name: 'Direct/Conjugated Bilirubin (DBIL)', parameter_code: 'DBIL', value_type: 'numeric', unit: 'umol/l', normal_high: 5, reference_range_text: '< 5 umol/l', sex: 'M', sort_order: 18 },
      { parameter_name: 'Indirect/Unconjugated Bilirubin (IBIL)', parameter_code: 'IBIL', value_type: 'numeric', unit: 'umol/l', normal_high: 18.8, reference_range_text: '< 18.8 umol/l', sex: 'M', sort_order: 19 },
    ],
  },

  // ---------------- Qualitative single-result tests ----------------
  {
    test_name: 'Malaria ICT',
    test_code: 'MAL_ICT',
    category: 'microbiology',
    specimen_type: 'whole blood',
    notes: 'Standard Q malaria rapid diagnostic test kit',
    parameters: [
      { parameter_name: 'Malaria ICT', parameter_code: 'MAL', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', reference_range_text: 'Negative', sort_order: 10 },
    ],
  },
  {
    test_name: 'H. pylori Antigen',
    test_code: 'HPYL',
    category: 'microbiology',
    specimen_type: 'stool',
    notes: 'One Step H. pylori Ag test kit',
    parameters: [
      { parameter_name: 'H. Pylori Ag', parameter_code: 'HPYL', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', reference_range_text: 'Negative', sort_order: 10 },
    ],
  },
  {
    test_name: 'HBsAg',
    test_code: 'HBSAG',
    category: 'serology',
    specimen_type: 'serum',
    notes: 'JusChek+ rapid diagnostic test kit',
    parameters: [
      { parameter_name: 'HBsAg', parameter_code: 'HBSAG', value_type: 'qualitative', qualitative_options: QUAL_REACTIVE, default_qualitative_value: 'Non-Reactive', reference_range_text: 'Non-Reactive', sort_order: 10 },
    ],
  },
  {
    test_name: 'Treponema pallidum Antibodies',
    test_code: 'TP_ABS',
    category: 'serology',
    specimen_type: 'serum',
    notes: 'JusChek+ syphilis rapid diagnostic test kit',
    parameters: [
      { parameter_name: 'TP Antibodies Screen', parameter_code: 'TP', value_type: 'qualitative', qualitative_options: QUAL_REACTIVE, default_qualitative_value: 'Non-Reactive', reference_range_text: 'Non-Reactive', sort_order: 10 },
    ],
  },
  {
    test_name: 'Pregnancy Test (b-hCG)',
    test_code: 'HCG',
    category: 'serology',
    specimen_type: 'urine',
    parameters: [
      { parameter_name: 'Urine hCG', parameter_code: 'HCG', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', reference_range_text: 'Negative', sort_order: 10 },
    ],
  },
  {
    test_name: 'Typhoid IgG/IgM',
    test_code: 'TYPH',
    category: 'serology',
    specimen_type: 'serum',
    notes: 'JusChek Typhoid rapid diagnostic test kit',
    parameters: [
      { parameter_name: 'Typhoid IgG', parameter_code: 'TYPH_IGG', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', reference_range_text: 'Negative', sort_order: 10 },
      { parameter_name: 'Typhoid IgM', parameter_code: 'TYPH_IGM', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', reference_range_text: 'Negative', sort_order: 11 },
    ],
  },

  // ---------------- Urinalysis ----------------
  {
    test_name: 'Urinalysis',
    test_code: 'URINE',
    category: 'urinalysis',
    specimen_type: 'random midstream urine',
    parameters: [
      // Macroscopy
      { parameter_name: 'Colour', parameter_code: 'URINE_COLOUR', value_type: 'qualitative', qualitative_options: 'Straw|Pale Yellow|Yellow|Dark Yellow|Amber|Red|Brown', default_qualitative_value: 'Straw', section_label: 'Urine Macroscopy', sort_order: 10 },
      { parameter_name: 'Clarity', parameter_code: 'URINE_CLARITY', value_type: 'qualitative', qualitative_options: 'Clear|Hazy|Cloudy|Turbid', default_qualitative_value: 'Clear', section_label: 'Urine Macroscopy', sort_order: 11 },
      // Chemistries
      { parameter_name: 'Glucose', parameter_code: 'URINE_GLU', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 20 },
      { parameter_name: 'Urobilinogen', parameter_code: 'URINE_UROBIL', value_type: 'qualitative', qualitative_options: QUAL_UROBIL, default_qualitative_value: 'Normal', section_label: 'Urine Chemistries', sort_order: 21 },
      { parameter_name: 'Bilirubin', parameter_code: 'URINE_BIL', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 22 },
      { parameter_name: 'Leucocyte Esterase', parameter_code: 'URINE_LEU', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 23 },
      { parameter_name: 'Nitrite', parameter_code: 'URINE_NIT', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 24 },
      { parameter_name: 'Ketone', parameter_code: 'URINE_KET', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 25 },
      { parameter_name: 'Protein', parameter_code: 'URINE_PROT', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 26 },
      { parameter_name: 'Specific Gravity', parameter_code: 'URINE_SG', value_type: 'numeric', normal_low: 1.005, normal_high: 1.030, reference_range_text: '1.005 - 1.030', section_label: 'Urine Chemistries', sort_order: 27 },
      { parameter_name: 'pH', parameter_code: 'URINE_PH', value_type: 'numeric', normal_low: 4.5, normal_high: 8.0, reference_range_text: '4.5 - 8.0', section_label: 'Urine Chemistries', sort_order: 28 },
      { parameter_name: 'Blood', parameter_code: 'URINE_BLOOD', value_type: 'qualitative', qualitative_options: QUAL_URINE_CHEM, default_qualitative_value: 'Negative', section_label: 'Urine Chemistries', sort_order: 29 },
      // Microscopy
      { parameter_name: 'Pus Cells', parameter_code: 'URINE_PUS', value_type: 'text', unit: '/HPF', reference_range_text: '0-5 /HPF', section_label: 'Urine Microscopy', sort_order: 30 },
      { parameter_name: 'Epithelial Cells', parameter_code: 'URINE_EPI', value_type: 'text', unit: '/HPF', reference_range_text: 'Few', section_label: 'Urine Microscopy', sort_order: 31 },
      { parameter_name: 'Red Blood Cells', parameter_code: 'URINE_RBC', value_type: 'text', unit: '/HPF', reference_range_text: '0-2 /HPF', section_label: 'Urine Microscopy', sort_order: 32 },
      { parameter_name: 'Casts', parameter_code: 'URINE_CAST', value_type: 'qualitative', qualitative_options: QUAL_OBSERVED, default_qualitative_value: 'Not observed', section_label: 'Urine Microscopy', sort_order: 33 },
      { parameter_name: 'Crystals', parameter_code: 'URINE_CRYS', value_type: 'qualitative', qualitative_options: QUAL_OBSERVED, default_qualitative_value: 'Not observed', section_label: 'Urine Microscopy', sort_order: 34 },
      { parameter_name: 'Others', parameter_code: 'URINE_OTHER', value_type: 'text', section_label: 'Urine Microscopy', sort_order: 35 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // Additional templates — added after go-live audit. Reference ranges
  // are standard adult values; verify with William before relying on
  // critical-value alerts in production.
  // ─────────────────────────────────────────────────────────────────

  // CMP — Comprehensive Metabolic Panel (14 analytes). Doctors commonly
  // order this generically; results go into a structured table.
  {
    test_name: 'Comprehensive Metabolic Panel',
    test_code: 'CMP',
    category: 'chemistry',
    specimen_type: 'Serum',
    parameters: [
      { parameter_name: 'Glucose',          parameter_code: 'CMP_GLU',  value_type: 'numeric', unit: 'mg/dL', normal_low: 70,  normal_high: 99,  critical_low: 50,  critical_high: 400, sort_order: 1 },
      { parameter_name: 'BUN',              parameter_code: 'CMP_BUN',  value_type: 'numeric', unit: 'mg/dL', normal_low: 7,   normal_high: 20,                                       sort_order: 2 },
      { parameter_name: 'Creatinine',       parameter_code: 'CMP_CR',   value_type: 'numeric', unit: 'mg/dL', normal_low: 0.6, normal_high: 1.3, critical_high: 5,                    sort_order: 3 },
      { parameter_name: 'eGFR',             parameter_code: 'CMP_EGFR', value_type: 'numeric', unit: 'mL/min/1.73m²', normal_low: 60, normal_high: 120,                              sort_order: 4 },
      { parameter_name: 'Sodium',           parameter_code: 'CMP_NA',   value_type: 'numeric', unit: 'mmol/L', normal_low: 136, normal_high: 145, critical_low: 120, critical_high: 160, sort_order: 5 },
      { parameter_name: 'Potassium',        parameter_code: 'CMP_K',    value_type: 'numeric', unit: 'mmol/L', normal_low: 3.5, normal_high: 5.1, critical_low: 2.5, critical_high: 6.5, sort_order: 6 },
      { parameter_name: 'Chloride',         parameter_code: 'CMP_CL',   value_type: 'numeric', unit: 'mmol/L', normal_low: 98,  normal_high: 107,                                       sort_order: 7 },
      { parameter_name: 'CO2',              parameter_code: 'CMP_CO2',  value_type: 'numeric', unit: 'mmol/L', normal_low: 22,  normal_high: 29,                                        sort_order: 8 },
      { parameter_name: 'Calcium',          parameter_code: 'CMP_CA',   value_type: 'numeric', unit: 'mg/dL',  normal_low: 8.5, normal_high: 10.2, critical_low: 6, critical_high: 13,    sort_order: 9 },
      { parameter_name: 'Total Protein',    parameter_code: 'CMP_TP',   value_type: 'numeric', unit: 'g/dL',   normal_low: 6.0, normal_high: 8.3,                                       sort_order: 10 },
      { parameter_name: 'Albumin',          parameter_code: 'CMP_ALB',  value_type: 'numeric', unit: 'g/dL',   normal_low: 3.5, normal_high: 5.0,                                       sort_order: 11 },
      { parameter_name: 'Total Bilirubin',  parameter_code: 'CMP_TBIL', value_type: 'numeric', unit: 'mg/dL',  normal_low: 0.1, normal_high: 1.2,                                       sort_order: 12 },
      { parameter_name: 'ALP',              parameter_code: 'CMP_ALP',  value_type: 'numeric', unit: 'U/L',    normal_low: 44,  normal_high: 147,                                       sort_order: 13 },
      { parameter_name: 'AST',              parameter_code: 'CMP_AST',  value_type: 'numeric', unit: 'U/L',    normal_low: 10,  normal_high: 40,                                        sort_order: 14 },
      { parameter_name: 'ALT',              parameter_code: 'CMP_ALT',  value_type: 'numeric', unit: 'U/L',    normal_low: 7,   normal_high: 56,                                        sort_order: 15 },
    ],
  },

  // HbA1c — glycated haemoglobin (single value, % and mmol/mol).
  {
    test_name: 'Hemoglobin A1C',
    test_code: 'HbA1c',
    category: 'chemistry',
    specimen_type: 'EDTA whole blood',
    parameters: [
      { parameter_name: 'HbA1c',     parameter_code: 'HBA1C',     value_type: 'numeric', unit: '%',         normal_low: 4.0, normal_high: 5.6, reference_range_text: '<5.7% normal · 5.7–6.4% prediabetes · ≥6.5% diabetes', sort_order: 1 },
      { parameter_name: 'eAG',       parameter_code: 'HBA1C_EAG', value_type: 'numeric', unit: 'mg/dL',     reference_range_text: 'Estimated average glucose', sort_order: 2 },
    ],
  },

  // TSH — thyroid function (single value).
  {
    test_name: 'Thyroid Stimulating Hormone',
    test_code: 'TSH',
    category: 'chemistry',
    specimen_type: 'Serum',
    parameters: [
      { parameter_name: 'TSH', parameter_code: 'TSH', value_type: 'numeric', unit: 'mIU/L', normal_low: 0.4, normal_high: 4.0, critical_low: 0.01, critical_high: 100, sort_order: 1 },
    ],
  },

  // HIV antibody screen — qualitative.
  {
    test_name: 'HIV Antibody Test',
    test_code: 'HIV',
    category: 'serology',
    specimen_type: 'Serum / whole blood',
    parameters: [
      { parameter_name: 'HIV 1/2 Antibody', parameter_code: 'HIV_AB', value_type: 'qualitative', qualitative_options: QUAL_REACTIVE, default_qualitative_value: 'Non-Reactive', reference_range_text: 'Non-Reactive', sort_order: 1 },
    ],
  },

  // ESR — Erythrocyte Sedimentation Rate. Different ranges by sex/age;
  // we use a wider reference and let critical_high catch outliers.
  {
    test_name: 'Erythrocyte Sedimentation Rate',
    test_code: 'ESR',
    category: 'haematology',
    specimen_type: 'EDTA whole blood',
    parameters: [
      { parameter_name: 'ESR', parameter_code: 'ESR', value_type: 'numeric', unit: 'mm/hr', normal_low: 0, normal_high: 20, critical_high: 100, reference_range_text: 'M ≤15 · F ≤20 (Westergren)', sort_order: 1 },
    ],
  },

  // Malaria Parasite — RDT (qualitative) + smear species + parasitaemia.
  {
    test_name: 'Malaria Parasite (RDT)',
    test_code: 'MP',
    category: 'microbiology',
    specimen_type: 'Whole blood',
    parameters: [
      { parameter_name: 'Malaria Antigen', parameter_code: 'MP_AG', value_type: 'qualitative', qualitative_options: QUAL_POSITIVE, default_qualitative_value: 'Negative', sort_order: 1 },
      { parameter_name: 'Species',         parameter_code: 'MP_SP', value_type: 'text', reference_range_text: 'P. falciparum / vivax / ovale / malariae if positive', sort_order: 2 },
      { parameter_name: 'Parasitaemia',    parameter_code: 'MP_PD', value_type: 'text', unit: '/µL', reference_range_text: 'Density if smear performed', sort_order: 3 },
    ],
  },

  // PT/INR — coagulation, two related values.
  {
    test_name: 'Prothrombin Time/INR',
    test_code: 'PT-INR',
    category: 'haematology',
    specimen_type: 'Citrate plasma',
    parameters: [
      { parameter_name: 'PT',  parameter_code: 'PT',  value_type: 'numeric', unit: 'seconds', normal_low: 11, normal_high: 13.5, critical_high: 30, sort_order: 1 },
      { parameter_name: 'INR', parameter_code: 'INR', value_type: 'numeric', unit: '',        normal_low: 0.8, normal_high: 1.2, critical_high: 5,  reference_range_text: 'Therapeutic 2.0–3.0 on warfarin', sort_order: 2 },
      { parameter_name: 'Control PT', parameter_code: 'PT_CTRL', value_type: 'numeric', unit: 'seconds', sort_order: 3 },
    ],
  },

  // BUN — Blood Urea Nitrogen (single value). Doctors order standalone.
  {
    test_name: 'Blood Urea Nitrogen',
    test_code: 'UREA',
    category: 'chemistry',
    specimen_type: 'Serum',
    parameters: [
      { parameter_name: 'BUN', parameter_code: 'BUN', value_type: 'numeric', unit: 'mg/dL', normal_low: 7, normal_high: 20, critical_high: 100, sort_order: 1 },
    ],
  },

  // Creatinine standalone (also part of CMP/BUE but commonly ordered alone).
  {
    test_name: 'Creatinine',
    test_code: 'CREAT',
    category: 'chemistry',
    specimen_type: 'Serum',
    parameters: [
      { parameter_name: 'Creatinine', parameter_code: 'CR',   value_type: 'numeric', unit: 'mg/dL',         normal_low: 0.6, normal_high: 1.3, critical_high: 5, reference_range_text: 'M 0.7–1.3 · F 0.6–1.1', sort_order: 1 },
      { parameter_name: 'eGFR',       parameter_code: 'EGFR', value_type: 'numeric', unit: 'mL/min/1.73m²', normal_low: 60, normal_high: 120, reference_range_text: 'CKD-EPI', sort_order: 2 },
    ],
  },

  // C-Reactive Protein — common addition; flagged in audit as a frequent
  // order with no catalog match.
  {
    test_name: 'C-Reactive Protein',
    test_code: 'CRP',
    category: 'chemistry',
    specimen_type: 'Serum',
    parameters: [
      { parameter_name: 'CRP', parameter_code: 'CRP', value_type: 'numeric', unit: 'mg/L', normal_low: 0, normal_high: 5, critical_high: 200, reference_range_text: '<5 normal · >10 inflammation', sort_order: 1 },
    ],
  },
];
