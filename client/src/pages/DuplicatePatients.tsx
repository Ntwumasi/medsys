import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useAuth } from '../context/AuthContext';

interface Side { id: number; patient_number: string; source: string; encounters: number; }
interface Candidate { name: string; dob: string; survivor: Side; duplicate: Side; }

export default function DuplicatePatients() {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin === true;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/patients/duplicates');
      setCandidates(res.data.candidates || []);
    } catch {
      showToast('Failed to load duplicate candidates', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const doMerge = async (c: Candidate) => {
    if (!(await confirm({
      title: 'Merge patient records?',
      message: `Merge ${c.duplicate.patient_number} (${c.duplicate.source}) INTO ${c.survivor.patient_number} (${c.survivor.source}) for ${c.name}?\n\nAll of ${c.duplicate.patient_number}'s records move to ${c.survivor.patient_number}, and the duplicate is archived. This is logged and reversible.`,
      confirmLabel: 'Merge',
      variant: 'warning',
    }))) return;
    setMerging(c.duplicate.id);
    try {
      const res = await apiClient.post('/patients/merge', { source_patient_id: c.duplicate.id, target_patient_id: c.survivor.id });
      const moved = Object.values(res.data.moved || {}).reduce((a: number, b: any) => a + Number(b), 0);
      showToast(`Merged into ${c.survivor.patient_number} (${moved} records moved)`, 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Merge failed', 'error');
    } finally {
      setMerging(null);
    }
  };

  return (
    <AppLayout title="Duplicate Patients">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Duplicate Patients</h1>
          <p className="text-sm text-gray-500 mt-1">
            Records that match on name + date of birth — usually a CareCode-imported record duplicating a native one.
            The native (MedSys) record is kept; the duplicate's data merges into it.
          </p>
        </div>

        {!isSuperAdmin && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            Only super admins can merge patient records. You can review the list below.
          </div>
        )}

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <p className="text-lg font-medium">No duplicate patients found</p>
              <p className="text-sm">Every record with a matching name + DOB has been resolved.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keep (survivor)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merge & archive</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {candidates.map((c) => (
                  <tr key={`${c.survivor.id}-${c.duplicate.id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      <div className="text-sm text-gray-500">DOB {c.dob}</div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <div className="font-medium text-gray-900">{c.survivor.patient_number}</div>
                      <div className="text-xs text-gray-500">{c.survivor.source} · {c.survivor.encounters} encounters</div>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <div className="font-medium text-gray-900">{c.duplicate.patient_number}</div>
                      <div className="text-xs text-gray-500">{c.duplicate.source} · {c.duplicate.encounters} encounters</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => doMerge(c)}
                        disabled={!isSuperAdmin || merging === c.duplicate.id}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {merging === c.duplicate.id ? 'Merging…' : 'Merge'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
