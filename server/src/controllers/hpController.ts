import { Request, Response } from 'express';
import pool from '../database/db';

// Get H&P data for an encounter
export const getHP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const result = await pool.query(
      `SELECT section_id, content, completed, updated_by_role, updated_at
       FROM hp_sections
       WHERE encounter_id = $1
       ORDER BY updated_at DESC`,
      [encounter_id]
    );

    // Convert database results to section structure
    const sections: any = {};
    result.rows.forEach(row => {
      sections[row.section_id] = {
        content: row.content,
        completed: row.completed,
        updatedBy: row.updated_by_role,
        updatedAt: row.updated_at,
      };
    });

    res.json({ sections });
  } catch (error) {
    console.error('Get H&P error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Save H&P section
export const saveHPSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as any;
    const updated_by = authReq.user?.id;
    const { encounter_id, patient_id, section_id, content, completed, role } = req.body;

    // Check if section already exists
    const existingSection = await pool.query(
      `SELECT id FROM hp_sections WHERE encounter_id = $1 AND section_id = $2`,
      [encounter_id, section_id]
    );

    if (existingSection.rows.length > 0) {
      // Update existing section
      await pool.query(
        `UPDATE hp_sections
         SET content = $1,
             completed = $2,
             updated_by = $3,
             updated_by_role = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE encounter_id = $5 AND section_id = $6`,
        [content, completed, updated_by, role, encounter_id, section_id]
      );
    } else {
      // Insert new section
      await pool.query(
        `INSERT INTO hp_sections (
          encounter_id,
          patient_id,
          section_id,
          content,
          completed,
          updated_by,
          updated_by_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [encounter_id, patient_id, section_id, content, completed, updated_by, role]
      );
    }

    res.json({ message: 'H&P section saved successfully' });
  } catch (error) {
    console.error('Save H&P section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get H&P completion status
export const getHPStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { encounter_id } = req.params;

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_sections,
        COUNT(*) FILTER (WHERE completed = true) as completed_sections,
        MAX(updated_at) as last_updated
       FROM hp_sections
       WHERE encounter_id = $1`,
      [encounter_id]
    );

    const status = result.rows[0];
    const completionPercentage = status.total_sections > 0
      ? Math.round((status.completed_sections / status.total_sections) * 100)
      : 0;

    res.json({
      totalSections: parseInt(status.total_sections),
      completedSections: parseInt(status.completed_sections),
      completionPercentage,
      lastUpdated: status.last_updated,
    });
  } catch (error) {
    console.error('Get H&P status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
