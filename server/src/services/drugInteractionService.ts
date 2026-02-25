import pool from '../database/db';

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  recommendation: string;
}

export const drugInteractionService = {
  /**
   * Check for interactions between a new medication and patient's current medications
   */
  async checkInteractions(patientId: number, newMedication: string): Promise<DrugInteraction[]> {
    // Get patient's current active medications
    const currentMedsResult = await pool.query(
      `SELECT DISTINCT medication_name FROM pharmacy_orders
       WHERE patient_id = $1 AND status = 'dispensed'
       AND ordered_date > NOW() - INTERVAL '30 days'`,
      [patientId]
    );

    const currentMeds = currentMedsResult.rows.map(r => r.medication_name.toLowerCase());
    const interactions: DrugInteraction[] = [];

    // Check each current medication against the new one
    for (const med of currentMeds) {
      const interactionResult = await pool.query(
        `SELECT * FROM drug_interactions
         WHERE (LOWER(drug1_name) LIKE $1 AND LOWER(drug2_name) LIKE $2)
            OR (LOWER(drug1_name) LIKE $2 AND LOWER(drug2_name) LIKE $1)`,
        [`%${med}%`, `%${newMedication.toLowerCase()}%`]
      );

      for (const row of interactionResult.rows) {
        interactions.push({
          drug1: row.drug1_name,
          drug2: row.drug2_name,
          severity: row.severity,
          description: row.description,
          recommendation: row.recommendation,
        });
      }
    }

    return interactions;
  },

  /**
   * Check interactions between multiple medications (for new prescriptions)
   */
  async checkMultipleInteractions(medications: string[]): Promise<DrugInteraction[]> {
    const interactions: DrugInteraction[] = [];

    // Check each pair of medications
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        const interactionResult = await pool.query(
          `SELECT * FROM drug_interactions
           WHERE (LOWER(drug1_name) LIKE $1 AND LOWER(drug2_name) LIKE $2)
              OR (LOWER(drug1_name) LIKE $2 AND LOWER(drug2_name) LIKE $1)`,
          [`%${medications[i].toLowerCase()}%`, `%${medications[j].toLowerCase()}%`]
        );

        for (const row of interactionResult.rows) {
          interactions.push({
            drug1: row.drug1_name,
            drug2: row.drug2_name,
            severity: row.severity,
            description: row.description,
            recommendation: row.recommendation,
          });
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
