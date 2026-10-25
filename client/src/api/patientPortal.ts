import apiClient from './client';

export interface PortalVerifyResponse {
  message: string;
  user: {
    id: number;
    username: string;
    role: string;
    first_name: string;
    last_name: string;
    is_super_admin?: boolean;
  };
  token: string;
  /** Where the link should land, e.g. 'visit:123' or 'messages' (from a texted link). */
  target?: string | null;
}

export interface PortalMe {
  patient_id: number;
  patient_number: string;
  date_of_birth: string;
  first_name: string;
  last_name: string;
  username: string;
  /** Clinic replies the patient hasn't opened yet. */
  unread_messages?: number;
  renewed_token?: string;
}

export interface PortalLabParameter {
  parameter_code: string;
  parameter_name: string;
  unit: string | null;
  normal_low: number | string | null;
  normal_high: number | string | null;
  critical_low: number | string | null;
  critical_high: number | string | null;
  reference_range_text: string | null;
  value_type: 'numeric' | 'qualitative';
}

/** released = result visible; awaiting_review = done, held for the doctor (max 3 days); in_progress = not done yet. */
export type ReleaseState = 'released' | 'awaiting_review' | 'in_progress';

export interface PortalLab {
  id: number;
  test_name: string;
  ordered_date: string | null;
  ordered_by: string | null;
  release_state: ReleaseState;
  doctor_reviewed: boolean;
  available_by: string | null;
  released_at: string | null;
  result: string | null;
  parameters: PortalLabParameter[];
}

export interface PortalImaging {
  id: number;
  imaging_type: string;
  body_part: string | null;
  ordered_date: string | null;
  completed_date: string | null;
  release_state: ReleaseState;
  available_by: string | null;
  findings: string | null;
}

export interface PortalMedication {
  id: number;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  prescribed_by: string | null;
}

export interface PortalAppointment {
  id: number;
  appointment_date: string;
  status: string;
  reason: string | null;
  appointment_type: string | null;
  has_time: boolean;
  provider_name: string | null;
}

export interface PortalBill {
  id: number;
  invoice_number: string;
  invoice_date: string;
  encounter_id: number | null;
  covered: boolean;
  payer_name: string | null;
  total: number;
  your_share: number;
  covered_share: number;
  you_paid: number;
  balance_due: number;
  items: { description: string; quantity: number; amount: number; paid_by: 'you' | 'cover' }[];
  payments: { date: string; amount: number; method: string | null }[];
}

/** A finished visit and its patient-friendly summary. */
export interface PortalVisit {
  id: number;
  encounter_number: string | null;
  visit_date: string;
  clinic: string | null;
  visit_type: string | null;
  doctor_name: string | null;
  reason: string | null;
  diagnoses: string[];
  medicines: { name: string; dosage: string | null; frequency: string | null; route: string | null; days: number | null }[];
  tests: string[];
  follow_up: { timeframe: string | null; reason: string | null; date: string | null; has_time: boolean } | null;
  patient_note: string | null;
  invoice_id: number | null;
}

export interface PortalMessage {
  id: number;
  sender: 'patient' | 'staff';
  body: string;
  created_at: string;
  staff_name: string | null;
  /** For the patient's own messages: has the clinic opened it. */
  read: boolean;
}

export const patientPortalAPI = {
  // Self-service: request an access link. `identifier` is an email address or a
  // phone number; the server picks email or SMS to match.
  requestLink: async (identifier: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/patient-portal/request-link', { identifier });
    return response.data;
  },

  // Verify the link token + date of birth, establishing a session.
  verify: async (token: string, date_of_birth: string): Promise<PortalVerifyResponse> => {
    const response = await apiClient.post('/patient-portal/verify', { token, date_of_birth });
    return response.data;
  },

  // Front desk: send the access link from a patient's record. Channel defaults
  // to SMS when a valid phone is on file, falling back to email.
  staffSend: async (patientId: number, channel?: 'sms' | 'email'): Promise<{ message: string; channel?: string }> => {
    const response = await apiClient.post('/patient-portal/staff-send', { patient_id: patientId, channel });
    return response.data;
  },

  // Authenticated patient: own profile (and resolves their patient_id).
  me: async (): Promise<PortalMe> => {
    const response = await apiClient.get('/patient-portal/me');
    return response.data;
  },

  labs: async (): Promise<PortalLab[]> => (await apiClient.get('/patient-portal/labs')).data.labs,
  imaging: async (): Promise<PortalImaging[]> => (await apiClient.get('/patient-portal/imaging')).data.imaging,
  medications: async (): Promise<PortalMedication[]> =>
    (await apiClient.get('/patient-portal/medications')).data.medications,
  appointments: async (): Promise<PortalAppointment[]> =>
    (await apiClient.get('/patient-portal/appointments')).data.appointments,
  bills: async (): Promise<{ bills: PortalBill[]; total_due: number }> =>
    (await apiClient.get('/patient-portal/bills')).data,
  visits: async (): Promise<PortalVisit[]> => (await apiClient.get('/patient-portal/visits')).data.visits,
  // Opening the conversation marks the clinic's replies as read.
  messages: async (): Promise<PortalMessage[]> => (await apiClient.get('/patient-portal/messages')).data.messages,
  sendMessage: async (body: string): Promise<PortalMessage> =>
    (await apiClient.post('/patient-portal/messages', { body })).data.message,
};
