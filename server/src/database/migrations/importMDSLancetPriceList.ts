import pool from '../db';

interface LabTest {
  code: string;
  name: string;
  price: number;
  category: string;
  subcategory?: string;
}

// MDS-LANCET LABORATORIES GHANA LIMITED
// GHANA STANDARD FEE SCHEDULE 2026
// EFFECTIVE DATE: 1 JANUARY 2026
// All prices in GHS (Ghana Cedis)

const labTests: LabTest[] = [
  // ==========================================
  // CHEMICAL PATHOLOGY - FERTILITY AND HORMONES
  // ==========================================
  { code: 'TFT', name: 'Thyroid Function Test - TSH, T3, T4', price: 310, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'ETSH', name: 'TSH', price: 150, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'EFT3', name: 'Free T3', price: 150, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'EFT4', name: 'Free T4', price: 150, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'J261', name: 'Urine Pregnancy Test (Total βhCG - Urine)', price: 80, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'E988', name: 'Total βhCG (Blood Quantitative)', price: 230, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'E2', name: 'Estradiol', price: 160, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'EFSH', name: 'FSH', price: 155, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'ELH', name: 'LH', price: 155, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'EPROG', name: 'Progesterone', price: 160, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'EPROL', name: 'Prolactin', price: 155, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'P415', name: 'Anti-Mullerian Hormone', price: 600, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'T655', name: 'Sex Hormone Binding Globulin', price: 350, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'B231', name: 'Free Testosterone', price: 500, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'D210', name: 'Cortisol - Blood', price: 290, category: 'lab', subcategory: 'Fertility and Hormones' },
  { code: 'ETESTO-GH', name: 'Testosterone (Total Only)', price: 220, category: 'lab', subcategory: 'Fertility and Hormones' },

  // SEPSIS
  { code: 'E475', name: 'Procalcitonin Quantitative', price: 650, category: 'lab', subcategory: 'Sepsis' },

  // ==========================================
  // TUMOUR / CANCER MARKERS
  // ==========================================
  { code: 'EAFP', name: 'AFP (Alpha-Fetoprotein)', price: 230, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'EPSA', name: 'Total PSA', price: 200, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'K838', name: 'Free PSA Ratio', price: 400, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'C153', name: 'Breast Cancer Antigen (CA 15.3)', price: 320, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'CEA', name: 'CEA (Carcinoembryonic Antigen)', price: 280, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'C125', name: 'Ovarian Cancer (CA 125)', price: 320, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'C199', name: 'G.I. Tumour Antigen (CA 19.9)', price: 300, category: 'lab', subcategory: 'Tumour Markers' },
  { code: 'S443', name: 'CA 72-4', price: 400, category: 'lab', subcategory: 'Tumour Markers' },

  // ==========================================
  // PANCREATIC SCREEN
  // ==========================================
  { code: 'AMY', name: 'Amylase', price: 110, category: 'lab', subcategory: 'Pancreatic Screen' },
  { code: 'LIP', name: 'Lipase', price: 190, category: 'lab', subcategory: 'Pancreatic Screen' },
  { code: 'S222', name: 'Insulin Fasting', price: 350, category: 'lab', subcategory: 'Pancreatic Screen' },
  { code: 'S223', name: 'Insulin Random', price: 350, category: 'lab', subcategory: 'Pancreatic Screen' },
  { code: 'ECPEP-F', name: 'C-Peptide (Fasting)', price: 350, category: 'lab', subcategory: 'Pancreatic Screen' },
  { code: 'ECPEP-R', name: 'C-Peptide (Random)', price: 350, category: 'lab', subcategory: 'Pancreatic Screen' },

  // ==========================================
  // LIVER FUNCTION TEST
  // ==========================================
  { code: 'T154', name: 'Liver Function Test (Full Panel)', price: 220, category: 'lab', subcategory: 'Liver Function' },
  { code: 'F287', name: 'Total Bilirubin', price: 40, category: 'lab', subcategory: 'Liver Function' },
  { code: 'H673', name: 'Direct Bilirubin', price: 40, category: 'lab', subcategory: 'Liver Function' },
  { code: 'TP', name: 'Total Protein', price: 40, category: 'lab', subcategory: 'Liver Function' },
  { code: 'ALB', name: 'Albumin', price: 70, category: 'lab', subcategory: 'Liver Function' },
  { code: 'AST', name: 'AST (SGOT)', price: 50, category: 'lab', subcategory: 'Liver Function' },
  { code: 'ALT', name: 'ALT (SGPT)', price: 50, category: 'lab', subcategory: 'Liver Function' },
  { code: 'ALP', name: 'Alkaline Phosphatase', price: 50, category: 'lab', subcategory: 'Liver Function' },
  { code: 'GGT', name: 'Gamma GT', price: 50, category: 'lab', subcategory: 'Liver Function' },

  // ==========================================
  // RENAL / BONE
  // ==========================================
  { code: 'UE', name: 'BUE & Creatinine - Urea, Creatinine, Electrolytes', price: 180, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'SOD', name: 'Sodium (Na+)', price: 40, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'POT', name: 'Potassium', price: 40, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'CL', name: 'Chloride', price: 40, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BCR', name: 'Creatinine', price: 50, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'CO2', name: 'Bicarbonate', price: 40, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'L874', name: 'Urea', price: 55, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUA', name: 'Uric Acid', price: 55, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'K958', name: 'Urine Microalbumin/Creatinine Ratio', price: 180, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUELEC', name: 'Electrolytes, Random Urine', price: 160, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUCL', name: 'Chloride Random Urine', price: 55, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUPOT', name: 'Potassium Random Urine', price: 55, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUSOD', name: 'Sodium Random Urine', price: 55, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'CA', name: 'Calcium (Corrected)', price: 100, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'B497', name: 'Ionized Calcium (Ca2+)', price: 110, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'MAG', name: 'Magnesium', price: 95, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'PHOS', name: 'Phosphate', price: 95, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'ALK', name: 'Alkaline Phosphatase', price: 50, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'U247', name: '24 Hour Urine Protein', price: 150, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'W842', name: 'Creatinine Clearance', price: 160, category: 'lab', subcategory: 'Renal/Bone' },
  { code: 'BUCR', name: 'Creatinine, Urine', price: 75, category: 'lab', subcategory: 'Renal/Bone' },

  // ==========================================
  // LIPID PROFILE
  // ==========================================
  { code: 'LIPO', name: 'Lipid Profile (Total Chol, Trig, LDL, HDL)', price: 180, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'COL', name: 'Total Cholesterol (Random)', price: 75, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'Z557', name: 'Total Cholesterol (Fasting)', price: 75, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'HDL', name: 'HDL Cholesterol', price: 75, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'LDL', name: 'LDL Cholesterol', price: 75, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'TRIG', name: 'Triglycerides', price: 75, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'A111', name: 'Lipid Non-Fasting Profile', price: 180, category: 'lab', subcategory: 'Lipid Profile' },
  { code: 'B100', name: 'G6PD (Quantitative)', price: 200, category: 'lab', subcategory: 'Lipid Profile' },

  // ==========================================
  // DIABETES / CARBOHYDRATE METABOLISM
  // ==========================================
  { code: 'H145', name: 'Blood Glucose (Random)', price: 60, category: 'lab', subcategory: 'Diabetes' },
  { code: 'G144', name: 'Blood Glucose (Fasting)', price: 60, category: 'lab', subcategory: 'Diabetes' },
  { code: 'D432', name: '2 Hr Post Prandial Glucose', price: 150, category: 'lab', subcategory: 'Diabetes' },
  { code: 'T408', name: '75g 2HR GTT', price: 170, category: 'lab', subcategory: 'Diabetes' },
  { code: 'L148', name: 'HbA1c', price: 180, category: 'lab', subcategory: 'Diabetes' },
  { code: 'U819', name: 'Urine Glucose', price: 60, category: 'lab', subcategory: 'Diabetes' },
  { code: 'K572', name: 'Reducing Substances, Urine', price: 90, category: 'lab', subcategory: 'Diabetes' },

  // ==========================================
  // MYOCARDIAL (CARDIOVASCULAR DISEASES)
  // ==========================================
  { code: 'J399', name: 'Troponin I', price: 300, category: 'lab', subcategory: 'Cardiac' },
  { code: 'B115', name: 'hs-Troponin T', price: 300, category: 'lab', subcategory: 'Cardiac' },
  { code: 'W564', name: 'Troponin T (Cardiac Reader)', price: 300, category: 'lab', subcategory: 'Cardiac' },
  { code: 'M793', name: 'Cardiac Profile (Trop I, CK-MB, CPK, LDH, AST)', price: 750, category: 'lab', subcategory: 'Cardiac' },
  { code: 'CKMB', name: 'CK-MB', price: 220, category: 'lab', subcategory: 'Cardiac' },
  { code: 'CK', name: 'CK-NAC (CPK)', price: 80, category: 'lab', subcategory: 'Cardiac' },
  { code: 'LDH', name: 'LDH', price: 90, category: 'lab', subcategory: 'Cardiac' },
  { code: 'CRP', name: 'CRP (hs-CRP) C-Reactive Protein', price: 130, category: 'lab', subcategory: 'Cardiac' },
  { code: 'R636', name: 'Cystatin C', price: 400, category: 'lab', subcategory: 'Cardiac' },
  { code: 'zEPROBNP', name: 'proBNP (Brain Natriuretic Peptide)', price: 500, category: 'lab', subcategory: 'Cardiac' },

  // CORONARY ARTERY DISEASE
  { code: 'BAPOA1', name: 'Apolipoprotein A1, Serum', price: 250, category: 'lab', subcategory: 'Cardiac' },
  { code: 'BAPOB', name: 'Apolipoprotein B, Serum', price: 250, category: 'lab', subcategory: 'Cardiac' },

  // ==========================================
  // ANAEMIA WORK-UP
  // ==========================================
  { code: 'FE', name: 'Iron', price: 100, category: 'lab', subcategory: 'Anaemia' },
  { code: 'FER', name: 'Ferritin', price: 200, category: 'lab', subcategory: 'Anaemia' },
  { code: 'B173', name: 'Transferrin', price: 200, category: 'lab', subcategory: 'Anaemia' },
  { code: 'E143', name: 'Iron + Transferrin (incl %SAT)', price: 300, category: 'lab', subcategory: 'Anaemia' },
  { code: 'FOL', name: 'Folate-S (Folic Acid-Serum)', price: 200, category: 'lab', subcategory: 'Anaemia' },
  { code: 'B12', name: 'Vitamin B12', price: 260, category: 'lab', subcategory: 'Anaemia' },
  { code: 'L217', name: 'Gastrin Serum', price: 400, category: 'lab', subcategory: 'Anaemia' },

  // ==========================================
  // CSF/PLEURAL/ASCITIC/SYNOVIAL FLUID
  // ==========================================
  { code: 'CSF', name: 'CSF Full Examination (Protein, Chloride, Glucose, Cell Count)', price: 150, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'CSFC', name: 'CSF Biochemistry (Protein, Glucose, Chloride)', price: 150, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'F548', name: 'Total Protein Fluid', price: 140, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'Y960', name: 'Fluid Glucose', price: 140, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'L156', name: 'Fluid LDH', price: 140, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'BFLAMY', name: 'Fluid Amylase', price: 140, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'BFLAL', name: 'Fluid Albumin', price: 140, category: 'lab', subcategory: 'Body Fluids' },
  { code: 'BFLCH', name: 'Fluid Cholesterol', price: 140, category: 'lab', subcategory: 'Body Fluids' },

  // ==========================================
  // MULTIPLE MYELOMA
  // ==========================================
  { code: 'BQPE', name: 'Protein Electrophoresis', price: 500, category: 'lab', subcategory: 'Multiple Myeloma' },
  { code: 'P452', name: 'Free Light Chains', price: 700, category: 'lab', subcategory: 'Multiple Myeloma' },
  { code: 'W529', name: 'Complement C3 Serum', price: 300, category: 'lab', subcategory: 'Multiple Myeloma' },
  { code: 'K462', name: 'Complement C4 Serum', price: 300, category: 'lab', subcategory: 'Multiple Myeloma' },
  { code: 'Z137', name: 'C3, C4 (Complement)', price: 600, category: 'lab', subcategory: 'Multiple Myeloma' },

  // ==========================================
  // INFECTIOUS DISEASES
  // ==========================================
  { code: 'TOXG', name: 'Toxoplasma IgG', price: 360, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'TOXM', name: 'Toxoplasma IgM', price: 500, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'R443', name: 'Rubella IgG', price: 360, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'F521', name: 'Rubella IgM', price: 500, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'ICMVM', name: 'Cytomegalovirus IgM', price: 400, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'ICMVG', name: 'Cytomegalovirus IgG', price: 400, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'X296', name: 'Cytomegalovirus IgM and IgG (CMV IgM & IgG)', price: 800, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HAV', name: 'Hepatitis A - IgM', price: 400, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'H906', name: 'Hepatitis B s Antigen (Rapid & ELISA)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'IHBSAG-QUANT', name: 'Hepatitis B Surface Antigen Quantitation', price: 500, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HEPB', name: 'Hepatitis B Profile', price: 1250, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'G212', name: 'Hepatitis B Surface Antigen (Hep B s Ag)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HBAB', name: 'Hepatitis B s Antibody (Hep B s Ab)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'H022', name: 'Hepatitis B e Antigen (Hep B e Ag)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'H033', name: 'Hepatitis B e Antibody (Hep B e Ab)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'W824', name: 'Hepatitis B c IgM Antibody (Hep B c IgM)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'H012', name: 'Hepatitis B c IgG Antibody (Hep B c IgG)', price: 220, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HCV', name: 'Hepatitis C Antibody (Rapid + ELISA)', price: 230, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'H455', name: 'HIV 1 & 2 (Rapid + ELISA)', price: 300, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'Y343', name: 'Syphilis Profile - VDRL + T.Pallidum (IgG + IgM)', price: 1000, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HERPIG1', name: 'Herpes 1 IgG', price: 350, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'HERPIG2', name: 'Herpes 2 IgG', price: 350, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'IHERPM', name: 'Herpes 1 & 2 IgM', price: 350, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'Y297', name: 'Epstein Barr Virus IgG + IgM (EB Virus)', price: 800, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'EBNA', name: 'Epstein Barr Virus IgG', price: 400, category: 'lab', subcategory: 'Infectious Diseases' },
  { code: 'E968', name: 'Epstein Barr Virus IgM', price: 400, category: 'lab', subcategory: 'Infectious Diseases' },

  // ==========================================
  // HORMONES AND ENZYMES
  // ==========================================
  { code: 'R994', name: 'Vitamin D3 (D25 OH)', price: 800, category: 'lab', subcategory: 'Hormones' },
  { code: 'X227', name: 'Parathyroid Hormone (PTH)', price: 500, category: 'lab', subcategory: 'Hormones' },
  { code: 'E211', name: 'DHEAS', price: 350, category: 'lab', subcategory: 'Hormones' },
  { code: 'EGHF', name: 'Growth Hormone Fasting', price: 350, category: 'lab', subcategory: 'Hormones' },
  { code: 'GH-M219', name: 'Growth Hormone Random', price: 350, category: 'lab', subcategory: 'Hormones' },
  { code: 'X677', name: 'Erythropoietin', price: 350, category: 'lab', subcategory: 'Hormones' },
  { code: 'A307', name: 'Adrenocorticotropic Hormone (ACTH)', price: 400, category: 'lab', subcategory: 'Hormones' },
  { code: 'C155', name: 'Aldosterone', price: 400, category: 'lab', subcategory: 'Hormones' },
  { code: 'W944', name: 'Aldosterone/Renin Ratio', price: 400, category: 'lab', subcategory: 'Hormones' },
  { code: 'W226', name: '17-OH Progesterone', price: 400, category: 'lab', subcategory: 'Hormones' },
  { code: 'E250', name: 'Somatomedine', price: 350, category: 'lab', subcategory: 'Hormones' },

  // ==========================================
  // OCCUPATIONAL HEALTH
  // ==========================================
  { code: 'POCDRUGHOM', name: 'Drug of Abuse (Seven Drugs Panel)', price: 700, category: 'lab', subcategory: 'Occupational Health' },
  { code: 'BCES', name: 'Cholinesterase, Serum', price: 500, category: 'lab', subcategory: 'Occupational Health' },
  { code: 'BALC', name: 'Ethanol (Serum)', price: 600, category: 'lab', subcategory: 'Occupational Health' },
  { code: 'BLI', name: 'Lithium, Serum', price: 400, category: 'lab', subcategory: 'Occupational Health' },

  // ==========================================
  // AUTO IMMUNE / CONNECTIVE TISSUE DISEASE
  // ==========================================
  { code: 'RF', name: 'Rheumatoid Factor, Quantitative', price: 130, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'RFMAN', name: 'Rheumatoid Factor Qualitative', price: 130, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'IENA', name: 'Connective Tissue Disease Screen (CTD Screen)', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'DNA', name: 'Anti-ds DNA (SLE) ELISA', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'D348', name: 'Antinuclear Smooth Muscle (Anti-SM) Antibody', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'ICCP', name: 'Anti Cyclic Citrullinated (Anti CCP)', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'A967', name: 'Anti-Nuclear Antibody (ANA Screen IgG)', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'SA', name: 'SSA - ENA', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'LA', name: 'SSB - ENA', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'IJO1', name: 'Extr. Nuclear AG. JO-1', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'C680', name: 'Antinuclear Ribonuclearprotein (Anti-RNP)', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'F558', name: 'Anti GAD Antibody', price: 400, category: 'lab', subcategory: 'Autoimmune' },
  { code: 'ICENTRO', name: 'Anti Centromere Test', price: 400, category: 'lab', subcategory: 'Autoimmune' },

  // ==========================================
  // THERAPEUTIC DRUG MONITORING
  // ==========================================
  { code: 'BTACRO', name: 'Tacrolimus, Blood', price: 700, category: 'lab', subcategory: 'Drug Monitoring' },
  { code: 'Y542', name: 'Cyclosporin', price: 700, category: 'lab', subcategory: 'Drug Monitoring' },

  // ==========================================
  // THYROID MARKERS
  // ==========================================
  { code: 'E412', name: 'Thyroglobulin Antibody', price: 400, category: 'lab', subcategory: 'Thyroid' },
  { code: 'C471', name: 'Thyroid Auto Antibodies', price: 400, category: 'lab', subcategory: 'Thyroid' },
  { code: 'H932', name: 'TSH Releasing/Receptors Antibody', price: 400, category: 'lab', subcategory: 'Thyroid' },
  { code: 'N288', name: 'B2 Microglobulin - Serum', price: 400, category: 'lab', subcategory: 'Thyroid' },

  // ==========================================
  // ALLERGY AND HUMORAL IMMUNITY
  // ==========================================
  { code: 'C256', name: 'Immunoglobin IgE', price: 300, category: 'lab', subcategory: 'Allergy' },
  { code: 'W742', name: 'Anti GAD/IA2 Antibodies', price: 400, category: 'lab', subcategory: 'Allergy' },

  // ==========================================
  // HAEMATOLOGY
  // ==========================================
  { code: 'HFBC', name: 'Full Blood Count', price: 110, category: 'lab', subcategory: 'Haematology' },
  { code: 'FBC+COMMENT', name: 'Full Blood Count with Blood Film Comment', price: 200, category: 'lab', subcategory: 'Haematology' },
  { code: 'M356', name: 'Full Blood Count + Reticulocytes', price: 180, category: 'lab', subcategory: 'Haematology' },
  { code: 'HESRCAPVIS', name: 'ESR - Erythrocyte Sedimentation Rate', price: 125, category: 'lab', subcategory: 'Haematology' },
  { code: 'J854+T943', name: 'Sickling Test + Hb Electrophoresis', price: 260, category: 'lab', subcategory: 'Haematology' },
  { code: 'T943', name: 'Hb Electrophoresis', price: 130, category: 'lab', subcategory: 'Haematology' },
  { code: 'HGRP', name: 'Blood Group + Rhesus D Antigen', price: 100, category: 'lab', subcategory: 'Haematology' },
  { code: 'X365', name: 'Direct Anti-Humanglobulin', price: 125, category: 'lab', subcategory: 'Haematology' },
  { code: 'Y366', name: 'Indirect Anti-Humanglobulin', price: 125, category: 'lab', subcategory: 'Haematology' },
  { code: 'P358', name: 'Malaria Thick and Thin', price: 100, category: 'lab', subcategory: 'Haematology' },
  { code: 'F723', name: 'Malaria Profile + ICT', price: 200, category: 'lab', subcategory: 'Haematology' },
  { code: 'G562', name: 'Malaria ICT (Antigen)', price: 130, category: 'lab', subcategory: 'Haematology' },
  { code: 'MAL-AUT', name: 'Malaria Auto', price: 100, category: 'lab', subcategory: 'Haematology' },
  { code: 'MAL-AUT+ANT', name: 'Malaria Auto + Antigen', price: 200, category: 'lab', subcategory: 'Haematology' },

  // ==========================================
  // COAGULATION
  // ==========================================
  { code: 'HCPI', name: 'Prothrombin Time (PT) - INR', price: 140, category: 'lab', subcategory: 'Coagulation' },
  { code: 'HCPTT', name: 'Thromboplastin Time (aPTT)', price: 150, category: 'lab', subcategory: 'Coagulation' },
  { code: 'HCCOAG', name: 'Clotting Profile (PT/INR, aPTT)', price: 240, category: 'lab', subcategory: 'Coagulation' },
  { code: 'HCDDT', name: 'D-Dimer Quantitative/Semi Quants', price: 450, category: 'lab', subcategory: 'Coagulation' },
  { code: 'HCBT', name: 'Bleeding Time', price: 115, category: 'lab', subcategory: 'Coagulation' },
  { code: 'HCCLOT', name: 'Clotting Time', price: 100, category: 'lab', subcategory: 'Coagulation' },
  { code: 'P381', name: 'Protein C', price: 440, category: 'lab', subcategory: 'Coagulation' },
  { code: 'P400', name: 'Protein S', price: 440, category: 'lab', subcategory: 'Coagulation' },
  { code: 'C393', name: 'Fibrinogen', price: 440, category: 'lab', subcategory: 'Coagulation' },

  // ==========================================
  // MICROBIOLOGY
  // ==========================================
  { code: 'IHELICOAG', name: 'Helicobacter Pylori AG EIA - Stool', price: 250, category: 'lab', subcategory: 'Microbiology' },
  { code: 'B310', name: 'H. Pylori (IgG) ELISA', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'G546', name: 'Typhoid IgG + IgM', price: 170, category: 'lab', subcategory: 'Microbiology' },
  { code: 'TYPHOID-IGM', name: 'Typhoid IgM', price: 85, category: 'lab', subcategory: 'Microbiology' },
  { code: 'TYPHOID-IGG', name: 'Typhoid IgG', price: 85, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Z344', name: 'Widal (S.Typhi O & H)', price: 90, category: 'lab', subcategory: 'Microbiology' },
  { code: 'R204', name: 'Urine R/E', price: 90, category: 'lab', subcategory: 'Microbiology' },
  { code: 'U345', name: 'Urine C/S (Culture & Sensitivity)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'W520', name: 'Environmental/Water Analysis', price: 240, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M942', name: 'Blood C/S - Paediatric', price: 250, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Z624', name: 'Blood C/S - Adult (Left Arm)', price: 250, category: 'lab', subcategory: 'Microbiology' },
  { code: 'F428', name: 'Blood C/S - Adult', price: 250, category: 'lab', subcategory: 'Microbiology' },
  { code: 'F991', name: 'Stool R/E', price: 90, category: 'lab', subcategory: 'Microbiology' },
  { code: 'R544', name: 'Stool C/S (Culture & Sensitivity) Adult', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Y322', name: 'Stool R/E, C/S, Rotavirus, Adenovirus - Child < 5 Yrs', price: 280, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M835', name: 'Stool Rotavirus and Adenovirus (Child < 5 Years)', price: 280, category: 'lab', subcategory: 'Microbiology' },
  { code: 'J133', name: 'Occult Blood - Stool', price: 140, category: 'lab', subcategory: 'Microbiology' },
  { code: 'T665', name: 'Sputum for AFB (Acid Fast Bacilli Microscopy)', price: 90, category: 'lab', subcategory: 'Microbiology' },
  { code: 'L887', name: 'Sputum C/S (Culture & Sensitivity)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M-VM', name: 'Urethral Swab MCS (Culture & Sensitivity)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M-VFMIC', name: 'Vaginal Swab R/E (Vaginal Microscopy)', price: 90, category: 'lab', subcategory: 'Microbiology' },
  { code: 'MV', name: 'Endocervical Swab C/S - Female Adult (HVS C/S)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'G839', name: 'Endocervical Swab C/S - Female Child', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'R916', name: 'Cervical Swab MCS', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'C814', name: 'CSF Bacteriology', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'MENT', name: 'Ear Swab C/S', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'F908', name: 'Skin Scrapings (Fungal Microscopy)', price: 170, category: 'lab', subcategory: 'Microbiology' },
  { code: 'P999', name: 'Wound Swab C/S (Antral Wash C/S)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M597', name: 'Semen Analysis', price: 220, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Y572', name: 'Semen C/S (Culture & Sensitivity)', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'W034', name: 'Corneal Scraping C/S', price: 230, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M-FL', name: 'Fluid - MCS', price: 600, category: 'lab', subcategory: 'Microbiology' },
  { code: 'V294', name: 'Cryptococcal Screen - Serum', price: 500, category: 'lab', subcategory: 'Microbiology' },
  { code: 'D412', name: 'Cryptococcal Antigen - CSF', price: 500, category: 'lab', subcategory: 'Microbiology' },
  { code: 'M-CATH', name: 'Catheter MCS - Arterial/CVP/UMB', price: 460, category: 'lab', subcategory: 'Microbiology' },
  { code: 'K382', name: 'Rectal Swab MCS', price: 780, category: 'lab', subcategory: 'Microbiology' },
  { code: 'ASOT-SCRN-GHANA', name: 'Anti-Streptolysin O', price: 155, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Z748', name: 'VDRL (Rapid + Confirmation)', price: 155, category: 'lab', subcategory: 'Microbiology' },
  { code: 'T240', name: 'RPR + TPHA Screen Only', price: 155, category: 'lab', subcategory: 'Microbiology' },
  { code: 'Z345', name: 'T.Pallidum (Screen) TPHA Latex', price: 155, category: 'lab', subcategory: 'Microbiology' },

  // ==========================================
  // MOLECULAR BIOLOGY
  // ==========================================
  { code: 'C290', name: 'PCR, SARS-CoV-2', price: 510, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'K561', name: 'Hepatitis B Viral Load', price: 680, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'F401', name: 'HIV-1 Viral Load', price: 750, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'K841', name: 'HPV - PCR', price: 600, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'P140', name: 'Hepatitis C Viral Load', price: 850, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'DGC', name: 'PCR - Gonococcal DNA', price: 950, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'F235', name: 'PCR - Chlamydia trachomatis', price: 950, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'PCR-ID-GENE-EXP', name: 'Mycobacterial PCR ID + Sensitivity', price: 1100, category: 'lab', subcategory: 'Molecular Biology' },
  { code: 'P489', name: 'Human Papilloma Virus (HPV) Swab', price: 845, category: 'lab', subcategory: 'Molecular Biology' },

  // ==========================================
  // HISTOLOGY AND CYTOLOGY
  // ==========================================
  { code: 'PAP1', name: 'Pap Smear (1 Slide)', price: 160, category: 'lab', subcategory: 'Cytology' },
  { code: 'PAP2', name: 'Pap Smear (2 Slides)', price: 160, category: 'lab', subcategory: 'Cytology' },
  { code: 'PAP3', name: 'Pap Smear (3 Slides)', price: 220, category: 'lab', subcategory: 'Cytology' },
  { code: 'PAP4', name: 'Pap Smear (4 Slides)', price: 275, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTLBC', name: 'Liquid Base Cytology', price: 350, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-ASCITIC', name: 'Ascetic Fluid Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-PLEURAL', name: 'Pleural Fluid Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-BREAST', name: 'Breast Fluid Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-SPINE', name: 'Spine Fluid Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-URINE', name: 'Urine Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFLD-SPUTUM', name: 'Sputum Cytology', price: 320, category: 'lab', subcategory: 'Cytology' },
  { code: 'CYTFNA', name: 'FNA of Liver, Breast, Thyroid etc.', price: 320, category: 'lab', subcategory: 'Cytology' },

  // BREAST HISTOLOGY
  { code: 'HISTTRUE-BL', name: 'Breast Tru Cut Biopsy (L)', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTRUE-RB', name: 'Breast Tru Cut Biopsy (R)', price: 850, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTRUE-BLR', name: 'Breast Tru Cut Biopsy (L&R)', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTRUE-BREAST', name: 'Tru Cut Biopsy of Breast', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTBREXC', name: 'Excision Breast Biopsy', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTBREAST', name: 'Breast Lump Biopsy', price: 1100, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTMAST', name: 'Whole Breast Mastectomy', price: 650, category: 'lab', subcategory: 'Histology' },

  // PROSTATE HISTOLOGY
  { code: 'HISTPROS', name: 'Prostatic Biopsy', price: 1100, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTRUE-PROSTATE', name: 'Tru Cut Biopsy of Prostate', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTRUE-PROSTATE-LR', name: 'Tru Cut Biopsy of Prostate (L & R)', price: 1100, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTPRCURR', name: 'Prostate Chips', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTENDO', name: 'Endo Urethral Resection', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTPRGLAND', name: 'Whole Prostate', price: 600, category: 'lab', subcategory: 'Histology' },

  // KIDNEY HISTOLOGY
  { code: 'HISTKIDEX', name: 'Excision Biopsy of Kidney', price: 1100, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTRUE-KIDNEY', name: 'Tru Cut Biopsy of Kidney', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTKIDNEY', name: 'Whole Kidney', price: 600, category: 'lab', subcategory: 'Histology' },

  // LIVER HISTOLOGY
  { code: 'HISTLIVEX', name: 'Excision Biopsy of the Liver', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTLIVER-BX', name: 'Liver Biopsy (Tru Cut)', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTLIVER-BIOP', name: 'Liver Biopsy (Lobectomy)', price: 1100, category: 'lab', subcategory: 'Histology' },

  // UTERUS & CERVIX
  { code: 'HISTCXBX', name: 'Cervical Biopsy', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTEMB', name: 'Endometrial Biopsy', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCXEXC', name: 'Large Loop Excision of Cervix (LLETZ)', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HIST-TAH+BSO', name: 'TAH + BSO', price: 850, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTUT+AA', name: 'Uterus with Adnexae or Appendages', price: 800, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTUT-AA', name: 'Uterus without Adnexae or Appendages', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HIST-MYOM', name: 'Myomectomy', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOVA', name: 'Ovarian Cyst with Tumor & Fallopian Tubes', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOVAR', name: 'Ovarian Cyst with Tumor', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOVARY', name: 'Ovary Cyst without Tumor', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTFALL', name: 'Destroyed & Inflamed Fallopian Tubes', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTFAL-OV-LR', name: 'Fallopian Tubes & Ovary (L&R)', price: 750, category: 'lab', subcategory: 'Histology' },

  // PREGNANCY
  { code: 'HISTPREG-ECT', name: 'Ectopic Pregnancy', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTUBAL', name: 'Tubal Ligation', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTPREG', name: 'Intra Uterine Pregnancy', price: 550, category: 'lab', subcategory: 'Histology' },

  // POLYPS & GIT
  { code: 'HISTUTER', name: 'Uterine Polyps', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTINTPOL', name: 'Intestinal Polyps', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTINT', name: 'Intestinal Biopsies', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCOLON', name: 'Biopsy from the Colon', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCOL', name: 'Whole Viscus of Colon', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTSINT', name: 'Whole Viscus of Small Intestine', price: 850, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTSTOM', name: 'Whole Stomach', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTSTO', name: 'Stomach Biopsy (Gastric Biopsy)', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTHEMICOL', name: 'Hemicolectomy', price: 850, category: 'lab', subcategory: 'Histology' },

  // THYROID HISTOLOGY
  { code: 'HISTTHYBX', name: 'Thyroid Biopsy', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTHY-LB-LR', name: 'Thyroid Lobe Biopsy L&R', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTHYROID', name: 'Whole Thyroid (Thyroidectomy)', price: 750, category: 'lab', subcategory: 'Histology' },

  // TESTES HISTOLOGY
  { code: 'HISTTESBX', name: 'Testicular Single Biopsy (L or R)', price: 600, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTESBX-LR', name: 'Testicular Biopsy (L & R)', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTESVAS', name: 'Testes with Vas', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTVASEC', name: 'Vasectomy', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTVAS', name: 'Vas', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTTEST', name: 'Whole Testes', price: 700, category: 'lab', subcategory: 'Histology' },

  // SPECIAL STAIN
  { code: 'HIST-ER', name: 'ER (Estrogen Receptor)', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HIST-PR', name: 'PR (Progesterone Receptor)', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'HIST-HER2', name: 'HER 2', price: 550, category: 'lab', subcategory: 'Histology' },
  { code: 'B948', name: 'FISH for HER 2', price: 1500, category: 'lab', subcategory: 'Histology' },

  // IMMUNOPEROXIDASE
  { code: 'L159', name: 'One Immunoperoxidase', price: 600, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X2', name: 'Two Immunoperoxidase', price: 800, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X3', name: 'Three Immunoperoxidase', price: 1200, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X4', name: 'Four Immunoperoxidase', price: 1600, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X5', name: 'Five Immunoperoxidase', price: 2000, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X6', name: 'Six Immunoperoxidase', price: 2400, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X10', name: 'Ten Immunoperoxidase', price: 3500, category: 'lab', subcategory: 'Immunoperoxidase' },
  { code: 'L159X15', name: 'Fifteen Immunoperoxidase', price: 6000, category: 'lab', subcategory: 'Immunoperoxidase' },

  // OTHER TISSUES HISTOLOGY
  { code: 'HISTBRAIN', name: 'Brain Biopsy', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTURI', name: 'Biopsy of Urinary Bladder', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTURETHRALBX', name: 'Urethral Biopsy', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTSK', name: 'Biopsy of Skin', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTBT', name: 'Biopsy of Bone Tissue', price: 850, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCART', name: 'Biopsy of Cartilage', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTSKEL', name: 'Biopsy of Skeletal Muscle', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTLUNGBX', name: 'Lung Biopsy', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTLUNGLBBX', name: 'Lung Lobe Biopsy', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTPUNCHBX', name: 'Punch Biopsy', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOESOBX', name: 'Oesophagus Biopsy', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOTH', name: 'Any Other Excision Biopsies', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTOTHBX', name: 'Any Other Biopsies', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTEYE', name: 'Whole Eye', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTMUSC', name: 'Whole Tumor of Muscle', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCARTUM', name: 'Whole Tumor Cartilage', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTGB', name: 'Gall Bladder', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTLYMP', name: 'Lymph Node Excision', price: 650, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTGROIN', name: 'Groin Cyst & Lymph Nodes', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTDER', name: 'Dermoid Cyst', price: 750, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTAPPENDIX', name: 'Appendix', price: 700, category: 'lab', subcategory: 'Histology' },
  { code: 'HISTCOMPLEX-TX', name: 'Complex Tissue Sample', price: 2000, category: 'lab', subcategory: 'Histology' },

  // ==========================================
  // IMAGING SERVICES (Standard Pricing)
  // ==========================================
  { code: 'IMG-XRAY-CHEST', name: 'X-Ray Chest', price: 150, category: 'imaging', subcategory: 'X-Ray' },
  { code: 'IMG-XRAY-ABDOMEN', name: 'X-Ray Abdomen', price: 150, category: 'imaging', subcategory: 'X-Ray' },
  { code: 'IMG-XRAY-SPINE', name: 'X-Ray Spine', price: 200, category: 'imaging', subcategory: 'X-Ray' },
  { code: 'IMG-XRAY-EXTREMITY', name: 'X-Ray Extremity', price: 120, category: 'imaging', subcategory: 'X-Ray' },
  { code: 'IMG-ULTRASOUND-ABD', name: 'Ultrasound Abdomen', price: 250, category: 'imaging', subcategory: 'Ultrasound' },
  { code: 'IMG-ULTRASOUND-PELVIC', name: 'Ultrasound Pelvic', price: 250, category: 'imaging', subcategory: 'Ultrasound' },
  { code: 'IMG-ULTRASOUND-OBS', name: 'Ultrasound Obstetric', price: 300, category: 'imaging', subcategory: 'Ultrasound' },
  { code: 'IMG-ULTRASOUND-THYROID', name: 'Ultrasound Thyroid', price: 200, category: 'imaging', subcategory: 'Ultrasound' },
  { code: 'IMG-ULTRASOUND-BREAST', name: 'Ultrasound Breast', price: 250, category: 'imaging', subcategory: 'Ultrasound' },
  { code: 'IMG-CT-HEAD', name: 'CT Scan Head', price: 800, category: 'imaging', subcategory: 'CT Scan' },
  { code: 'IMG-CT-CHEST', name: 'CT Scan Chest', price: 1000, category: 'imaging', subcategory: 'CT Scan' },
  { code: 'IMG-CT-ABDOMEN', name: 'CT Scan Abdomen', price: 1200, category: 'imaging', subcategory: 'CT Scan' },
  { code: 'IMG-MRI-BRAIN', name: 'MRI Brain', price: 2000, category: 'imaging', subcategory: 'MRI' },
  { code: 'IMG-MRI-SPINE', name: 'MRI Spine', price: 2500, category: 'imaging', subcategory: 'MRI' },
  { code: 'IMG-MAMMOGRAM', name: 'Mammogram', price: 400, category: 'imaging', subcategory: 'Mammography' },
  { code: 'IMG-ECG', name: 'ECG/EKG', price: 100, category: 'imaging', subcategory: 'Cardiology' },
  { code: 'IMG-ECHO', name: 'Echocardiogram', price: 500, category: 'imaging', subcategory: 'Cardiology' },

  // ==========================================
  // CONSULTATION FEES
  // ==========================================
  { code: 'CONS-NEW', name: 'New Patient Consultation', price: 150, category: 'consultation', subcategory: 'General' },
  { code: 'CONS-FOLLOW', name: 'Follow-up Consultation', price: 100, category: 'consultation', subcategory: 'General' },
  { code: 'CONS-SPECIALIST', name: 'Specialist Consultation', price: 300, category: 'consultation', subcategory: 'Specialist' },
  { code: 'CONS-EMERGENCY', name: 'Emergency Consultation', price: 250, category: 'consultation', subcategory: 'Emergency' },
  { code: 'CONS-TELEMEDICINE', name: 'Telemedicine Consultation', price: 120, category: 'consultation', subcategory: 'Telemedicine' },

  // ==========================================
  // NURSING PROCEDURES
  // ==========================================
  { code: 'NUR-INJECTION-IM', name: 'Intramuscular Injection', price: 30, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-INJECTION-IV', name: 'Intravenous Injection', price: 50, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-IV-CANNULATION', name: 'IV Cannulation', price: 80, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-WOUND-DRESS-SM', name: 'Wound Dressing (Small)', price: 50, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-WOUND-DRESS-LG', name: 'Wound Dressing (Large)', price: 100, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-CATHETER', name: 'Urinary Catheterization', price: 150, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-NGT-INSERT', name: 'NG Tube Insertion', price: 100, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-NEBULIZATION', name: 'Nebulization', price: 50, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-BP-CHECK', name: 'Blood Pressure Check', price: 20, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-GLUCOSE-CHECK', name: 'Blood Glucose Check (POCT)', price: 30, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-ECG', name: 'ECG Recording', price: 80, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-OXYGEN', name: 'Oxygen Therapy (per hour)', price: 50, category: 'procedure', subcategory: 'Nursing' },
  { code: 'NUR-SUTURE-REMOVAL', name: 'Suture Removal', price: 50, category: 'procedure', subcategory: 'Nursing' },
];

async function importPriceList(): Promise<void> {
  const client = await pool.connect();

  try {
    console.log('Starting MDS-LANCET Price List Import...');
    console.log(`Total tests to import: ${labTests.length}`);

    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const test of labTests) {
      // Check if test already exists by code
      const existing = await client.query(
        'SELECT id FROM charge_master WHERE service_code = $1',
        [test.code]
      );

      const description = test.subcategory
        ? `${test.subcategory}: ${test.name}`
        : test.name;

      if (existing.rows.length > 0) {
        // Update existing record
        await client.query(
          `UPDATE charge_master
           SET service_name = $1, price = $2, category = $3, description = $4, updated_at = CURRENT_TIMESTAMP
           WHERE service_code = $5`,
          [test.name, test.price, test.category, description, test.code]
        );
        updated++;
      } else {
        // Insert new record
        await client.query(
          `INSERT INTO charge_master (service_name, service_code, category, price, description, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [test.name, test.code, test.category, test.price, description]
        );
        inserted++;
      }
    }

    await client.query('COMMIT');

    console.log('\n=== Import Complete ===');
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total processed: ${labTests.length}`);

    // Show summary by category
    const summary = await client.query(`
      SELECT category, COUNT(*) as count,
             MIN(price) as min_price, MAX(price) as max_price,
             ROUND(AVG(price)::numeric, 2) as avg_price
      FROM charge_master
      WHERE is_active = true
      GROUP BY category
      ORDER BY count DESC
    `);

    console.log('\n=== Category Summary ===');
    console.table(summary.rows);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importPriceList()
  .then(() => {
    console.log('\nMDS-LANCET Price List import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
