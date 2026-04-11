import React, { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import type { ApiError } from '../types';

export type DocumentType = 'lab_result' | 'imaging' | 'referral' | 'other';

interface PatientDocument {
  id: number;
  patient_id: number;
  encounter_id: number | null;
  document_type: DocumentType;
  document_name: string;
  file_type: string;
  file_size: number;
  description?: string | null;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  is_confidential?: boolean;
  created_at: string;
}

interface Props {
  patientId: number;
  encounterId?: number | null;
}

const CATEGORIES: { value: DocumentType; label: string; iconPath: string }[] = [
  {
    value: 'lab_result',
    label: 'Lab Results',
    iconPath:
      'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  },
  {
    value: 'imaging',
    label: 'Imaging Reports',
    iconPath:
      'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  },
  {
    value: 'referral',
    label: 'Referral Letters',
    iconPath:
      'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    value: 'other',
    label: 'Other Documents',
    iconPath:
      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
];

const ALLOWED_MIME_PREFIXES = ['application/pdf', 'image/'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const PatientDocumentsPanel: React.FC<Props> = ({ patientId, encounterId }) => {
  const { showToast } = useNotification();
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<DocumentType>('lab_result');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/documents/patient/${patientId}`);
      setDocuments(res.data.documents || []);
    } catch (err) {
      const apiError = err as ApiError;
      console.error('Failed to load documents:', apiError);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    for (const file of list) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        showToast(`${file.name} exceeds 10MB limit`, 'error');
        continue;
      }
      if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
        showToast(`${file.name} is not a PDF or image`, 'error');
        continue;
      }

      setUploading(true);
      try {
        const dataUrl = await fileToBase64(file);
        await apiClient.post('/documents', {
          patient_id: patientId,
          encounter_id: encounterId ?? null,
          document_type: pendingCategory,
          document_name: file.name,
          file_type: file.type,
          file_data: dataUrl,
        });
        showToast(
          `${file.name} uploaded to ${
            CATEGORIES.find((c) => c.value === pendingCategory)?.label
          }`,
          'success'
        );
      } catch (err) {
        const apiError = err as ApiError;
        const msg =
          apiError.response?.data?.error ||
          apiError.message ||
          'Failed to upload document';
        showToast(`${file.name}: ${msg}`, 'error');
      } finally {
        setUploading(false);
      }
    }

    await loadDocuments();
  };

  const handleDownload = async (doc: PatientDocument) => {
    try {
      const res = await apiClient.get(`/documents/${doc.id}`);
      const fileData: string | undefined = res.data?.document?.file_data;
      if (!fileData) {
        showToast('No file data available', 'error');
        return;
      }
      // file_data is a data URL — open in a new tab.
      const win = window.open();
      if (win) {
        win.document.write(
          `<title>${doc.document_name}</title>` +
            (doc.file_type.startsWith('image/')
              ? `<img src="${fileData}" style="max-width:100%;height:auto;" />`
              : `<iframe src="${fileData}" style="border:0;width:100vw;height:100vh;"></iframe>`)
        );
      }
    } catch (err) {
      const apiError = err as ApiError;
      const msg =
        apiError.response?.data?.error ||
        apiError.message ||
        'Failed to download document';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (doc: PatientDocument) => {
    if (!window.confirm(`Delete "${doc.document_name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.delete(`/documents/${doc.id}`);
      showToast('Document deleted', 'success');
      await loadDocuments();
    } catch (err) {
      const apiError = err as ApiError;
      const msg =
        apiError.response?.data?.error ||
        apiError.message ||
        'Failed to delete document';
      showToast(msg, 'error');
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    docs: documents.filter((d) => d.document_type === cat.value),
  }));

  return (
    <div className="space-y-4">
      <div className="bg-warning-50 border border-warning-200 rounded-lg p-6">
        <h3 className="text-lg font-bold text-warning-800 mb-4 flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Scanned Documents
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Upload and manage scanned documents for this patient. Pick a category
          first, then drop or select files — they'll appear under the matching
          section below.
        </p>

        {/* Category selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {CATEGORIES.map((cat) => {
            const active = pendingCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setPendingCategory(cat.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-warning-600 text-white border-warning-600'
                    : 'bg-white text-warning-700 border-warning-300 hover:bg-warning-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={cat.iconPath}
                  />
                </svg>
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Upload area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center bg-white mb-4 transition-colors ${
            dragActive ? 'border-warning-500 bg-warning-100' : 'border-warning-300'
          }`}
        >
          <svg
            className="w-12 h-12 mx-auto text-warning-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-warning-700 font-semibold mb-1">
            Upload to: {CATEGORIES.find((c) => c.value === pendingCategory)?.label}
          </p>
          <p className="text-sm text-gray-500 mb-3">
            Drag and drop files here, or click to browse
          </p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors font-semibold disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Select Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                void handleFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <p className="text-xs text-gray-400 mt-2">PDF, JPG, PNG up to 10MB each</p>
        </div>

        {/* Per-category buckets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {grouped.map((cat) => (
            <div
              key={cat.value}
              className="bg-white border border-warning-200 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-warning-700 font-semibold">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={cat.iconPath}
                    />
                  </svg>
                  {cat.label}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 font-semibold">
                  {cat.docs.length}
                </span>
              </div>
              {cat.docs.length === 0 ? (
                <p className="text-sm text-gray-500">No documents uploaded</p>
              ) : (
                <ul className="space-y-1.5">
                  {cat.docs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-2 text-sm border border-gray-100 rounded px-2 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        className="flex-1 min-w-0 text-left hover:text-primary-600"
                        title={doc.document_name}
                      >
                        <div className="truncate font-medium">{doc.document_name}</div>
                        <div className="text-xs text-gray-500">
                          {formatBytes(doc.file_size)}
                          {doc.uploaded_by_name ? ` • ${doc.uploaded_by_name}` : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Delete"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {loading && (
          <p className="text-xs text-gray-500 mt-3 text-center">Loading documents…</p>
        )}
      </div>
    </div>
  );
};

export default PatientDocumentsPanel;
