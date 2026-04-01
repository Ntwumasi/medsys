import apiClient from './client';

export interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  is_mine: boolean;
  subject: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  other_user_id: number;
  other_user_name: string;
  other_user_role: string;
  last_message_id: number;
  last_message_subject: string | null;
  last_message_preview: string;
  last_message_sender_id: number;
  last_message_at: string;
  unread_count: number;
}

export interface MessageableUser {
  id: number;
  name: string;
  role: string;
  username: string;
}

export interface ThreadResponse {
  other_user: {
    id: number;
    name: string;
    role: string;
  };
  messages: Message[];
}

export const messagesAPI = {
  // Get inbox with conversations
  getInbox: async (): Promise<{ conversations: Conversation[] }> => {
    const response = await apiClient.get('/messages/inbox');
    return response.data;
  },

  // Get unread message count
  getUnreadCount: async (): Promise<{ unread_count: number }> => {
    const response = await apiClient.get('/messages/unread-count');
    return response.data;
  },

  // Get list of users that can be messaged
  getMessageableUsers: async (): Promise<{ users: MessageableUser[] }> => {
    const response = await apiClient.get('/messages/users');
    return response.data;
  },

  // Get message thread with a user
  getThread: async (otherUserId: number): Promise<ThreadResponse> => {
    const response = await apiClient.get(`/messages/thread/${otherUserId}`);
    return response.data;
  },

  // Send a message
  sendMessage: async (data: { recipient_id: number; subject?: string; body: string }): Promise<{ message: string; data: Message }> => {
    const response = await apiClient.post('/messages', data);
    return response.data;
  },

  // Mark message as read
  markAsRead: async (messageId: number): Promise<void> => {
    await apiClient.put(`/messages/${messageId}/read`);
  },

  // Delete a message
  deleteMessage: async (messageId: number): Promise<void> => {
    await apiClient.delete(`/messages/${messageId}`);
  },
};
