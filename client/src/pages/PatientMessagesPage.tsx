import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';
import { useActiveId } from '../hooks/useActiveId';
import { getApiError } from '../utils/apiError';
import { calculateAge } from '../utils/age';

/**
 * Front-desk inbox for messages patients send from the portal. Receptionists
 * and admins share it; any of them can answer. Answering texts the patient a
 * link (the text never repeats the message). Clinical questions should be
 * passed to a nurse or doctor in person — this inbox is not for advice.
 */

interface Conversation {
  patient_id: number;
  patient_number: string;
  patient_name: string;
  date_of_birth: string | null;
  last_body: string;
  last_sender: 'patient' | 'staff';
  last_at: string;
  unread: number;
}

interface ThreadMessage {
  id: number;
  sender: 'patient' | 'staff';
  body: string;
  created_at: string;
  staff_name: string | null;
  read_by_patient: boolean | null;
}

interface ThreadPatient {
  id: number;
  patient_number: string;
  patient_name: string;
  date_of_birth: string | null;
}

const when = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const ageText = (dob: string | null) => {
  const a = calculateAge(dob);
  return a === 'N/A' ? '' : a;
};

const PatientMessagesPage: React.FC = () => {
  useDesignSystemPage();
  const { showToast } = useNotification();
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('patient')) || null;
  const isActive = useActiveId(selectedId);

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [listError, setListError] = useState(false);
  const [patient, setPatient] = useState<ThreadPatient | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    apiClient.get('/portal-messages')
      .then((r) => { setConversations(r.data.conversations); setListError(false); })
      .catch(() => setListError(true));
  }, []);

  const loadThread = useCallback((id: number) => {
    apiClient.get(`/portal-messages/${id}`)
      .then((r) => {
        if (!isActive(id)) return; // moved to another patient meanwhile
        setPatient(r.data.patient);
        setMessages(r.data.messages);
        setThreadError(false);
        // Opening a conversation marks it read.
        setConversations((prev) => prev?.map((c) => (c.patient_id === id ? { ...c, unread: 0 } : c)) ?? prev);
      })
      .catch(() => { if (isActive(id)) setThreadError(true); });
  }, [isActive]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 30000);
    return () => clearInterval(t);
  }, [loadList]);

  // Switching patient: clear the previous patient's thread first, never show it under the new name.
  useEffect(() => {
    setPatient(null);
    setMessages(null);
    setThreadError(false);
    setDraft('');
    if (!selectedId) return;
    loadThread(selectedId);
    const t = setInterval(() => loadThread(selectedId), 20000);
    return () => clearInterval(t);
  }, [selectedId, loadThread]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  const select = (id: number | null) => setParams(id ? { patient: String(id) } : {});

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !patient) return;
    const target = patient;
    setSending(true);
    try {
      const r = await apiClient.post(`/portal-messages/${target.id}`, { body });
      if (isActive(target.id)) {
        setMessages((prev) => [...(prev || []), { ...r.data.message, staff_name: null }]);
        setDraft('');
      }
      showToast(
        r.data.texted
          ? `Reply sent to ${target.patient_name} — they've been texted a link`
          : `Reply saved for ${target.patient_name}, but the text didn't go (no valid phone). They'll see it next time they open the portal.`,
        r.data.texted ? 'success' : 'warning'
      );
      loadList();
    } catch (err) {
      showToast(getApiError(err, `Reply to ${target.patient_name} could not be sent`), 'error');
    } finally {
      setSending(false);
    }
  };

  const unreadTotal = (conversations || []).reduce((n, c) => n + c.unread, 0);

  return (
    <AppLayout title="Patient messages" designSystem>
      <div className="mb-5">
        <p className="text-sm text-ds-text-muted">
          Messages patients send from the portal. Anyone at the front desk can answer; the patient is texted when you reply.
          {unreadTotal > 0 && <span className="ml-1 font-semibold text-ds-accent-text">{unreadTotal} unread.</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-5 items-start">
        {/* Conversations — hidden on phones while a thread is open */}
        <section className={`bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden ${selectedId ? 'hidden lg:block' : ''}`} aria-label="Conversations">
          {listError && (
            <div className="m-4 text-sm text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-ds-control p-3 flex justify-between gap-3">
              <span>Couldn't load messages.</span>
              <button onClick={loadList} className="font-semibold underline">Try again</button>
            </div>
          )}
          {!conversations && !listError && <p className="p-5 text-sm text-ds-text-muted">Loading…</p>}
          {conversations && conversations.length === 0 && (
            <p className="p-5 text-sm text-ds-text-muted">No patient messages yet.</p>
          )}
          {conversations && conversations.length > 0 && (
            <ul className="divide-y divide-ds-border max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => {
                const active = c.patient_id === selectedId;
                return (
                  <li key={c.patient_id}>
                    <button
                      onClick={() => select(c.patient_id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full text-left px-4 py-3 min-h-ds-touch transition-colors ${active ? 'bg-ds-accent-soft' : 'hover:bg-ds-subtle'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate ${c.unread ? 'font-bold text-ds-text' : 'font-semibold text-ds-text'}`}>{c.patient_name}</span>
                        <span className="text-xs text-ds-text-muted shrink-0">{when(c.last_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-ds-text-muted">{c.patient_number}{ageText(c.date_of_birth) ? ` · ${ageText(c.date_of_birth)}` : ''}</span>
                        {c.unread > 0 && (
                          <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-ds-accent text-ds-on-accent text-[11px] font-semibold flex items-center justify-center">{c.unread}</span>
                        )}
                      </div>
                      <p className={`text-sm truncate mt-1 ${c.unread ? 'text-ds-text' : 'text-ds-text-muted'}`}>
                        {c.last_sender === 'staff' ? 'You: ' : ''}{c.last_body}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Thread */}
        <section className={`bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border flex flex-col min-h-[50vh] ${selectedId ? '' : 'hidden lg:flex'}`} aria-label="Conversation">
          {!selectedId && <p className="m-auto p-8 text-sm text-ds-text-muted">Choose a conversation.</p>}
          {selectedId && (
            <>
              {/* Patient identity stays visible above the conversation */}
              <header className="sticky top-16 z-10 bg-ds-surface border-b border-ds-border px-4 py-3 flex items-center gap-3 rounded-t-ds-card">
                <button onClick={() => select(null)} className="lg:hidden min-h-ds-touch min-w-[44px] inline-flex items-center justify-center rounded-ds-control text-ds-text-muted hover:bg-ds-subtle" aria-label="Back to conversations">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {patient ? (
                  <div className="min-w-0">
                    <p className="font-bold text-ds-text truncate">{patient.patient_name}</p>
                    <p className="text-xs text-ds-text-muted">{patient.patient_number}{ageText(patient.date_of_birth) ? ` · ${ageText(patient.date_of_birth)}` : ''}</p>
                  </div>
                ) : (
                  <div className="h-9 w-48 bg-ds-subtle rounded animate-pulse" aria-label="Loading patient" />
                )}
              </header>

              <div className="flex-1 p-4 overflow-y-auto max-h-[60vh]">
                {threadError && (
                  <div className="text-sm text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-ds-control p-3 flex justify-between gap-3">
                    <span>Couldn't load this conversation.</span>
                    <button onClick={() => loadThread(selectedId)} className="font-semibold underline">Try again</button>
                  </div>
                )}
                {!messages && !threadError && <p className="text-sm text-ds-text-muted">Loading…</p>}
                {messages && (
                  <ol className="space-y-3">
                    {messages.map((m) => {
                      const staff = m.sender === 'staff';
                      return (
                        <li key={m.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-ds-card px-4 py-2.5 ${staff ? 'bg-ds-accent-soft text-ds-text rounded-br-ds-sm' : 'bg-ds-subtle text-ds-text rounded-bl-ds-sm'}`}>
                            <p className="text-xs font-semibold text-ds-text-muted mb-0.5">{staff ? (m.staff_name || 'You') : patient?.patient_name || 'Patient'}</p>
                            <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                            <p className="text-[11px] text-ds-text-muted mt-1">
                              {when(m.created_at)}{staff && m.read_by_patient !== null ? (m.read_by_patient ? ' · Seen' : ' · Not seen yet') : ''}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                    <div ref={endRef} />
                  </ol>
                )}
              </div>

              <form onSubmit={send} className="border-t border-ds-border p-4">
                <label htmlFor="staff-reply" className="block text-sm font-medium text-ds-text mb-1.5">
                  Reply{patient ? ` to ${patient.patient_name}` : ''}
                </label>
                <textarea
                  id="staff-reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  disabled={!patient}
                  className="w-full rounded-ds-control border border-ds-border-control bg-ds-surface text-ds-text p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
                  placeholder="Write a reply…"
                />
                <div className="flex items-center justify-between gap-3 mt-2">
                  <p className="text-xs text-ds-text-muted">Medical questions: pass them to a nurse or doctor — don't give advice here.</p>
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending || !patient}
                    className="min-h-ds-touch px-5 rounded-ds-control bg-ds-accent text-ds-on-accent font-semibold hover:bg-ds-accent-hover disabled:opacity-50 shrink-0"
                  >
                    {sending ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
};

export default PatientMessagesPage;
