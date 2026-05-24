import { config, log } from './config';

const headers = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Bridge-Key': config.bridgeApiKey,
});

export interface PendingWorklistOrder {
  order_id: number;
  accession_number: string;
  scheduled_procedure_step_id: string;
  scheduled_station_ae_title: string;
  modality: string;
  study_description: string;
  requested_procedure_description: string;
  priority: string;
  scheduled_datetime: string;
  patient: {
    id: number;
    patient_number: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    sex: string;
  };
  referring_physician: string | null;
}

export interface StudyWebhookPayload {
  study_instance_uid: string;
  accession_number?: string | null;
  orthanc_id?: string;
  study_date?: string;
  study_description?: string;
  modality?: string;
  institution_name?: string;
  referring_physician?: string;
  series_count?: number;
  instances_count?: number;
  series?: Array<{
    series_instance_uid: string;
    series_number?: number;
    description?: string;
    modality?: string;
    body_part?: string;
    instances_count?: number;
    orthanc_id?: string;
  }>;
}

export async function fetchPendingWorklist(): Promise<PendingWorklistOrder[]> {
  const url = `${config.medsysApiUrl}/api/imaging/integration/pending-worklist`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`pending-worklist HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { orders: PendingWorklistOrder[] };
  return data.orders || [];
}

export async function markWorklistPushed(orderId: number): Promise<void> {
  const url = `${config.medsysApiUrl}/api/imaging/integration/orders/${orderId}/worklist-pushed`;
  const res = await fetch(url, { method: 'POST', headers: headers() });
  if (!res.ok) {
    throw new Error(`worklist-pushed HTTP ${res.status}: ${await res.text()}`);
  }
}

export async function postStudyWebhook(payload: StudyWebhookPayload): Promise<void> {
  const url = `${config.medsysApiUrl}/api/webhooks/orthanc/study`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`study webhook HTTP ${res.status}: ${await res.text()}`);
  }
  log.info('study forwarded to MedSys', payload.study_instance_uid);
}
