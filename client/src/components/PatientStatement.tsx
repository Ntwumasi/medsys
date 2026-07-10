import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { branding } from '../config/branding';
import { safeFormatDate } from '../utils/age';
import { useNotification } from '../context/NotificationContext';

interface StatementItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: string | number;
  total_price: string | number;
  category?: string;
}

interface StatementInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  status: string;
  total_amount: string | number;
  amount_paid: string | number;
  encounter_date?: string | null;
  chief_complaint?: string | null;
  items: StatementItem[];
}

interface StatementData {
  patient: {
    patient_number: string;
    patient_name: string;
    patient_email?: string | null;
    patient_phone?: string | null;
    patient_address?: string | null;
    patient_city?: string | null;
    patient_state?: string | null;
  };
  invoices: StatementInvoice[];
  grand_total: number;
  count: number;
}

interface PatientStatementProps {
  patientId: number;
  onClose: () => void;
}

const ghs = (n: string | number): string => `GHS ${Number(n || 0).toFixed(2)}`;
const balanceOf = (inv: StatementInvoice): number =>
  Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);

/**
 * Consolidated outstanding statement — every unpaid invoice for a patient in one
 * printable document with a single grand total, so reception doesn't open and
 * tally each invoice by hand. The underlying invoices are untouched; this is a
 * read-only view. Mirrors PrintableInvoice's window.open print approach.
 */
const PatientStatement: React.FC<PatientStatementProps> = ({ patientId, onClose }) => {
  const { showToast } = useNotification();
  const printRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/invoices/patient/${patientId}/statement`);
        if (active) setData(res.data);
      } catch {
        if (active) setError('Could not load the statement.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('Please allow popups to print the statement', 'error');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Statement — ${data?.patient.patient_name || ''}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; padding: 20px; }
            .text-2xl { font-size: 20px; }
            .text-lg { font-size: 16px; }
            .text-sm { font-size: 11px; }
            .text-xs { font-size: 10px; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .text-primary-600 { color: #0d9488; }
            .text-gray-900 { color: #111827; }
            .text-gray-700 { color: #374151; }
            .text-gray-600 { color: #4b5563; }
            .text-gray-500 { color: #6b7280; }
            .bg-gray-50 { background: #f9fafb; }
            .bg-gray-100 { background: #f3f4f6; }
            .rounded { border-radius: 4px; }
            .p-4 { padding: 12px; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-6 { margin-bottom: 16px; }
            .mb-8 { margin-bottom: 20px; }
            .pb-6 { padding-bottom: 16px; }
            .pt-3 { padding-top: 12px; }
            .border-b-2 { border-bottom: 2px solid; }
            .border-t-2 { border-top: 2px solid; }
            .border-primary-600 { border-color: #0d9488; }
            .border-gray-300 { border-color: #d1d5db; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .justify-end { justify-content: flex-end; }
            .items-start { align-items: flex-start; }
            .text-right { text-align: right; }
            .uppercase { text-transform: uppercase; }
            .w-72 { width: 260px; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            th, td { padding: 6px 10px; text-align: left; }
            th { background: #f3f4f6; border-bottom: 2px solid #d1d5db; font-weight: 600; }
            tr:nth-child(even) { background: #f9fafb; }
            .grp { margin-bottom: 14px; }
            .grp-head { font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
            @media print { body { padding: 0; } @page { margin: 10mm; } }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Toolbar (not printed) */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Outstanding Statement</h3>
          <div className="flex items-center gap-2">
            {data && data.count > 0 && (
              <button onClick={handlePrint} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                Print
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-gray-500 text-sm">Loading statement…</div>
          ) : error ? (
            <div className="py-16 text-center text-danger-600 text-sm">{error}</div>
          ) : data && data.count === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              {data.patient.patient_name} has no outstanding invoices.
            </div>
          ) : data ? (
            <div ref={printRef} className="p-6 sm:p-8">
              {/* Header */}
              <div className="border-b-2 border-primary-600 pb-6 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    {branding.clinicLogo ? (
                      <img src={branding.clinicLogo} alt={branding.clinicName} style={{ height: '64px', maxWidth: '220px', objectFit: 'contain' }} className="mb-2" />
                    ) : (
                      <h1 className="text-2xl font-bold text-primary-600 mb-2">{branding.clinicName}</h1>
                    )}
                    {branding.clinicAddress && <p className="text-sm text-gray-500 mt-2">{branding.clinicAddress}</p>}
                    {branding.clinicPhone && <p className="text-sm text-gray-500">Tel: {branding.clinicPhone}</p>}
                    {branding.clinicEmail && <p className="text-sm text-gray-500">{branding.clinicEmail}</p>}
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold text-gray-900">STATEMENT</h2>
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-semibold">Date:</span> {safeFormatDate(new Date().toISOString(), 'MMM dd, yyyy')}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Invoices:</span> {data.count} outstanding
                    </p>
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To:</h3>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="font-bold text-gray-900">{data.patient.patient_name}</p>
                  <p className="text-sm text-gray-600">Patient #: {data.patient.patient_number}</p>
                  {data.patient.patient_address && <p className="text-sm text-gray-600 mt-2">{data.patient.patient_address}</p>}
                  {(data.patient.patient_city || data.patient.patient_state) && (
                    <p className="text-sm text-gray-600">
                      {data.patient.patient_city}
                      {data.patient.patient_city && data.patient.patient_state && ', '}
                      {data.patient.patient_state}
                    </p>
                  )}
                  {data.patient.patient_phone && <p className="text-sm text-gray-600 mt-1">Tel: {data.patient.patient_phone}</p>}
                  {data.patient.patient_email && <p className="text-sm text-gray-600">Email: {data.patient.patient_email}</p>}
                </div>
              </div>

              {/* One group per outstanding invoice */}
              {data.invoices.map((inv) => (
                <div key={inv.id} className="grp mb-6">
                  <div className="grp-head flex justify-between text-sm">
                    <span>
                      {inv.invoice_number} · {safeFormatDate(inv.invoice_date, 'MMM dd, yyyy')}
                      {inv.chief_complaint ? ` · ${inv.chief_complaint}` : ''}
                    </span>
                    <span className="text-gray-500 uppercase text-xs">{inv.status}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-gray-500 text-sm">No line items.</td>
                        </tr>
                      ) : (
                        inv.items.map((it) => (
                          <tr key={it.id}>
                            <td>{it.description}</td>
                            <td className="text-right">{it.quantity}</td>
                            <td className="text-right">{ghs(it.unit_price)}</td>
                            <td className="text-right">{ghs(it.total_price)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <div className="flex justify-end mt-1">
                    <span className="text-sm text-gray-600">
                      {Number(inv.amount_paid) > 0 && <>Paid {ghs(inv.amount_paid)} · </>}
                      <span className="font-semibold text-gray-900">Balance {ghs(balanceOf(inv))}</span>
                    </span>
                  </div>
                </div>
              ))}

              {/* Grand total */}
              <div className="flex justify-end mt-2">
                <div className="w-72 border-t-2 border-gray-300 pt-3 flex justify-between">
                  <span className="font-bold text-gray-900 text-lg">Total Due</span>
                  <span className="font-bold text-primary-600 text-lg">{ghs(data.grand_total)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PatientStatement;
