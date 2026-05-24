import apiClient from './client';

export interface ImagingStudy {
  id: number;
  study_instance_uid: string;
  accession_number: string | null;
  study_date: string | null;
  study_description: string | null;
  modality: string | null;
  series_count: number;
  instances_count: number;
  status: string;
}

export const imagingAPI = {
  studiesByOrder: async (orderId: number): Promise<ImagingStudy[]> => {
    const { data } = await apiClient.get(`/imaging/studies/by-order/${orderId}`);
    return data.studies || [];
  },

  viewerUrl: async (studyId: number): Promise<string> => {
    const { data } = await apiClient.get(`/imaging/studies/${studyId}/viewer-url`);
    return data.url;
  },

  /**
   * Open the Stone Web Viewer for the first study linked to an imaging order.
   * Two API hops: study lookup + viewer URL. Throws if no study or viewer not
   * configured server-side.
   */
  async openViewerForOrder(orderId: number): Promise<void> {
    const studies = await imagingAPI.studiesByOrder(orderId);
    if (studies.length === 0) {
      throw new Error('No DICOM study linked to this order yet');
    }
    const url = await imagingAPI.viewerUrl(studies[0].id);
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};
