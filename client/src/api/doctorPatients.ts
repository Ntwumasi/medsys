import apiClient from './client';

/** One encounter in the "Seen" section of GET /reports/doctor-patients. */
export interface SeenEncounter {
  encounter_id: number;
  patient_id: number;
  provider_id: number | null;
  provider_name: string | null;
  encounter_date: string;
  encounter_type: string | null;
  chief_complaint: string | null;
  primary_diagnosis: string | null;
  status: string;
  is_home_visit: boolean;
  patient_number: string | null;
  /** NULL when unknown (the 1900-01-01 placeholder is sent as NULL). */
  date_of_birth: string | null;
  patient_name: string | null;
  phone: string | null;
}

export interface ReportAppointment {
  appointment_id: number;
  patient_id: number | null;
  provider_id: number | null;
  provider_name: string | null;
  appointment_date: string;
  duration_minutes: number | null;
  appointment_type: string | null;
  status: string;
  reason: string | null;
  location_type: string;
  patient_number: string | null;
  date_of_birth: string | null;
  patient_name: string | null;
  phone: string | null;
  has_same_day_encounter: boolean;
  /** No-show, or time passed while still scheduled/confirmed with no visit that day. */
  missed: boolean;
}

export interface DoctorGroup {
  doctor_id: number | null;
  doctor_name: string;
  count: number;
}

export interface DoctorPatientsReport {
  from: string;
  to: string;
  doctor_id: number | null;
  seen: {
    total: number;
    truncated: boolean;
    groups: Array<DoctorGroup & { encounters: SeenEncounter[] }>;
  };
  appointments: {
    total: number;
    missed_count: number;
    truncated: boolean;
    groups: Array<DoctorGroup & { missed_count: number; appointments: ReportAppointment[] }>;
  };
}

export const getDoctorPatientsReport = async (params: {
  from: string;
  to: string;
  doctor_id?: number | null;
}): Promise<DoctorPatientsReport> => {
  const { data } = await apiClient.get('/reports/doctor-patients', {
    params: { from: params.from, to: params.to, ...(params.doctor_id ? { doctor_id: params.doctor_id } : {}) },
  });
  return data;
};
