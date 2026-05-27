import apiClient from './client';

export interface OnlineUser {
  id: number;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  last_seen: string;
}

export interface VoIPCall {
  id: number;
  caller_id: number;
  callee_id: number;
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'cancelled';
  started_at?: string;
  ended_at?: string;
  duration_secs?: number;
  created_at: string;
  // Populated on incoming
  first_name?: string;
  last_name?: string;
  role?: string;
  offer_sdp?: string;
}

export interface VoIPSignal {
  id: number;
  from_user: number;
  type: 'offer' | 'answer' | 'ice_candidate';
  payload: string;
}

export interface CallHistoryEntry {
  id: number;
  direction: 'incoming' | 'outgoing';
  other_id: number;
  other_name: string;
  other_role: string;
  status: string;
  duration_secs?: number;
  created_at: string;
}

const voipAPI = {
  // Presence
  heartbeat: (status = 'online') =>
    apiClient.post('/voip/heartbeat', { status }),

  getPresence: () =>
    apiClient.get<{ users: OnlineUser[] }>('/voip/presence'),

  // Call lifecycle
  createCall: (calleeId: number, offer: string) =>
    apiClient.post<{ call: VoIPCall }>('/voip/calls', { callee_id: calleeId, offer }),

  getIncoming: () =>
    apiClient.get<{ call: VoIPCall | null }>('/voip/incoming'),

  answerCall: (callId: number, answer: string) =>
    apiClient.post<{ call: VoIPCall }>(`/voip/calls/${callId}/answer`, { answer }),

  declineCall: (callId: number) =>
    apiClient.post<{ call: VoIPCall }>(`/voip/calls/${callId}/decline`),

  cancelCall: (callId: number) =>
    apiClient.post<{ call: VoIPCall }>(`/voip/calls/${callId}/cancel`),

  endCall: (callId: number) =>
    apiClient.post<{ call: VoIPCall }>(`/voip/calls/${callId}/end`),

  getCallStatus: (callId: number) =>
    apiClient.get<{ call: VoIPCall }>(`/voip/calls/${callId}/status`),

  // Signaling
  sendSignal: (callId: number, type: string, payload: string) =>
    apiClient.post(`/voip/calls/${callId}/signal`, { type, payload }),

  getSignals: (callId: number, afterId: number) =>
    apiClient.get<{ signals: VoIPSignal[] }>(`/voip/calls/${callId}/signals?after=${afterId}`),

  // History
  getHistory: () =>
    apiClient.get<{ calls: CallHistoryEntry[] }>('/voip/history'),
};

export default voipAPI;
