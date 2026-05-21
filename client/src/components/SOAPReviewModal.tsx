import React, { useEffect, useState } from 'react';
import HPAccordion from './HPAccordion';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';

interface SOAPReviewModalProps {
  isOpen: boolean;
  encounterId: number;
  patientId: number;
  patientName: string;
  encounterNumber?: string;
  encounterDate?: string;
  chiefComplaint?: string;
  onClose: () => void;
  onSigned: () => void;
}

const SOAPReviewModal: React.FC<SOAPReviewModalProps> = ({
  isOpen,
  encounterId,
  patientId,
  patientName,
  encounterNumber,
  encounterDate,
  chiefComplaint,
  onClose,
  onSigned,
}) => {
  const { showToast } = useNotification();
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | undefined>(undefined);
  const [signedBy, setSignedBy] = useState<string | undefined>(undefined);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/hp/${encounterId}/status`);
        if (cancelled) return;
        setIsSigned(res.data.is_signed || false);
        setSignedAt(res.data.signed_at || undefined);
        setSignedBy(res.data.signed_by_name || undefined);
      } catch {
        if (cancelled) return;
        setIsSigned(false);
        setSignedAt(undefined);
        setSignedBy(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, encounterId]);

  const handleSign = async () => {
    if (isSigned || signing) return;
    setSigning(true);
    try {
      await apiClient.post(`/hp/${encounterId}/sign`);
      setIsSigned(true);
      setSignedAt(new Date().toLocaleString());
      showToast(`SOAP note signed for ${patientName}`, 'success');
      onSigned();
      onClose();
    } catch {
      showToast('Failed to sign SOAP note', 'error');
    } finally {
      setSigning(false);
    }
  };

  if (!isOpen) return null;

  const headerSubtitle = [
    encounterNumber,
    encounterDate ? new Date(encounterDate).toLocaleDateString() : null,
    chiefComplaint,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="soap-review-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div className="min-w-0">
            <h2 id="soap-review-title" className="text-lg font-bold text-gray-900 truncate">
              Review &amp; Sign SOAP Note — {patientName}
            </h2>
            {headerSubtitle && (
              <p className="text-sm text-gray-500 truncate mt-0.5">{headerSubtitle}</p>
            )}
            <p className="text-xs text-warning-700 mt-2">
              Edit any section if needed, then click <span className="font-semibold">Sign Note</span>{' '}
              at the bottom. Once signed it cannot be edited.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* SOAP body */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
          <HPAccordion
            encounterId={encounterId}
            patientId={patientId}
            userRole="doctor"
            onSign={handleSign}
            isSigned={isSigned}
            signedAt={signedAt}
            signedBy={signedBy}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-white">
          <button
            onClick={onClose}
            disabled={signing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            {isSigned ? 'Close' : 'Cancel'}
          </button>
          {!isSigned && (
            <button
              onClick={handleSign}
              disabled={signing}
              className="px-5 py-2 text-sm font-semibold text-white bg-success-600 rounded-lg hover:bg-success-700 disabled:opacity-60 shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {signing ? 'Signing…' : 'Sign Note'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SOAPReviewModal;
