import pool from '../database/db';

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  recommendation: string;
}

// Table entries can be a drug ("Warfarin") or a class ("NSAIDs"). A
// prescription matches an entry when its name CONTAINS the drug or any class
// member — "Warfarin 5mg tab" matches "Warfarin". (The old query searched for
// the whole prescription text inside the short table name, so it almost never
// matched and the check reported "no interactions".)
const DRUG_CLASSES: Record<string, string[]> = {
  nsaids: ['ibuprofen', 'diclofenac', 'naproxen', 'piroxicam', 'indomethacin', 'ketorolac', 'meloxicam', 'celecoxib', 'mefenamic', 'ketoprofen', 'etoricoxib', 'aceclofenac', 'nsaid'],
  ssris: ['fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'escitalopram', 'fluvoxamine'],
  maois: ['phenelzine', 'tranylcypromine', 'isocarboxazid', 'selegiline', 'moclobemide'],
  'ace inhibitors': ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'perindopril', 'quinapril', 'fosinopril'],
  arbs: ['losartan', 'valsartan', 'telmisartan', 'irbesartan', 'candesartan', 'olmesartan'],
  antacids: ['antacid', 'aluminium hydroxide', 'aluminum hydroxide', 'magnesium trisilicate', 'magnesium hydroxide', 'calcium carbonate', 'gaviscon', 'relcer', 'mist mag'],
  potassium: ['potassium chloride', 'slow-k', 'k-cl', 'potassium citrate'],
};

const termsFor = (entry: string): string[] => {
  const key = entry.trim().toLowerCase();
  return DRUG_CLASSES[key] || [key];
};

export const medicationMatches = (medication: string, entry: string): boolean => {
  const name = medication.toLowerCase();
  return termsFor(entry).some((t) => t && name.includes(t));
};

type InteractionRow = { id: number; drug1_name: string; drug2_name: string; severity: DrugInteraction['severity']; description: string; recommendation: string };

const toInteraction = (row: InteractionRow): DrugInteraction => ({
  drug1: row.drug1_name,
  drug2: row.drug2_name,
  severity: row.severity,
  description: row.description,
  recommendation: row.recommendation,
});

/** Interactions between two named medications, from the given table rows. */
export const findPairInteractions = (a: string, b: string, rows: InteractionRow[]): InteractionRow[] =>
  rows.filter(
    (r) =>
      (medicationMatches(a, r.drug1_name) && medicationMatches(b, r.drug2_name)) ||
      (medicationMatches(a, r.drug2_name) && medicationMatches(b, r.drug1_name))
  );

const loadInteractionTable = async (): Promise<InteractionRow[]> =>
  (await pool.query(`SELECT id, drug1_name, drug2_name, severity, description, recommendation FROM drug_interactions`)).rows;

export const drugInteractionService = {
  /**
   * Check a new medication against everything the patient is currently on:
   * dispensed in the last 30 days, long-term meds dispensed in the last
   * 6 months, and active entries on their medication list.
   */
  async checkInteractions(patientId: number, newMedication: string): Promise<DrugInteraction[]> {
    const currentMedsResult = await pool.query(
      `SELECT DISTINCT LOWER(name) AS name FROM (
         SELECT COALESCE(substitute_medication, medication_name) AS name FROM pharmacy_orders
          WHERE patient_id = $1 AND status = 'dispensed'
            AND (ordered_date > NOW() - INTERVAL '30 days'
                 OR (is_long_term IS TRUE AND ordered_date > NOW() - INTERVAL '180 days'))
         UNION
         SELECT medication_name FROM medications
          WHERE patient_id = $1 AND status = 'active'
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ) m WHERE name IS NOT NULL`,
      [patientId]
    );
    const rows = await loadInteractionTable();
    const seen = new Set<number>();
    const interactions: DrugInteraction[] = [];
    for (const { name } of currentMedsResult.rows) {
      for (const row of findPairInteractions(name, newMedication, rows)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        interactions.push(toInteraction(row));
      }
    }
    return interactions;
  },

  /**
   * Check interactions between multiple medications (for new prescriptions)
   */
  async checkMultipleInteractions(medications: string[]): Promise<DrugInteraction[]> {
    const rows = await loadInteractionTable();
    const seen = new Set<number>();
    const interactions: DrugInteraction[] = [];
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        for (const row of findPairInteractions(medications[i], medications[j], rows)) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          interactions.push(toInteraction(row));
        }
      }
    }
    return interactions;
  },

  /**
   * Add a new drug interaction to the database
   */
  async addInteraction(interaction: DrugInteraction): Promise<void> {
    await pool.query(
      `INSERT INTO drug_interactions (drug1_name, drug2_name, severity, description, recommendation)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [interaction.drug1, interaction.drug2, interaction.severity, interaction.description, interaction.recommendation]
    );
  },

  /**
   * Get all known interactions for a specific drug
   */
  async getDrugInteractions(drugName: string): Promise<DrugInteraction[]> {
    const result = await pool.query(
      `SELECT * FROM drug_interactions
       WHERE LOWER(drug1_name) LIKE $1 OR LOWER(drug2_name) LIKE $1`,
      [`%${drugName.toLowerCase()}%`]
    );

    return result.rows.map(row => ({
      drug1: row.drug1_name,
      drug2: row.drug2_name,
      severity: row.severity,
      description: row.description,
      recommendation: row.recommendation,
    }));
  },
};

export default drugInteractionService;
