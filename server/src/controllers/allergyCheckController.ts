import { Request, Response } from 'express';
import pool from '../database/db';
import { aiService } from '../services/aiService';

// Known drug class cross-reactivity map for fast local matching
const DRUG_CLASS_MAP: Record<string, string[]> = {
  // Penicillins
  penicillin: ['amoxicillin', 'ampicillin', 'augmentin', 'amoxiclav', 'piperacillin', 'flucloxacillin', 'cloxacillin', 'dicloxacillin', 'nafcillin', 'oxacillin', 'ticarcillin'],
  amoxicillin: ['penicillin', 'ampicillin', 'augmentin', 'amoxiclav', 'piperacillin', 'flucloxacillin', 'cloxacillin'],
  ampicillin: ['penicillin', 'amoxicillin', 'augmentin', 'amoxiclav', 'piperacillin', 'flucloxacillin'],
  augmentin: ['penicillin', 'amoxicillin', 'ampicillin', 'amoxiclav'],
  // Cephalosporins (partial cross-reactivity with penicillins ~1-2%)
  cephalexin: ['cefuroxime', 'ceftriaxone', 'cefixime', 'cefaclor', 'cephalosporin'],
  ceftriaxone: ['cephalexin', 'cefuroxime', 'cefixime', 'cefaclor', 'cephalosporin'],
  cefuroxime: ['cephalexin', 'ceftriaxone', 'cefixime', 'cefaclor', 'cephalosporin'],
  // Sulfonamides
  sulfa: ['sulfamethoxazole', 'trimethoprim', 'bactrim', 'septrin', 'cotrimoxazole', 'sulfonamide'],
  sulfamethoxazole: ['sulfa', 'bactrim', 'septrin', 'cotrimoxazole', 'sulfonamide', 'trimethoprim'],
  bactrim: ['sulfa', 'sulfamethoxazole', 'septrin', 'cotrimoxazole', 'sulfonamide'],
  septrin: ['sulfa', 'sulfamethoxazole', 'bactrim', 'cotrimoxazole', 'sulfonamide'],
  // NSAIDs
  aspirin: ['ibuprofen', 'naproxen', 'diclofenac', 'piroxicam', 'indomethacin', 'ketorolac', 'meloxicam', 'celecoxib', 'nsaid'],
  ibuprofen: ['aspirin', 'naproxen', 'diclofenac', 'piroxicam', 'indomethacin', 'ketorolac', 'meloxicam', 'nsaid'],
  naproxen: ['aspirin', 'ibuprofen', 'diclofenac', 'piroxicam', 'indomethacin', 'nsaid'],
  diclofenac: ['aspirin', 'ibuprofen', 'naproxen', 'piroxicam', 'indomethacin', 'nsaid'],
  // Macrolides
  erythromycin: ['azithromycin', 'clarithromycin', 'macrolide'],
  azithromycin: ['erythromycin', 'clarithromycin', 'macrolide'],
  clarithromycin: ['erythromycin', 'azithromycin', 'macrolide'],
  // Fluoroquinolones
  ciprofloxacin: ['levofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin', 'fluoroquinolone', 'quinolone'],
  levofloxacin: ['ciprofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin', 'fluoroquinolone', 'quinolone'],
  // Opioids
  morphine: ['codeine', 'hydrocodone', 'oxycodone', 'tramadol', 'fentanyl', 'opioid'],
  codeine: ['morphine', 'hydrocodone', 'oxycodone', 'tramadol', 'opioid'],
  tramadol: ['morphine', 'codeine', 'hydrocodone', 'oxycodone', 'opioid'],
  // ACE Inhibitors
  lisinopril: ['enalapril', 'ramipril', 'captopril', 'perindopril', 'ace inhibitor'],
  enalapril: ['lisinopril', 'ramipril', 'captopril', 'perindopril', 'ace inhibitor'],
  ramipril: ['lisinopril', 'enalapril', 'captopril', 'perindopril', 'ace inhibitor'],
  // Statins
  atorvastatin: ['simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin', 'statin'],
  simvastatin: ['atorvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin', 'statin'],
  // Tetracyclines
  doxycycline: ['tetracycline', 'minocycline', 'tigecycline'],
  tetracycline: ['doxycycline', 'minocycline', 'tigecycline'],
  // Benzodiazepines
  diazepam: ['lorazepam', 'alprazolam', 'clonazepam', 'midazolam', 'benzodiazepine'],
  lorazepam: ['diazepam', 'alprazolam', 'clonazepam', 'midazolam', 'benzodiazepine'],
  // Local anesthetics (amide group)
  lidocaine: ['bupivacaine', 'mepivacaine', 'ropivacaine'],
  bupivacaine: ['lidocaine', 'mepivacaine', 'ropivacaine'],
};

interface AllergyWarning {
  allergen: string;
  reaction: string;
  severity: string;
  match_type: 'exact' | 'cross_reactivity' | 'ai_detected';
  explanation: string;
}

/**
 * Check a medication against a patient's known allergies.
 * Returns warnings for exact matches and cross-reactivity.
 */
export const checkAllergyInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id, medication_name } = req.body;

    if (!patient_id || !medication_name) {
      res.status(400).json({ error: 'patient_id and medication_name are required' });
      return;
    }

    // Fetch patient allergies
    const allergiesResult = await pool.query(
      `SELECT id, allergen, reaction, severity FROM allergies WHERE patient_id = $1`,
      [patient_id]
    );

    // Also check the legacy text field
    const patientResult = await pool.query(
      `SELECT allergies FROM patients WHERE id = $1`,
      [patient_id]
    );

    const structuredAllergies = allergiesResult.rows;
    const legacyAllergies = patientResult.rows[0]?.allergies || '';

    // Parse legacy allergies text into array
    const legacyList: Array<{ allergen: string; reaction: string; severity: string }> = [];
    if (legacyAllergies && legacyAllergies.trim()) {
      legacyAllergies.split(/[,;]/).forEach((a: string) => {
        const trimmed = a.trim();
        if (trimmed) {
          legacyList.push({ allergen: trimmed, reaction: 'Unknown', severity: 'moderate' });
        }
      });
    }

    const allAllergies = [
      ...structuredAllergies,
      ...legacyList.filter(l => !structuredAllergies.some(
        (s: { allergen: string }) => s.allergen.toLowerCase() === l.allergen.toLowerCase()
      )),
    ];

    if (allAllergies.length === 0) {
      res.json({ warnings: [], safe: true });
      return;
    }

    const medLower = medication_name.toLowerCase().trim();
    const warnings: AllergyWarning[] = [];

    for (const allergy of allAllergies) {
      const allergenLower = allergy.allergen.toLowerCase().trim();

      // 1. Exact match (substring in either direction)
      if (medLower.includes(allergenLower) || allergenLower.includes(medLower)) {
        warnings.push({
          allergen: allergy.allergen,
          reaction: allergy.reaction || 'Unknown reaction',
          severity: allergy.severity || 'moderate',
          match_type: 'exact',
          explanation: `${medication_name} matches the patient's known allergy to ${allergy.allergen}.`,
        });
        continue;
      }

      // 2. Drug class cross-reactivity (local lookup)
      const classMembers = DRUG_CLASS_MAP[allergenLower] || [];
      const medWords = medLower.split(/[\s\/\-\(\)]+/);
      const crossMatch = classMembers.some(member =>
        medLower.includes(member) || medWords.some((w: string) => w === member)
      );

      if (crossMatch) {
        warnings.push({
          allergen: allergy.allergen,
          reaction: allergy.reaction || 'Unknown reaction',
          severity: allergy.severity || 'moderate',
          match_type: 'cross_reactivity',
          explanation: `${medication_name} is in the same drug class as ${allergy.allergen}. Cross-reactivity risk exists.`,
        });
        continue;
      }

      // Also check reverse: medication is in the map and allergen is a class member
      const medClassMembers = DRUG_CLASS_MAP[medLower] || [];
      const allergenWords = allergenLower.split(/[\s\/\-\(\)]+/);
      const reverseMatch = medClassMembers.some(member =>
        allergenLower.includes(member) || allergenWords.some((w: string) => w === member)
      );

      if (reverseMatch) {
        warnings.push({
          allergen: allergy.allergen,
          reaction: allergy.reaction || 'Unknown reaction',
          severity: allergy.severity || 'moderate',
          match_type: 'cross_reactivity',
          explanation: `${allergy.allergen} is in the same drug class as ${medication_name}. Cross-reactivity risk exists.`,
        });
      }
    }

    // 3. If no local matches found, use AI for deeper analysis
    if (warnings.length === 0 && aiService.isAvailable()) {
      try {
        const allergenNames = allAllergies.map(a => `${a.allergen} (${a.severity || 'unknown'} severity, reaction: ${a.reaction || 'unknown'})`).join(', ');

        const response = await aiService.checkAllergyInteraction({
          medication: medication_name,
          allergies: allergenNames,
        });

        if (response.success && response.data?.has_risk) {
          for (const risk of response.data.risks) {
            const matchingAllergy = allAllergies.find(
              (a: { allergen: string }) => a.allergen.toLowerCase() === risk.related_allergen?.toLowerCase()
            ) || allAllergies[0];

            warnings.push({
              allergen: risk.related_allergen || matchingAllergy.allergen,
              reaction: matchingAllergy.reaction || 'Unknown reaction',
              severity: risk.severity || matchingAllergy.severity || 'moderate',
              match_type: 'ai_detected',
              explanation: risk.explanation || `AI analysis detected potential cross-reactivity between ${medication_name} and ${matchingAllergy.allergen}.`,
            });
          }
        }
      } catch (aiError) {
        console.error('AI allergy check error:', aiError);
        // Non-fatal — local checks already ran
      }
    }

    res.json({
      warnings,
      safe: warnings.length === 0,
      patient_allergies: allAllergies.map((a: { allergen: string; severity: string }) => ({
        allergen: a.allergen,
        severity: a.severity,
      })),
    });
  } catch (error) {
    console.error('Allergy check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
