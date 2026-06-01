import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { setActiveToken } from '../api/client';
import { patientPortalAPI } from '../api/patientPortal';
import { branding } from '../config/branding';

type TabKey = 'labs' | 'imaging' | 'medications' | 'appointments';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'labs', label: 'Lab Results' },
  { key: 'imaging', label: 'Imaging Reports' },
  { key: 'medications', label: 'Medications' },
  { key: 'appointments', label: 'Appointments' },
];

const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
};

const StatusPill: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;
  const s = status.toLowerCase();
  const color =
    s.includes('complete') || s.includes('verified') || s === 'active'
      ? 'bg-green-100 text-green-700'
      : s.includes('cancel') || s.includes('reject')
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>{status}</span>;
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-12 text-gray-500">{text}</div>
);

const PatientPortal: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [patientId, setPatientId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('labs');

  const [labs, setLabs] = useState<any[]>([]);
  const [imaging, setImaging] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await patientPortalAPI.me();
        // Sliding session: persist a renewed token if the server issued one.
        if (me.renewed_token) {
          localStorage.setItem('token', me.renewed_token);
          setActiveToken(me.renewed_token);
        }
        if (cancelled) return;
        setFirstName(me.first_name || '');
        setPatientId(me.patient_id);

        const [labRes, imgRes, medRes, apptRes] = await Promise.all([
          apiClient.get('/orders/lab'),
          apiClient.get('/orders/imaging'),
          apiClient.get(`/medications/patient/${me.patient_id}`),
          apiClient.get('/appointments'),
        ]);
        if (cancelled) return;
        setLabs(labRes.data.lab_orders || []);
        setImaging(imgRes.data.imaging_orders || []);
        setMeds(medRes.data.medications || []);
        setAppointments(apptRes.data.appointments || []);
      } catch {
        if (!cancelled) setError('We could not load your records right now. Please try again shortly.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const renderLabs = () => {
    if (!labs.length) return <EmptyState text="No lab results yet. Results appear here once your provider releases them." />;
    return (
      <div className="space-y-3">
        {labs.map((o) => (
          <div key={o.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-900">{o.test_name}</p>
                <p className="text-sm text-gray-500">Ordered {fmtDate(o.ordered_at)}</p>
              </div>
              <StatusPill status={o.verification_status === 'verified' ? 'Verified' : o.status} />
            </div>
            {o.results ? (
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{o.results}</p>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Result pending — your provider will discuss it with you.</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderImaging = () => {
    if (!imaging.length) return <EmptyState text="No imaging reports yet." />;
    return (
      <div className="space-y-3">
        {imaging.map((o) => (
          <div key={o.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-900">
                  {o.imaging_type}{o.body_part ? ` — ${o.body_part}` : ''}
                </p>
                <p className="text-sm text-gray-500">Ordered {fmtDate(o.ordered_date)}</p>
              </div>
              <StatusPill status={o.status} />
            </div>
            {o.findings ? (
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{o.findings}</p>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Report pending.</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderMeds = () => {
    if (!meds.length) return <EmptyState text="No medications on record." />;
    return (
      <div className="space-y-3">
        {meds.map((m) => (
          <div key={m.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-900">{m.medication_name}</p>
                <p className="text-sm text-gray-600">
                  {[m.dosage, m.frequency].filter(Boolean).join(' · ')}
                </p>
                {m.prescribing_doctor_name && (
                  <p className="text-sm text-gray-500">Prescribed by {m.prescribing_doctor_name}</p>
                )}
              </div>
              <StatusPill status={m.status} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAppointments = () => {
    if (!appointments.length) return <EmptyState text="No appointments scheduled." />;
    return (
      <div className="space-y-3">
        {appointments.map((a) => (
          <div key={a.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-900">{fmtDate(a.appointment_date)}</p>
                {a.reason && <p className="text-sm text-gray-600">{a.reason}</p>}
                {a.provider_name && <p className="text-sm text-gray-500">With {a.provider_name}</p>}
              </div>
              <StatusPill status={a.status} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout title="Patient Portal">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {firstName ? `Welcome, ${firstName}` : 'Your health records'}
          </h2>
          <p className="text-gray-500">View your lab results, imaging reports, medications and appointments.</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow border border-gray-200">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${
                  activeTab === t.key
                    ? 'text-primary-700 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {loading || patientId === null ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : (
              <>
                {activeTab === 'labs' && renderLabs()}
                {activeTab === 'imaging' && renderImaging()}
                {activeTab === 'medications' && renderMeds()}
                {activeTab === 'appointments' && renderAppointments()}
              </>
            )}
          </div>
        </div>

        <footer className="mt-10 py-6 text-center text-gray-500 text-sm">
          <p>For medical emergencies, please call your local emergency number or visit the nearest emergency room.</p>
          {branding.clinicPhone && <p className="mt-2">Need help? Contact us at {branding.clinicPhone}</p>}
        </footer>
      </div>
    </AppLayout>
  );
};

export default PatientPortal;
