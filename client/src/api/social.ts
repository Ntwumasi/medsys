import apiClient from './client';
import type {
  StaffProfile,
  OwnProfileFields,
  DirectoryUser,
  FollowUser,
  Kudos,
  FeedItem,
  KudosTag,
  PresenceStatus,
} from '../types';

export interface UpdateProfilePayload {
  bio?: string;
  ask_me_about?: string;
  languages?: string[];
  interests?: string[];
  presence_status?: PresenceStatus;
}

export const socialAPI = {
  // Directory of staff (excludes patients) for discovery / finding people.
  getDirectory: async (q?: string): Promise<{ users: DirectoryUser[] }> => {
    const response = await apiClient.get('/profiles/directory', { params: q ? { q } : undefined });
    return response.data;
  },

  // View any staff profile (self or other).
  getProfile: async (userId: number): Promise<{ profile: StaffProfile }> => {
    const response = await apiClient.get(`/profiles/${userId}`);
    return response.data;
  },

  // Update own social fields + presence.
  updateMyProfile: async (data: UpdateProfilePayload): Promise<{ message: string; profile: OwnProfileFields }> => {
    const response = await apiClient.put('/profiles/me', data);
    return response.data;
  },

  follow: async (userId: number): Promise<{ is_following: boolean }> => {
    const response = await apiClient.post(`/profiles/${userId}/follow`);
    return response.data;
  },

  unfollow: async (userId: number): Promise<{ is_following: boolean }> => {
    const response = await apiClient.delete(`/profiles/${userId}/follow`);
    return response.data;
  },

  getFollowers: async (userId: number): Promise<{ users: FollowUser[] }> => {
    const response = await apiClient.get(`/profiles/${userId}/followers`);
    return response.data;
  },

  getFollowing: async (userId: number): Promise<{ users: FollowUser[] }> => {
    const response = await apiClient.get(`/profiles/${userId}/following`);
    return response.data;
  },

  giveKudos: async (data: { recipient_id: number; message: string; tag?: KudosTag | null }): Promise<{ kudos_id: number }> => {
    const response = await apiClient.post('/kudos', data);
    return response.data;
  },

  getKudos: async (userId: number, direction: 'received' | 'given' = 'received'): Promise<{ direction: string; kudos: Kudos[] }> => {
    const response = await apiClient.get(`/profiles/${userId}/kudos`, { params: { direction } });
    return response.data;
  },

  getFeed: async (scope: 'following' | 'mine' = 'following'): Promise<{ scope: string; items: FeedItem[] }> => {
    const response = await apiClient.get('/feed', { params: { scope } });
    return response.data;
  },
};

export default socialAPI;
