import { Request, Response } from 'express';
import pool from '../database/db';

// Default H&P sections structure
const DEFAULT_SECTIONS = [
  { id: 'chief_complaint', title: 'Chief Complaint', content: '', completed: false },
  { id: 'hpi', title: 'HPI / Subjective / Objective', content: '', completed: false },
  { id: 'past_medical_history', title: 'Past Medical History', content: '', completed: false },
  { id: 'past_surgical_history', title: 'Past Surgical History', content: '', completed: false },
  { id: 'health_maintenance', title: 'Health Maintenance', content: '', completed: false },
  { id: 'immunization_history', title: 'Immunization History', content: '', completed: false },
  { id: 'home_medications', title: 'Home Medications', content: '', completed: false },
  { id: 'allergies', title: 'Allergies', content: '', completed: false },
  { id: 'social_history', title: 'Social History', content: '', completed: false },
  { id: 'family_history', title: 'Family History', content: '', completed: false },
  { id: 'primary_care_provider', title: 'Primary Care Provider', content: '', completed: false },
  {
    id: 'review_of_systems',
    title: 'REVIEW OF SYSTEMS',
    content: '',
    completed: false,
    subsections: [
      { id: 'ros_constitutional', title: 'Constitutional', content: '', completed: false },
      { id: 'ros_allergic', title: 'Allergic / Immunologic', content: '', completed: false },
      { id: 'ros_head', title: 'Head', content: '', completed: false },
      { id: 'ros_eyes', title: 'Eyes', content: '', completed: false },
      { id: 'ros_ent', title: 'Ears, Nose, Mouth and Throat', content: '', completed: false },
      { id: 'ros_neck', title: 'Neck', content: '', completed: false },
      { id: 'ros_breasts', title: 'Breasts', content: '', completed: false },
      { id: 'ros_respiratory', title: 'Respiratory', content: '', completed: false },
      { id: 'ros_cardiac', title: 'Cardiac/Peripheral Vascular', content: '', completed: false },
      { id: 'ros_gi', title: 'Gastrointestinal', content: '', completed: false },
      { id: 'ros_gu', title: 'Genitourinary', content: '', completed: false },
      { id: 'ros_musculoskeletal', title: 'Musculoskeletal', content: '', completed: false },
      { id: 'ros_skin', title: 'Skin', content: '', completed: false },
      { id: 'ros_neuro', title: 'Neurological', content: '', completed: false },
      { id: 'ros_psych', title: 'Psychiatric', content: '', completed: false },
      { id: 'ros_endo', title: 'Endocrine', content: '', completed: false },
      { id: 'ros_heme', title: 'Hematologic/Lymphatic', content: '', completed: false },
    ],
  },
  { id: 'vital_signs', title: 'Vital Signs', content: '', completed: false },
  { id: 'physical_exam', title: 'PHYSICAL EXAM', content: '', completed: false },
  { id: 'lab_results', title: 'Lab Results', content: '', completed: false },
  { id: 'imaging_results', title: 'Imaging Results', content: '', completed: false },
  { id: 'assessment', title: 'Assessment/Problem List', content: '', completed: false },
  { id: 'plan', title: 'Plan', content: '', completed: false },
];

// Helper function to merge saved data with default sections
const mergeSavedData = (sections: any[], savedData: any): any[] => {
  return sections.map(section => {
    const saved = savedData[section.id];
    const mergedSection = {
      ...section,
      content: saved?.content || section.content,
      completed: saved?.completed || section.completed,
    };

    if (section.subsections) {
      mergedSection.subsections = mergeSavedData(section.subsections, savedData);
    }

    return mergedSection;
  });
};

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

    // Convert database results to lookup object
    const savedData: any = {};
    result.rows.forEach(row => {
      savedData[row.section_id] = {
        content: row.content,
        completed: row.completed,
        updatedBy: row.updated_by_role,
        updatedAt: row.updated_at,
      };
    });

    // Merge saved data with default sections
    const sections = mergeSavedData(JSON.parse(JSON.stringify(DEFAULT_SECTIONS)), savedData);

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
