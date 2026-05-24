import { config } from './config';

function authHeader(): string {
  const credentials = `${config.orthancUsername}:${config.orthancPassword}`;
  return 'Basic ' + Buffer.from(credentials).toString('base64');
}

async function orthancGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.orthancUrl}${path}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(`Orthanc ${path} HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface OrthancStudy {
  ID: string;
  MainDicomTags: Record<string, string>;
  PatientMainDicomTags: Record<string, string>;
  Series: string[];
}

export interface OrthancSeries {
  ID: string;
  MainDicomTags: Record<string, string>;
  Instances: string[];
}

export async function getStudy(orthancStudyId: string): Promise<OrthancStudy> {
  return orthancGet<OrthancStudy>(`/studies/${orthancStudyId}`);
}

export async function getSeries(orthancSeriesId: string): Promise<OrthancSeries> {
  return orthancGet<OrthancSeries>(`/series/${orthancSeriesId}`);
}

/**
 * Build the StudyWebhookPayload for MedSys from an Orthanc study ID.
 * The plugin can call this directly via the bridge so it doesn't have to
 * re-implement the field mapping.
 */
export async function buildStudyPayload(orthancStudyId: string): Promise<{
  study_instance_uid: string;
  accession_number: string | null;
  orthanc_id: string;
  study_date: string | undefined;
  study_description: string | undefined;
  modality: string | undefined;
  institution_name: string | undefined;
  referring_physician: string | undefined;
  series_count: number;
  instances_count: number;
  series: Array<{
    series_instance_uid: string;
    series_number?: number;
    description?: string;
    modality?: string;
    body_part?: string;
    instances_count: number;
    orthanc_id: string;
  }>;
}> {
  const study = await getStudy(orthancStudyId);
  const tags = study.MainDicomTags || {};

  const seriesList: OrthancSeries[] = [];
  let instancesCount = 0;
  for (const sid of study.Series) {
    const s = await getSeries(sid);
    seriesList.push(s);
    instancesCount += s.Instances?.length || 0;
  }

  const studyDate = formatDicomDate(tags.StudyDate, tags.StudyTime);

  return {
    study_instance_uid: tags.StudyInstanceUID,
    accession_number: tags.AccessionNumber || null,
    orthanc_id: study.ID,
    study_date: studyDate,
    study_description: tags.StudyDescription,
    modality: tags.ModalitiesInStudy || seriesList[0]?.MainDicomTags?.Modality,
    institution_name: tags.InstitutionName,
    referring_physician: tags.ReferringPhysicianName,
    series_count: seriesList.length,
    instances_count: instancesCount,
    series: seriesList.map((s) => {
      const st = s.MainDicomTags || {};
      return {
        series_instance_uid: st.SeriesInstanceUID,
        series_number: st.SeriesNumber ? parseInt(st.SeriesNumber, 10) : undefined,
        description: st.SeriesDescription,
        modality: st.Modality,
        body_part: st.BodyPartExamined,
        instances_count: s.Instances?.length || 0,
        orthanc_id: s.ID,
      };
    }),
  };
}

function formatDicomDate(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  // DICOM dates are YYYYMMDD, times are HHMMSS(.ffffff)
  const y = date.slice(0, 4);
  const m = date.slice(4, 6);
  const d = date.slice(6, 8);
  if (!y || !m || !d) return undefined;
  const t = (time || '120000').padEnd(6, '0');
  const hh = t.slice(0, 2);
  const mm = t.slice(2, 4);
  const ss = t.slice(4, 6);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}
