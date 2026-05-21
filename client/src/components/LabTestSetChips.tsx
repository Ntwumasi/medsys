import React, { useEffect, useMemo, useRef, useState } from 'react';
import { labTestSetsAPI } from '../api/labTestSets';
import type { LabTestSet, LabTestSetItem } from '../api/labTestSets';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { useAuth } from '../context/AuthContext';

interface PendingLabOrder {
  test_name: string;
  priority: string;
}

interface Props {
  pendingLabOrders: PendingLabOrder[];
  onApplySet: (items: LabTestSetItem[]) => void;
}

const MAX_PINNED = 3;

const LabTestSetChips: React.FC<Props> = ({ pendingLabOrders, onApplySet }) => {
  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  const { user, impersonation } = useAuth();
  const isAdminLike =
    user?.role === 'admin' ||
    user?.is_super_admin === true ||
    impersonation.originalUser?.is_super_admin === true;

  const [sets, setSets] = useState<LabTestSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [moreSearch, setMoreSearch] = useState('');
  const [moreTab, setMoreTab] = useState<'all' | 'mine'>('all');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Save-as-set modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveIsShared, setSaveIsShared] = useState(true);
  const [savingSet, setSavingSet] = useState(false);

  const loadSets = async () => {
    setLoading(true);
    try {
      const list = await labTestSetsAPI.list();
      setSets(list);
    } catch {
      // Silently ignore — chips just won't appear. Don't block the lab card.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSets();
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!showMore) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showMore]);

  const pinned = useMemo(() => sets.slice(0, MAX_PINNED), [sets]);
  const filteredAll = useMemo(() => {
    const q = moreSearch.trim().toLowerCase();
    return sets.filter(s => {
      if (moreTab === 'mine' && !s.is_mine) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.items.some(it => it.test_name.toLowerCase().includes(q))
      );
    });
  }, [sets, moreSearch, moreTab]);

  const handleApply = async (set: LabTestSet) => {
    onApplySet(set.items);
    showToast(`Applied "${set.name}" (${set.items.length} tests)`, 'success');
    setShowMore(false);
    // Fire-and-forget usage tracking; refresh in background so ordering settles.
    labTestSetsAPI
      .apply(set.id)
      .then(() => loadSets())
      .catch(() => {});
  };

  const handleDelete = async (set: LabTestSet) => {
    const ok = await confirmDialog({
      title: 'Delete test set?',
      message: `Delete "${set.name}"? This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await labTestSetsAPI.delete(set.id);
      showToast(`Deleted "${set.name}"`, 'success');
      loadSets();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to delete test set', 'error');
    }
  };

  const openSaveModal = () => {
    setSaveName('');
    setSaveDescription('');
    setSaveIsShared(true);
    setShowSaveModal(true);
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      showToast('Give the set a name', 'warning');
      return;
    }
    if (pendingLabOrders.length === 0) {
      showToast('Add at least one lab test before saving', 'warning');
      return;
    }
    setSavingSet(true);
    try {
      await labTestSetsAPI.create({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        is_shared: saveIsShared,
        items: pendingLabOrders.map(o => ({
          test_name: o.test_name,
          default_priority: (o.priority as 'routine' | 'urgent' | 'stat') || 'routine',
        })),
      });
      showToast(`Saved "${saveName.trim()}" — ${pendingLabOrders.length} tests`, 'success');
      setShowSaveModal(false);
      loadSets();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to save set', 'error');
    } finally {
      setSavingSet(false);
    }
  };

  const canSave = pendingLabOrders.length >= 2;

  if (loading && sets.length === 0) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-primary-700">Test Sets</span>
        <div className="h-7 w-32 bg-primary-100 rounded-full animate-pulse" />
        <div className="h-7 w-24 bg-primary-100 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mb-3">
      {/* Chip row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-primary-800 uppercase tracking-wide mr-1">
          Test Sets
        </span>

        {pinned.length === 0 && (
          <span className="text-xs text-gray-500 italic">
            No saved sets yet — order labs and click <span className="font-medium">Save as set</span> to create one.
          </span>
        )}

        {pinned.map((set, idx) => (
          <button
            key={set.id}
            type="button"
            onClick={() => handleApply(set)}
            title={set.items.map(i => i.test_name).join(', ')}
            className={`group inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all shadow-sm border ${
              idx === 0
                ? 'bg-white border-primary-300 text-primary-800 hover:bg-primary-100 hover:border-primary-400'
                : 'bg-white border-primary-200 text-primary-700 hover:bg-primary-50 hover:border-primary-300'
            }`}
          >
            {idx === 0 && set.use_count > 0 && (
              <svg className="w-3.5 h-3.5 text-warning-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
            <span>{set.name}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold leading-none">
              {set.items.length}
            </span>
          </button>
        ))}

        {sets.length > MAX_PINNED && (
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm"
          >
            More sets ({sets.length - pinned.length})
            <svg className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {sets.length > 0 && sets.length <= MAX_PINNED && (
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            title="Browse, search and manage all sets"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Browse
          </button>
        )}

        {canSave && (
          <button
            type="button"
            onClick={openSaveModal}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border-2 border-dashed border-primary-400 bg-primary-50 text-primary-700 hover:bg-primary-100 hover:border-primary-500 transition-all"
            title={`Save current ${pendingLabOrders.length} tests as a reusable set`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save current as set
          </button>
        )}
      </div>

      {/* Browse popover */}
      {showMore && (
        <div
          ref={popoverRef}
          className="relative mt-2"
        >
          <div className="absolute left-0 right-0 z-40 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <input
                type="text"
                value={moreSearch}
                onChange={e => setMoreSearch(e.target.value)}
                placeholder="Search sets or test names…"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                autoFocus
              />
              <div className="flex bg-white border border-gray-300 rounded-lg overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setMoreTab('all')}
                  className={`px-3 py-1.5 font-medium ${
                    moreTab === 'all' ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setMoreTab('mine')}
                  className={`px-3 py-1.5 font-medium ${
                    moreTab === 'mine' ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Mine
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {filteredAll.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  {moreSearch ? 'No matches.' : 'No sets in this view yet.'}
                </div>
              ) : (
                filteredAll.map(set => (
                  <div
                    key={set.id}
                    className="px-4 py-3 hover:bg-primary-50/50 transition-colors flex items-start gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleApply(set)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 truncate">{set.name}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold leading-none">
                          {set.items.length} tests
                        </span>
                        {set.is_shared ? (
                          <span className="text-[10px] font-medium text-success-700 bg-success-50 border border-success-200 px-1.5 py-0.5 rounded">
                            Clinic
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                            Personal
                          </span>
                        )}
                        {set.is_mine && (
                          <span className="text-[10px] font-medium text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded">
                            Mine
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {set.items.map(i => i.test_name).join(' · ')}
                      </div>
                      {set.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{set.description}</div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1">
                        By {set.created_by_name}
                        {set.use_count > 0 && ` · Used ${set.use_count}×`}
                      </div>
                    </button>
                    {(set.is_mine || isAdminLike) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(set)}
                        className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors flex-shrink-0"
                        title="Delete set"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save-as-set modal */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !savingSet && setShowSaveModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Save as test set</h3>
              <p className="text-xs text-gray-500 mt-1">
                Saving {pendingLabOrders.length} tests as a reusable set.
                {' '}{saveIsShared
                  ? 'Every doctor in the clinic will see it.'
                  : 'Only you will see it.'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Set name <span className="text-danger-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g. BIGPAY Screening"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value)}
                  placeholder="e.g. Pre-employment medical exams for Olam"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  Tests in this set
                </div>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {pendingLabOrders.map((o, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <svg className="w-3.5 h-3.5 text-success-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="flex-1 text-gray-800">{o.test_name}</span>
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        {o.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveIsShared}
                  onChange={e => setSaveIsShared(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">Share with clinic</div>
                  <div className="text-xs text-gray-500">
                    All doctors can use this set. Recommended for corporate screening packages.
                  </div>
                </div>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                disabled={savingSet}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={savingSet || !saveName.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-60 shadow-sm"
              >
                {savingSet ? 'Saving…' : 'Save set'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabTestSetChips;
