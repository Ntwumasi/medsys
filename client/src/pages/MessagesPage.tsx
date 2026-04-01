import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { messagesAPI, Conversation, Message, MessageableUser, ThreadResponse } from '../api/messages';
import { useAuth } from '../context/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';

const MessagesPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [messageableUsers, setMessageableUsers] = useState<MessageableUser[]>([]);
  const [composeRecipient, setComposeRecipient] = useState<number | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load inbox on mount
  useEffect(() => {
    loadInbox();
    loadMessageableUsers();
  }, []);

  // Check URL params for pre-selected user
  useEffect(() => {
    const userId = searchParams.get('user');
    if (userId) {
      setSelectedUserId(parseInt(userId));
    }
  }, [searchParams]);

  // Load thread when user selected
  useEffect(() => {
    if (selectedUserId) {
      loadThread(selectedUserId);
    }
  }, [selectedUserId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages]);

  const loadInbox = async () => {
    try {
      setLoading(true);
      const data = await messagesAPI.getInbox();
      setConversations(data.conversations);
    } catch (error) {
      console.error('Failed to load inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessageableUsers = async () => {
    try {
      const data = await messagesAPI.getMessageableUsers();
      setMessageableUsers(data.users);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadThread = async (userId: number) => {
    try {
      setThreadLoading(true);
      const data = await messagesAPI.getThread(userId);
      setThread(data);
      // Refresh inbox to update unread counts
      loadInbox();
    } catch (error) {
      console.error('Failed to load thread:', error);
    } finally {
      setThreadLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !newMessage.trim()) return;

    try {
      setSending(true);
      await messagesAPI.sendMessage({
        recipient_id: selectedUserId,
        body: newMessage.trim(),
      });
      setNewMessage('');
      loadThread(selectedUserId);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeRecipient || !composeBody.trim()) return;

    try {
      setSending(true);
      await messagesAPI.sendMessage({
        recipient_id: composeRecipient,
        subject: composeSubject.trim() || undefined,
        body: composeBody.trim(),
      });
      setShowCompose(false);
      setComposeRecipient(null);
      setComposeSubject('');
      setComposeBody('');
      setSelectedUserId(composeRecipient);
      loadInbox();
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedUserId(conv.other_user_id);
    setSearchParams({ user: conv.other_user_id.toString() });
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-700',
      doctor: 'bg-green-100 text-green-700',
      nurse: 'bg-pink-100 text-pink-700',
      receptionist: 'bg-blue-100 text-blue-700',
      lab: 'bg-yellow-100 text-yellow-700',
      pharmacy: 'bg-orange-100 text-orange-700',
      pharmacist: 'bg-orange-100 text-orange-700',
      pharmacy_tech: 'bg-orange-100 text-orange-700',
      imaging: 'bg-indigo-100 text-indigo-700',
      accountant: 'bg-teal-100 text-teal-700',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  const filteredUsers = messageableUsers.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout title="Messages">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-12rem)] flex overflow-hidden">
        {/* Sidebar - Conversations */}
        <div className="w-80 border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
              <button
                onClick={() => setShowCompose(true)}
                className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                title="New Message"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p>No conversations yet</p>
                <button
                  onClick={() => setShowCompose(true)}
                  className="mt-2 text-primary-500 hover:text-primary-600 text-sm font-medium"
                >
                  Start a new conversation
                </button>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.other_user_id}
                  onClick={() => selectConversation(conv)}
                  className={`w-full p-4 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selectedUserId === conv.other_user_id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {conv.other_user_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 truncate">{conv.other_user_name}</span>
                        {conv.unread_count > 0 && (
                          <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getRoleColor(conv.other_user_role)}`}>
                        {conv.other_user_role}
                      </span>
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {conv.last_message_sender_id === user?.id ? 'You: ' : ''}
                        {conv.last_message_preview}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Content - Thread View */}
        <div className="flex-1 flex flex-col">
          {selectedUserId && thread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-sm">
                    {thread.other_user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{thread.other_user.name}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getRoleColor(thread.other_user.role)}`}>
                      {thread.other_user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {threadLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                  </div>
                ) : thread.messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  thread.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.is_mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          msg.is_mine
                            ? 'bg-primary-500 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}
                      >
                        {msg.subject && (
                          <p className={`text-sm font-semibold mb-1 ${msg.is_mine ? 'text-primary-100' : 'text-gray-600'}`}>
                            {msg.subject}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-xs mt-1 ${msg.is_mine ? 'text-primary-200' : 'text-gray-400'}`}>
                          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="px-4 py-2 bg-primary-500 text-white rounded-full hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">New Message</h3>
              <button
                onClick={() => setShowCompose(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleComposeSubmit} className="p-4 space-y-4">
              {/* Recipient Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a user..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {searchQuery && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setComposeRecipient(u.id);
                          setSearchQuery(u.name);
                        }}
                        className={`w-full p-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                          composeRecipient === u.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white text-xs font-semibold">
                          {u.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getRoleColor(u.role)}`}>
                            {u.role}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredUsers.length === 0 && (
                      <p className="p-2 text-sm text-gray-500">No users found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Subject (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject (optional)</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Enter subject..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!composeRecipient || !composeBody.trim() || sending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default MessagesPage;
