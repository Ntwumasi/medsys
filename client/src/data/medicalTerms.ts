/**
 * Medical Terminology Dictionary for Smart Autocomplete
 * Organized by category for context-aware suggestions
 */

export interface MedicalTerm {
  term: string;
  category: string;
  abbreviation?: string;
  description?: string;
}

// Common medical abbreviations
export const medicalAbbreviations: MedicalTerm[] = [
  { term: 'BID', category: 'frequency', abbreviation: 'BID', description: 'Twice daily' },
  { term: 'TID', category: 'frequency', abbreviation: 'TID', description: 'Three times daily' },
  { term: 'QID', category: 'frequency', abbreviation: 'QID', description: 'Four times daily' },
  { term: 'PRN', category: 'frequency', abbreviation: 'PRN', description: 'As needed' },
  { term: 'QD', category: 'frequency', abbreviation: 'QD', description: 'Once daily' },
  { term: 'QHS', category: 'frequency', abbreviation: 'QHS', description: 'At bedtime' },
  { term: 'AC', category: 'timing', abbreviation: 'AC', description: 'Before meals' },
  { term: 'PC', category: 'timing', abbreviation: 'PC', description: 'After meals' },
  { term: 'PO', category: 'route', abbreviation: 'PO', description: 'By mouth' },
  { term: 'IV', category: 'route', abbreviation: 'IV', description: 'Intravenous' },
  { term: 'IM', category: 'route', abbreviation: 'IM', description: 'Intramuscular' },
  { term: 'SQ', category: 'route', abbreviation: 'SQ', description: 'Subcutaneous' },
  { term: 'STAT', category: 'timing', abbreviation: 'STAT', description: 'Immediately' },
  { term: 'NPO', category: 'instruction', abbreviation: 'NPO', description: 'Nothing by mouth' },
  { term: 'WNL', category: 'finding', abbreviation: 'WNL', description: 'Within normal limits' },
  { term: 'NAD', category: 'finding', abbreviation: 'NAD', description: 'No acute distress' },
  { term: 'HEENT', category: 'exam', abbreviation: 'HEENT', description: 'Head, eyes, ears, nose, throat' },
  { term: 'RRR', category: 'finding', abbreviation: 'RRR', description: 'Regular rate and rhythm' },
  { term: 'CTA', category: 'finding', abbreviation: 'CTA', description: 'Clear to auscultation' },
  { term: 'NKDA', category: 'allergy', abbreviation: 'NKDA', description: 'No known drug allergies' },
  { term: 'SOB', category: 'symptom', abbreviation: 'SOB', description: 'Shortness of breath' },
  { term: 'CP', category: 'symptom', abbreviation: 'CP', description: 'Chest pain' },
  { term: 'HA', category: 'symptom', abbreviation: 'HA', description: 'Headache' },
  { term: 'N/V', category: 'symptom', abbreviation: 'N/V', description: 'Nausea and vomiting' },
  { term: 'BP', category: 'vitals', abbreviation: 'BP', description: 'Blood pressure' },
  { term: 'HR', category: 'vitals', abbreviation: 'HR', description: 'Heart rate' },
  { term: 'RR', category: 'vitals', abbreviation: 'RR', description: 'Respiratory rate' },
  { term: 'T', category: 'vitals', abbreviation: 'T', description: 'Temperature' },
  { term: 'O2 sat', category: 'vitals', abbreviation: 'O2 sat', description: 'Oxygen saturation' },
  { term: 'BMI', category: 'vitals', abbreviation: 'BMI', description: 'Body mass index' },
];

// Common symptoms and chief complaints
export const symptoms: string[] = [
  'abdominal pain',
  'back pain',
  'chest pain',
  'chronic cough',
  'constipation',
  'diarrhea',
  'dizziness',
  'dyspnea',
  'fatigue',
  'fever',
  'headache',
  'joint pain',
  'nausea',
  'palpitations',
  'rash',
  'shortness of breath',
  'sore throat',
  'swelling',
  'vomiting',
  'weakness',
  'weight loss',
  'weight gain',
];

// Common diagnoses/conditions
export const diagnoses: string[] = [
  'acute bronchitis',
  'acute sinusitis',
  'allergic rhinitis',
  'anxiety disorder',
  'asthma',
  'atrial fibrillation',
  'benign prostatic hyperplasia',
  'cellulitis',
  'chronic kidney disease',
  'chronic obstructive pulmonary disease',
  'congestive heart failure',
  'coronary artery disease',
  'deep vein thrombosis',
  'depression',
  'diabetes mellitus type 1',
  'diabetes mellitus type 2',
  'gastroesophageal reflux disease',
  'gout',
  'hyperlipidemia',
  'hypertension',
  'hypothyroidism',
  'iron deficiency anemia',
  'migraine',
  'obesity',
  'osteoarthritis',
  'osteoporosis',
  'otitis media',
  'peripheral neuropathy',
  'pneumonia',
  'rheumatoid arthritis',
  'urinary tract infection',
];

// Common medications
export const medications: string[] = [
  'acetaminophen',
  'albuterol',
  'amlodipine',
  'amoxicillin',
  'aspirin',
  'atenolol',
  'atorvastatin',
  'azithromycin',
  'carvedilol',
  'cephalexin',
  'ciprofloxacin',
  'clopidogrel',
  'doxycycline',
  'duloxetine',
  'escitalopram',
  'fluoxetine',
  'furosemide',
  'gabapentin',
  'hydrochlorothiazide',
  'ibuprofen',
  'levothyroxine',
  'lisinopril',
  'losartan',
  'metformin',
  'metoprolol',
  'naproxen',
  'omeprazole',
  'pantoprazole',
  'prednisone',
  'sertraline',
  'simvastatin',
  'tramadol',
  'trazodone',
  'warfarin',
];

// Physical exam findings (normal)
export const normalFindings: string[] = [
  'alert and oriented x3',
  'no acute distress',
  'normocephalic, atraumatic',
  'pupils equal, round, reactive to light',
  'extraocular movements intact',
  'tympanic membranes clear bilaterally',
  'oropharynx clear, no erythema',
  'neck supple, no lymphadenopathy',
  'no JVD',
  'lungs clear to auscultation bilaterally',
  'no wheezes, rales, or rhonchi',
  'regular rate and rhythm',
  'no murmurs, rubs, or gallops',
  'abdomen soft, non-tender, non-distended',
  'bowel sounds present in all quadrants',
  'no hepatosplenomegaly',
  'no peripheral edema',
  'pulses 2+ bilaterally',
  'skin warm and dry',
  'no rashes or lesions',
  'cranial nerves II-XII intact',
  'strength 5/5 in all extremities',
  'sensation intact to light touch',
  'gait steady',
  'mood and affect appropriate',
];

// Physical exam findings (abnormal)
export const abnormalFindings: string[] = [
  'appears ill',
  'in moderate distress',
  'diaphoretic',
  'pale',
  'jaundiced',
  'cyanotic',
  'tachycardic',
  'bradycardic',
  'tachypneic',
  'hypotensive',
  'hypertensive',
  'febrile',
  'lethargic',
  'confused',
  'agitated',
  'wheezing',
  'rhonchi',
  'crackles',
  'diminished breath sounds',
  'murmur',
  'irregular rhythm',
  'tenderness to palpation',
  'guarding',
  'rebound tenderness',
  'distension',
  'edema',
  'erythema',
  'swelling',
  'decreased range of motion',
  'weakness',
];

// Review of systems phrases
export const rosNegatives: string[] = [
  'denies fever',
  'denies chills',
  'denies weight changes',
  'denies fatigue',
  'denies headache',
  'denies vision changes',
  'denies hearing loss',
  'denies sore throat',
  'denies chest pain',
  'denies shortness of breath',
  'denies palpitations',
  'denies cough',
  'denies abdominal pain',
  'denies nausea',
  'denies vomiting',
  'denies diarrhea',
  'denies constipation',
  'denies dysuria',
  'denies hematuria',
  'denies joint pain',
  'denies muscle weakness',
  'denies rash',
  'denies numbness',
  'denies tingling',
  'denies depression',
  'denies anxiety',
];

// Procedure notes templates
export const procedureTerms: string[] = [
  'procedure performed without complications',
  'patient tolerated procedure well',
  'informed consent obtained',
  'sterile technique used',
  'time out performed',
  'site marked',
  'local anesthesia administered',
  'hemostasis achieved',
  'wound closed with',
  'sterile dressing applied',
  'post-procedure instructions given',
  'patient stable post-procedure',
];

// Plan/treatment phrases
export const planPhrases: string[] = [
  'continue current medications',
  'start',
  'discontinue',
  'increase dose of',
  'decrease dose of',
  'order labs',
  'order imaging',
  'refer to',
  'follow up in',
  'return if symptoms worsen',
  'educate patient on',
  'lifestyle modifications discussed',
  'diet and exercise counseling',
  'smoking cessation counseling',
  'return to clinic for',
  'call with results',
];

// Social history terms
export const socialHistoryTerms: string[] = [
  'never smoker',
  'former smoker',
  'current smoker',
  'pack-year history',
  'quit smoking',
  'social drinker',
  'denies alcohol use',
  'drinks per week',
  'denies illicit drug use',
  'marijuana use',
  'lives alone',
  'lives with family',
  'lives with spouse',
  'independent with ADLs',
  'requires assistance with',
  'retired',
  'employed as',
  'unemployed',
  'disabled',
  'exercises regularly',
  'sedentary lifestyle',
];

// Family history terms
export const familyHistoryTerms: string[] = [
  'family history of',
  'no family history of',
  'mother with',
  'father with',
  'sibling with',
  'maternal grandmother with',
  'paternal grandfather with',
  'heart disease',
  'cancer',
  'diabetes',
  'hypertension',
  'stroke',
  'mental illness',
  'autoimmune disease',
];

// Allergy terms
export const allergyTerms: string[] = [
  'no known drug allergies',
  'NKDA',
  'allergic to',
  'causes',
  'anaphylaxis',
  'hives',
  'rash',
  'swelling',
  'difficulty breathing',
  'GI upset',
  'penicillin',
  'sulfa drugs',
  'aspirin',
  'NSAIDs',
  'codeine',
  'morphine',
  'latex',
  'contrast dye',
  'shellfish',
  'peanuts',
  'tree nuts',
  'eggs',
  'dairy',
];

// Lab test orders
export const labTests: string[] = [
  'CBC',
  'CMP',
  'BMP',
  'Lipid Panel',
  'LFTs',
  'TSH',
  'HbA1c',
  'Urinalysis',
  'PT/INR',
  'PTT',
  'BNP',
  'Troponin',
  'D-dimer',
  'Blood Cultures',
  'Urine Culture',
  'Glucose',
  'Creatinine',
  'BUN',
  'Electrolytes',
  'Magnesium',
  'Phosphorus',
  'Vitamin D',
  'Vitamin B12',
  'Ferritin',
  'Iron Studies',
  'ESR',
  'CRP',
  'ANA',
  'Thyroid Panel',
  'Free T4',
  'Hemoglobin',
  'Hematocrit',
  'Platelet Count',
  'WBC',
  'RBC',
  'Procalcitonin',
  'Lactate',
  'ABG',
  'Blood Type and Screen',
  'Coagulation Panel',
];

// Imaging types
export const imagingTypes: string[] = [
  'X-Ray',
  'CT Scan',
  'CT with Contrast',
  'CT without Contrast',
  'MRI',
  'MRI with Contrast',
  'MRI without Contrast',
  'Ultrasound',
  'PET Scan',
  'DEXA Scan',
  'Mammography',
  'Fluoroscopy',
  'Echocardiogram',
  'Nuclear Medicine',
  'Angiography',
  'CT Angiography',
  'MR Angiography',
  'Bone Scan',
  'Doppler Ultrasound',
  'Venous Duplex',
  'Arterial Duplex',
];

// Body parts for imaging
export const imagingBodyParts: string[] = [
  'Chest',
  'Abdomen',
  'Pelvis',
  'Abdomen and Pelvis',
  'Head',
  'Brain',
  'Spine',
  'Cervical Spine',
  'Thoracic Spine',
  'Lumbar Spine',
  'Shoulder',
  'Elbow',
  'Wrist',
  'Hand',
  'Hip',
  'Knee',
  'Ankle',
  'Foot',
  'Neck',
  'Upper Extremity',
  'Lower Extremity',
  'Whole Body',
  'Sinus',
  'Facial Bones',
  'Ribs',
  'Clavicle',
];

// Routes of administration
export const pharmacyRoutes: string[] = [
  'PO',
  'IV',
  'IM',
  'SQ',
  'Topical',
  'Rectal',
  'Sublingual',
  'Inhalation',
  'Ophthalmic',
  'Otic',
  'Nasal',
  'Transdermal',
  'Vaginal',
  'Buccal',
];

// Dosing frequencies
export const pharmacyFrequencies: string[] = [
  'Daily',
  'BID',
  'TID',
  'QID',
  'Q4H',
  'Q6H',
  'Q8H',
  'Q12H',
  'PRN',
  'Once',
  'Weekly',
  'Twice Weekly',
  'Monthly',
  'At bedtime',
  'With meals',
  'Before meals',
  'After meals',
];

// Get all terms as a flat array for general autocomplete
export const getAllMedicalTerms = (): string[] => {
  const allTerms = [
    ...medicalAbbreviations.map(t => t.term),
    ...symptoms,
    ...diagnoses,
    ...medications,
    ...normalFindings,
    ...abnormalFindings,
    ...rosNegatives,
    ...procedureTerms,
    ...planPhrases,
    ...socialHistoryTerms,
    ...familyHistoryTerms,
    ...allergyTerms,
  ];

  // Remove duplicates and sort
  return [...new Set(allTerms)].sort();
};

// Get context-specific suggestions based on the H&P section
export const getTermsForSection = (sectionId: string): string[] => {
  switch (sectionId) {
    case 'chief_complaint':
      return [...symptoms];
    case 'hpi':
      return [...symptoms, ...rosNegatives];
    case 'past_medical_history':
      return [...diagnoses];
    case 'past_surgical_history':
      return ['appendectomy', 'cholecystectomy', 'hysterectomy', 'cesarean section', 'tonsillectomy', 'knee replacement', 'hip replacement', 'coronary artery bypass graft', 'cardiac catheterization', 'hernia repair'];
    case 'home_medications':
      return [...medications, ...medicalAbbreviations.filter(t => t.category === 'frequency' || t.category === 'route').map(t => t.term)];
    case 'allergies':
      return [...allergyTerms];
    case 'social_history':
      return [...socialHistoryTerms];
    case 'family_history':
      return [...familyHistoryTerms];
    case 'review_of_systems':
    case 'ros_constitutional':
    case 'ros_allergic':
    case 'ros_head':
    case 'ros_eyes':
    case 'ros_ent':
    case 'ros_neck':
    case 'ros_breasts':
    case 'ros_respiratory':
    case 'ros_cardiac':
    case 'ros_gi':
    case 'ros_gu':
    case 'ros_musculoskeletal':
    case 'ros_skin':
    case 'ros_neuro':
    case 'ros_psych':
    case 'ros_endo':
    case 'ros_heme':
      return [...rosNegatives];
    case 'physical_exam':
    case 'vital_signs':
      return [...normalFindings, ...abnormalFindings, ...medicalAbbreviations.filter(t => t.category === 'finding' || t.category === 'vitals').map(t => t.term)];
    case 'assessment':
      return [...diagnoses];
    case 'plan':
      return [...planPhrases, ...medications];
    // Order-specific sections
    case 'lab_tests':
      return [...labTests];
    case 'imaging_types':
      return [...imagingTypes];
    case 'imaging_body_parts':
      return [...imagingBodyParts];
    case 'pharmacy_medications':
      return [...medications];
    case 'pharmacy_routes':
      return [...pharmacyRoutes];
    case 'pharmacy_frequencies':
      return [...pharmacyFrequencies];
    default:
      return getAllMedicalTerms();
  }
};

// Search medical terms with fuzzy matching
export const searchMedicalTerms = (query: string, sectionId?: string, limit: number = 10): string[] => {
  if (!query || query.length < 2) return [];

  const terms = sectionId ? getTermsForSection(sectionId) : getAllMedicalTerms();
  const lowerQuery = query.toLowerCase();

  // Score each term based on match quality
  const scored = terms.map(term => {
    const lowerTerm = term.toLowerCase();
    let score = 0;

    // Exact match at start
    if (lowerTerm.startsWith(lowerQuery)) {
      score = 100;
    }
    // Word starts with query
    else if (lowerTerm.split(' ').some(word => word.startsWith(lowerQuery))) {
      score = 75;
    }
    // Contains query
    else if (lowerTerm.includes(lowerQuery)) {
      score = 50;
    }

    return { term, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.term);
};

export default {
  medicalAbbreviations,
  symptoms,
  diagnoses,
  medications,
  normalFindings,
  abnormalFindings,
  rosNegatives,
  procedureTerms,
  planPhrases,
  socialHistoryTerms,
  familyHistoryTerms,
  allergyTerms,
  labTests,
  imagingTypes,
  imagingBodyParts,
  pharmacyRoutes,
  pharmacyFrequencies,
  getAllMedicalTerms,
  getTermsForSection,
  searchMedicalTerms,
};
