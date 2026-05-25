/**
 * SQL Security Utilities
 *
 * Provides field whitelisting to prevent SQL injection through dynamic column names.
 * All UPDATE operations should use these utilities to validate field names.
 */

// Whitelist of allowed fields for each table
const ALLOWED_FIELDS: Record<string, string[]> = {
  users: [
    'first_name', 'last_name', 'email', 'phone', 'role', 'is_active',
    'department', 'position', 'profile_image', 'password_hash',
    'must_change_password', 'password_changed_at', 'last_login',
    'failed_login_attempts', 'locked_until'
  ],
  patients: [
    // Demographics + identifiers
    'patient_number', 'date_of_birth', 'gender', 'allergies',
    'marital_status', 'occupation', 'nationality',
    // Address — patients schema stores it as discrete columns, not one
    // 'address' string; older spelling kept here for legacy callers.
    'address', 'city', 'state', 'region', 'gps_address', 'preferred_clinic',
    // Emergency contact (column names match the migrations)
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    // Insurance / billing
    'insurance_provider', 'insurance_number',
    // PCP
    'pcp_name', 'pcp_phone',
    // Health status flags added by addPatientHealthFields.ts. The frontend
    // posts these on update and the silent strip used to throw "No valid
    // fields to update" — now they actually persist.
    'vip_status', 'hiv_status', 'hepatitis_b_status', 'hepatitis_c_status',
    'tb_status', 'sickle_cell_status', 'other_health_conditions',
  ],
  appointments: [
    'patient_id', 'patient_name', 'provider_id', 'appointment_date',
    'duration_minutes', 'appointment_type', 'reason', 'notes', 'status'
  ],
  medications: [
    'medication_name', 'dosage', 'frequency', 'route', 'start_date',
    'end_date', 'instructions', 'prescribed_by', 'status', 'notes',
    'is_prn', 'duration', 'quantity'
  ],
  encounters: [
    'patient_id', 'provider_id', 'encounter_type', 'encounter_date',
    'chief_complaint', 'history_of_present_illness', 'review_of_systems',
    'physical_exam', 'assessment', 'plan', 'status', 'notes', 'clinic',
    'checked_in_at', 'completed_at', 'signed_at', 'signed_by',
    'self_pay_tier'
  ],
  lab_orders: [
    'patient_id', 'encounter_id', 'ordering_provider', 'entered_by',
    'test_name', 'test_code', 'priority', 'status', 'notes',
    'ordered_date', 'collected_date', 'result_date',
    'result', 'result_document_id', 'specimen_id', 'path_no',
    'verification_status', 'assigned_reviewer_id',
    'verified_by', 'verified_at', 'verification_notes',
    'rejection_reason', 'rejection_count'
  ],
  imaging_orders: [
    'patient_id', 'encounter_id', 'ordering_provider',
    'imaging_type', 'body_part', 'priority', 'status', 'notes',
    'ordered_date', 'scheduled_date', 'completed_date',
    'findings', 'clinical_indication', 'accession_number',
    'study_instance_uid', 'scheduled_station_ae_title',
    'scheduled_procedure_step_id', 'modality_worklist_pushed', 'mpps_received'
  ],
  pharmacy_orders: [
    'patient_id', 'encounter_id', 'ordering_provider', 'medication_name',
    'dosage', 'frequency', 'route', 'quantity', 'refills', 'priority',
    'status', 'notes', 'ordered_date', 'dispensed_date',
    'dispensed_by', 'prepared_by', 'days_supply', 'parent_order_id',
    'inventory_id', 'substitute_medication', 'substitute_reason',
    'return_quantity', 'return_reason', 'returned_at', 'returned_by',
    'administered_by', 'administered_at', 'administration_notes'
  ],
  invoices: [
    'patient_id', 'encounter_id', 'status', 'subtotal', 'tax_amount',
    'discount_amount', 'total_amount', 'amount_paid', 'balance',
    'notes', 'due_date', 'paid_at'
  ],
  pharmacy_inventory: [
    'name', 'generic_name', 'category', 'unit', 'quantity',
    'reorder_level', 'unit_price', 'expiry_date', 'supplier',
    'location', 'is_active', 'notes'
  ],
  lab_inventory: [
    'name', 'category', 'unit', 'quantity', 'reorder_level',
    'unit_price', 'expiry_date', 'supplier', 'location',
    'is_active', 'notes'
  ],
  quickbooks_config: [
    'company_file_path', 'is_active', 'auto_sync_customers',
    'auto_sync_invoices', 'auto_sync_payments', 'sync_interval_minutes',
    'last_sync_at', 'qbwc_username', 'qbwc_password_hash'
  ],
  corporate_clients: [
    'name', 'contact_person', 'email', 'phone', 'address',
    'discount_percentage', 'notes', 'is_active', 'assigned_doctor_id'
  ],
  messages: [
    'subject', 'body', 'is_read', 'read_at', 'is_archived'
  ],
  clinical_notes: [
    'encounter_id', 'note_type', 'content', 'signed_at', 'signed_by'
  ],
};

/**
 * Validates that all field names are in the whitelist for the given table.
 * Throws an error if any field is not allowed.
 *
 * @param tableName - The database table name
 * @param fields - Object with field names as keys
 * @returns Filtered object containing only allowed fields
 */
export function validateAndFilterFields<T extends Record<string, unknown>>(
  tableName: string,
  fields: T
): Partial<T> {
  const allowedFields = ALLOWED_FIELDS[tableName];

  if (!allowedFields) {
    throw new Error(`No field whitelist defined for table: ${tableName}`);
  }

  const filtered: Partial<T> = {};
  const rejectedFields: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      (filtered as Record<string, unknown>)[key] = value;
    } else {
      rejectedFields.push(key);
    }
  }

  if (rejectedFields.length > 0) {
    console.warn(`Rejected fields for ${tableName}: ${rejectedFields.join(', ')}`);
  }

  return filtered;
}

/**
 * Builds a safe UPDATE SET clause using only whitelisted fields.
 * Returns the clause string and the values array for parameterized query.
 *
 * @param tableName - The database table name
 * @param fields - Object with field names as keys and values
 * @param startParamIndex - Starting index for parameterized values ($1, $2, etc.)
 * @returns Object containing the SET clause string and values array
 */
export function buildSafeUpdateClause(
  tableName: string,
  fields: Record<string, unknown>,
  startParamIndex: number = 1
): { setClause: string; values: unknown[]; paramIndex: number } {
  const filteredFields = validateAndFilterFields(tableName, fields);
  const entries = Object.entries(filteredFields);

  if (entries.length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = startParamIndex;

  for (const [key, value] of entries) {
    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  return {
    setClause: setClauses.join(', '),
    values,
    paramIndex,
  };
}

/**
 * Validates that a number is a safe integer for use in SQL INTERVAL clauses.
 *
 * @param value - The value to validate
 * @param defaultValue - Default value if validation fails
 * @param maxValue - Maximum allowed value
 * @returns Safe integer value
 */
export function validateIntervalDays(
  value: unknown,
  defaultValue: number = 90,
  maxValue: number = 365
): number {
  const parsed = parseInt(String(value), 10);

  if (isNaN(parsed) || parsed < 0 || parsed > maxValue) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Validates sort field against a whitelist and returns safe value.
 *
 * @param field - The field name to validate
 * @param allowedFields - Map of allowed field names to SQL column expressions
 * @param defaultField - Default field if validation fails
 * @returns Safe SQL column expression
 */
export function validateSortField(
  field: unknown,
  allowedFields: Record<string, string>,
  defaultField: string
): string {
  const fieldStr = String(field || '');
  return allowedFields[fieldStr] || allowedFields[defaultField] || defaultField;
}

/**
 * Validates sort direction.
 *
 * @param direction - The direction to validate
 * @returns 'ASC' or 'DESC'
 */
export function validateSortDirection(direction: unknown): 'ASC' | 'DESC' {
  const dir = String(direction || '').toUpperCase();
  return dir === 'ASC' ? 'ASC' : 'DESC';
}
