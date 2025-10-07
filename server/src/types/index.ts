export interface User {
  id: number;
  email: string;
  role: 'doctor' | 'nurse' | 'admin' | 'receptionist' | 'patient';
  first_name: string;
  last_name: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: number;
  user_id?: number;
  patient_number: string;
  date_of_birth: Date;
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
  created_at: Date;
  updated_at: Date;
}

export interface Encounter {
  id: number;
  patient_id: number;
  provider_id: number;
  encounter_date: Date;
  encounter_type?: string;
  chief_complaint?: string;
  history_of_present_illness?: string;
  vital_signs?: VitalSigns;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  created_at: Date;
  updated_at: Date;
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

export interface Medication {
  id: number;
  patient_id: number;
  medication_name: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  start_date: Date;
  end_date?: Date;
  prescribing_doctor?: number;
  status: 'active' | 'discontinued' | 'completed';
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  appointment_date: Date;
  duration_minutes: number;
  appointment_type?: string;
  status: 'scheduled' | 'confirmed' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  reason?: string;
  notes?: string;
  created_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}
