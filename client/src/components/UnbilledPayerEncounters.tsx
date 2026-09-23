import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { safeFormatDate } from '../utils/age';

// Completed encounters billed to a corporate/insurance payer whose invoice
// hasn't been submitted to the payer yet. Lets staff catch encounters that were
// missed and submit them after the fact. Backed by GET /invoices/unbilled-payer
// and POST /invoices/:id/submit-to-payer (both open to admin/accountant/
// receptionist). Used on the accountant dashboard and the receptionist desk.

interface UnbilledInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_name: string;
  patient_number: string;
  total_amount: number | string;
  amount_paid: number | string;
  payer_type: string;
  corporate_client_name?: string;
  insurance_provider_name?: string;
}

const fmtGHS = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return 'GHS ' + (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const payerLabel = (inv: UnbilledInvoice): string =>
  inv.payer_type === 'insurance' ? (inv.insurance_provider_name || 'Insurance')
    : inv.payer_type === 'corporate' ? (inv.corporate_client_name || 'Corporate')
    : inv.payer_type;

const UnbilledPayerEncounters: React.FC = () => {
  const { showToast } = useNotification();
  const [invoices, setInvoices] = useState<UnbilledInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/invoices/unbilled-payer');
      setInvoices(res.data.invoices || []);
    } catch (err) {
      console.error('Error loading unbilled encounters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (invoiceId: number) => {
    setSubmittingId(invoiceId);
    try {
      const res = await apiClient.post(`/invoices/${invoiceId}/submit-to-payer`);
      showToast(res.data?.message || 'Invoice submitted to payer', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to submit to payer', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-gray-900">Awaiting Submission</h2>
          <p className="text-sm text-gray-600 mt-1">
            Visits for patients paid by a <span className="font-semibold">company (corporate)</span> or <span className="font-semibold">insurance</span> — not cash. The visit is billed, but the bill hasn't been sent to that company/insurer yet, so we can't be paid until it is. Click <span className="font-semibold">"Submit to payer"</span> to send it (for insurance it also opens a claim). An empty list means everything has been sent.
          </p>
        </div>
        <button onClick={load} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Refresh</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payer</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nothing awaiting submission — all corporate/insurance encounters have been submitted.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{safeFormatDate(inv.invoice_date, 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{inv.patient_name}</div>
                    <div className="text-xs text-gray-500">{inv.patient_number}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${inv.payer_type === 'insurance' ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inv.payer_type === 'insurance' ? 'Insurance' : 'Corporate'}
                    </span>
                    <span className="ml-2">{payerLabel(inv)}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600 font-medium">
                    {fmtGHS((parseFloat(inv.total_amount as string) || 0) - (parseFloat(inv.amount_paid as string) || 0))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => submit(inv.id)}
                      disabled={submittingId === inv.id}
                      className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50"
                    >
                      {submittingId === inv.id ? 'Submitting…' : 'Submit to payer'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnbilledPayerEncounters;
