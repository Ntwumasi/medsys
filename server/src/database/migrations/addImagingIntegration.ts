/**
 * Database migration for DICOM Imaging Integration
 *
 * This migration adds:
 * 1. imaging_studies - Store DICOM studies metadata from Orthanc PACS
 * 2. imaging_series - Store individual series within a study
 * 3. imaging_measurements - Store structured report measurements (from ultrasound)
 * 4. Additional columns to imaging_orders for DICOM workflow
 */

import pool from '../db';

async function addImagingIntegration() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('Starting imaging integration migration...');

    // 1. Create imaging_studies table - Store DICOM studies metadata
    console.log('Creating imaging_studies table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_studies (
        id SERIAL PRIMARY KEY,
        study_instance_uid VARCHAR(128) UNIQUE NOT NULL,  -- DICOM Study UID
        accession_number VARCHAR(64),                      -- Links to imaging_orders
        patient_id INTEGER REFERENCES patients(id),
        imaging_order_id INTEGER REFERENCES imaging_orders(id),
        encounter_id INTEGER REFERENCES encounters(id),

        -- Study metadata (from DICOM)
        study_date TIMESTAMP,
        study_description VARCHAR(255),
        modality VARCHAR(16),                              -- DX, RF, US, etc.
        institution_name VARCHAR(255),
        referring_physician VARCHAR(255),

        -- Orthanc references
        orthanc_id VARCHAR(64),                            -- Orthanc's internal ID
        series_count INTEGER DEFAULT 0,
        instances_count INTEGER DEFAULT 0,

        -- Status
        status VARCHAR(32) DEFAULT 'received',             -- received, reviewed, reported
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create imaging_series table - Store individual series within a study
    console.log('Creating imaging_series table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_series (
        id SERIAL PRIMARY KEY,
        study_id INTEGER REFERENCES imaging_studies(id) ON DELETE CASCADE,
        series_instance_uid VARCHAR(128) UNIQUE NOT NULL,
        series_number INTEGER,
        series_description VARCHAR(255),
        modality VARCHAR(16),
        body_part_examined VARCHAR(64),
        instances_count INTEGER DEFAULT 0,
        orthanc_id VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Create imaging_measurements table - Store structured report measurements (from ultrasound)
    console.log('Creating imaging_measurements table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_measurements (
        id SERIAL PRIMARY KEY,
        study_id INTEGER REFERENCES imaging_studies(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),

        -- Measurement details
        measurement_type VARCHAR(64),        -- e.g., 'LV_EF', 'BPD', 'FL', 'AC'
        measurement_name VARCHAR(128),       -- Human readable name
        value DECIMAL(10, 4),
        unit VARCHAR(32),                    -- e.g., 'mm', 'cm', '%', 'ml'

        -- Context
        body_site VARCHAR(64),
        laterality VARCHAR(16),              -- 'left', 'right', 'bilateral'

        -- Reference ranges
        reference_min DECIMAL(10, 4),
        reference_max DECIMAL(10, 4),
        is_abnormal BOOLEAN DEFAULT FALSE,

        -- Source
        sr_sop_instance_uid VARCHAR(128),    -- DICOM SR reference

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Add DICOM-related fields to existing imaging_orders table
    console.log('Adding DICOM fields to imaging_orders...');

    // Add accession_number column
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS accession_number VARCHAR(64)
    `);

    // Add study_instance_uid column
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(128)
    `);

    // Add scheduled_station_ae_title column
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS scheduled_station_ae_title VARCHAR(16)
    `);

    // Add scheduled_procedure_step_id column
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS scheduled_procedure_step_id VARCHAR(64)
    `);

    // Add modality_worklist_pushed flag
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS modality_worklist_pushed BOOLEAN DEFAULT FALSE
    `);

    // Add mpps_received flag
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS mpps_received BOOLEAN DEFAULT FALSE
    `);

    // Add clinical_indication column
    await client.query(`
      ALTER TABLE imaging_orders
      ADD COLUMN IF NOT EXISTS clinical_indication TEXT
    `);

    // 5. Create indexes for performance
    console.log('Creating indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient
      ON imaging_studies(patient_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_order
      ON imaging_studies(imaging_order_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_accession
      ON imaging_studies(accession_number)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_uid
      ON imaging_studies(study_instance_uid)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_series_study
      ON imaging_series(study_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_measurements_study
      ON imaging_measurements(study_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_measurements_patient
      ON imaging_measurements(patient_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_orders_accession
      ON imaging_orders(accession_number)
    `);

    // 6. Update imaging_orders status constraint to include additional statuses
    console.log('Updating imaging_orders status constraint...');

    // Drop old constraint if exists
    await client.query(`
      ALTER TABLE imaging_orders
      DROP CONSTRAINT IF EXISTS imaging_orders_status_check
    `);

    // Add new constraint with additional statuses
    await client.query(`
      ALTER TABLE imaging_orders
      ADD CONSTRAINT imaging_orders_status_check
      CHECK (status IN ('ordered', 'pending', 'scheduled', 'in_progress', 'in-progress', 'completed', 'cancelled', 'reported'))
    `);

    await client.query('COMMIT');
    console.log('Imaging integration migration completed successfully!');
    console.log('');
    console.log('New tables created:');
    console.log('  - imaging_studies: Store DICOM studies metadata');
    console.log('  - imaging_series: Store individual series within a study');
    console.log('  - imaging_measurements: Store structured report measurements');
    console.log('');
    console.log('Updated tables:');
    console.log('  - imaging_orders: Added DICOM workflow columns');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during imaging integration migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
addImagingIntegration()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
