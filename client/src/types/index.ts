export interface User {
  id: number;
  email: string;
  role: 'doctor' | 'nurse' | 'admin' | 'receptionist' | 'patient';
  first_name: string;
  last_name: string;
  phone?: string;
}

export interface Patient {
  id: number;
  user_id?: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
  address?: string;
  city?: string;
  state?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  insurance_provider?: string;
  insurance_number?: string;
  marital_status?: string;
  occupation?: string;
  created_at: string;
  updated_at: string;
}

export interface VitalSigns {
  temperature?: number;
  temperature_unit?: 'C' | 'F';
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: 'kg' | 'lbs';
  height?: number;
  height_unit?: 'cm' | 'in';
  bmi?: number;
}

export interface Encounter {
  id: number;
  patient_id: number;
  provider_id: number;
  provider_name?: string;
  patient_number?: string;
  encounter_number?: string;
  room_id?: number;
  nurse_id?: number;
  receptionist_id?: number;
  encounter_date: string;
  encounter_type?: string;
  chief_complaint?: string;
  history_of_present_illness?: string;
  vital_signs?: VitalSigns;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  triage_time?: string;
  triage_priority?: 'green' | 'yellow' | 'red';
  checked_in_at?: string;
  nurse_started_at?: string;
  doctor_started_at?: string;
  completed_at?: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: number;
  patient_id: number;
  medication_name: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  start_date: string;
  end_date?: string;
  prescribing_doctor?: number;
  prescribing_doctor_name?: string;
  status: 'active' | 'discontinued' | 'completed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Allergy {
  id: number;
  patient_id: number;
  allergen: string;
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  onset_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  patient_name?: string;
  patient_number?: string;
  provider_name?: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type?: string;
  status: 'scheduled' | 'confirmed' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PatientSummary {
  patient: Patient;
  recent_encounters: Encounter[];
  active_medications: Medication[];
  allergies: Allergy[];
  upcoming_appointments: Appointment[];
}
