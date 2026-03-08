import { Request, Response } from 'express';
import aiService from '../services/aiService';
import pool from '../database/db';

interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

/**
 * Get AI-enhanced drug interaction explanation
 */
export const explainDrugInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { drug1, drug2, patientAge, patientConditions, existingInteraction } = req.body;

    if (!drug1 || !drug2) {
      res.status(400).json({ error: 'Both drug1 and drug2 are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available. Check OPENAI_API_KEY configuration.' });
      return;
    }

    const result = await aiService.explainDrugInteraction(
      { drug1, drug2, patientAge, patientConditions, existingInteraction },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Drug interaction AI error:', error);
    res.status(500).json({ error: 'Failed to process drug interaction analysis' });
  }
};

/**
 * Verify medication dosage with AI
 */
export const verifyDosage = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, dosage, frequency, patientAge, patientWeight, renalFunction, hepaticFunction } = req.body;

    if (!medication || !dosage || !frequency) {
      res.status(400).json({ error: 'Medication, dosage, and frequency are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.verifyDosage(
      { medication, dosage, frequency, patientAge, patientWeight, renalFunction, hepaticFunction },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Dosage verification AI error:', error);
    res.status(500).json({ error: 'Failed to verify dosage' });
  }
};

/**
 * Get medication substitution suggestions
 */
export const suggestSubstitutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, reason, patientAllergies, patientConditions, preferGeneric } = req.body;

    if (!medication || !reason) {
      res.status(400).json({ error: 'Medication and reason are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.suggestSubstitutions(
      { medication, reason, patientAllergies, patientConditions, preferGeneric },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Substitution AI error:', error);
    res.status(500).json({ error: 'Failed to generate substitutions' });
  }
};

/**
 * Generate patient counseling instructions
 */
export const generateCounseling = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { medication, dosage, frequency, route, patientName, conditions, otherMedications } = req.body;

    if (!medication || !dosage || !frequency || !route) {
      res.status(400).json({ error: 'Medication, dosage, frequency, and route are required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    const result = await aiService.generateCounseling(
      { medication, dosage, frequency, route, patientName, conditions, otherMedications },
      authReq.user?.id
    );

    if (result.success) {
      res.json({
        ...result.data,
        cached: result.cached || false,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Counseling AI error:', error);
    res.status(500).json({ error: 'Failed to generate counseling' });
  }
};

/**
 * Parse voice command for dispensing
 */
export const parseVoiceCommand = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { transcript, includeContext } = req.body;

    if (!transcript) {
      res.status(400).json({ error: 'Transcript is required' });
      return;
    }

    if (!aiService.isAvailable()) {
      res.status(503).json({ error: 'AI service not available' });
      return;
    }

    // Optionally fetch context data
    let context: any = {};
    if (includeContext) {
      // Get recent patients with pending orders
      const patientsResult = await pool.query(
        `SELECT DISTINCT ON (p.id) p.id, u.first_name || ' ' || u.last_name as name
         FROM pharmacy_orders po
         JOIN patients p ON po.patient_id = p.id
         JOIN users u ON p.user_id = u.id
         WHERE po.status IN ('ordered', 'in_progress', 'ready')
         ORDER BY p.id, po.ordered_date DESC
         LIMIT 20`
      );
      context.currentPatients = patientsResult.rows;

      // Get common medications
      const medsResult = await pool.query(
        `SELECT DISTINCT medication_name
         FROM pharmacy_inventory
         WHERE is_active = true AND quantity_on_hand > 0
         ORDER BY medication_name
         LIMIT 50`
      );
      context.availableMedications = medsResult.rows.map((r: any) => r.medication_name);
    }

    const result = await aiService.parseVoiceCommand(
      { transcript, context },
      authReq.user?.id
    );

    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Voice command AI error:', error);
    res.status(500).json({ error: 'Failed to parse voice command' });
  }
};

/**
 * Check AI service status
 */
export const getAIStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const isAvailable = aiService.isAvailable();

    // Get cache stats
    const cacheStats = await pool.query(
      `SELECT interaction_type, COUNT(*) as count
       FROM ai_interactions
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY interaction_type`
    );

    res.json({
      available: isAvailable,
      model: 'gpt-4o',
      cacheStats: cacheStats.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get AI status' });
  }
};
