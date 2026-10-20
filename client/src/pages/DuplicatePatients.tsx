import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useAuth } from '../context/AuthContext';

interface Side { id: number; patient_number: string; source: string; name: string; dob: string | null; phone: string | null; encounters: number; }
interface Candidate { name: string; dob: string | null; reasons: string[]; confidence: 'strong' | 'review'; survivor: Side; duplicate: Side; }

const pairKey = (c: Candidate) => [c.survivor.id, c.duplicate.id].sort((a, b) => a - b).join('-');

export default function DuplicatePatients() {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin === true;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<number | null>(null);
  // Pairs where the reviewer chose to keep the other record instead.
  const [swapped, setSwapped] = useState<Set<string>>(new Set());
  const oriented = (c: Candidate): Candidate =>
    swapped.has(pairKey(c)) ? { ...c, survivor: c.duplicate, duplicate: c.survivor } : c;
  const toggleSwap = (c: Candidate) => setSwapped(prev => {
    const next = new Set(prev);
    const k = pairKey(c);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

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
      message: `Merge ${c.duplicate.patient_number} (${c.duplicate.name}) INTO ${c.survivor.patient_number} (${c.survivor.name})?\n\nAll of ${c.duplicate.patient_number}'s records move to ${c.survivor.patient_number}, and the duplicate is archived. This is logged and reversible.`,
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
            Records where at least two of name, phone and date of birth match (spelling, spacing and name order are
            ignored). <strong>Strong</strong> pairs match on name and date of birth. <strong>Review</strong> pairs need a
            closer look — the same phone and birthday with different names can be twins, and the same name and phone
            with different birthdays can be a parent and child. The kept record receives all of the other's visits and
            records; use <em>Swap</em> to keep the other one.
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
              <p className="text-sm">No records share two of name, phone and date of birth.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keep (survivor)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merge & archive</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {candidates.map(oriented).map((c) => (
                  <tr key={pairKey(c)} className="hover:bg-gray-50 align-top">
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        c.confidence === 'strong' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.confidence === 'strong' ? 'Strong' : 'Review'}
                      </span>
                      <div className="text-xs text-gray-500 mt-1">{c.reasons.join(' · ')}</div>
                    </td>
                    {[c.survivor, c.duplicate].map((side) => (
                      <td key={side.id} className="px-6 py-3 text-sm">
                        <div className="font-medium text-gray-900">{side.name}</div>
                        <div className="text-xs text-gray-600">{side.patient_number} · {side.source}</div>
                        <div className="text-xs text-gray-500">
                          DOB {side.dob && side.dob > '1901-01-01' ? side.dob : '—'} · {side.phone || 'no phone'}
                        </div>
                        <div className="text-xs text-gray-500">{side.encounters} encounters</div>
                      </td>
                    ))}
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => toggleSwap(c)}
                        className="mr-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        title="Keep the other record instead"
                      >
                        Swap
                      </button>
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
