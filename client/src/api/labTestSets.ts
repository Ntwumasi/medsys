import apiClient from './client';

export interface LabTestSetItem {
  test_name: string;
  default_priority: 'routine' | 'urgent' | 'stat';
}

export interface LabTestSet {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_by_name: string;
  is_shared: boolean;
  is_mine: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  items: LabTestSetItem[];
}

export interface CreateLabTestSetPayload {
  name: string;
  description?: string;
  is_shared?: boolean;
  items: LabTestSetItem[];
}

export const labTestSetsAPI = {
  list: async (): Promise<LabTestSet[]> => {
    const { data } = await apiClient.get('/lab-test-sets');
    return data.sets || [];
  },
  create: async (payload: CreateLabTestSetPayload): Promise<LabTestSet> => {
    const { data } = await apiClient.post('/lab-test-sets', payload);
    return data.set;
  },
  apply: async (id: number): Promise<void> => {
    await apiClient.post(`/lab-test-sets/${id}/apply`);
  },
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/lab-test-sets/${id}`);
  },
};
