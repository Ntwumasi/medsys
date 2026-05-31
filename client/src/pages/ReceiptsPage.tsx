import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import AppSelect from '../components/ui/AppSelect';

interface Receipt {
  id: number;
  invoice_id: number;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  invoice_number: string;
  total_amount: string;
  amount_paid: string;
  invoice_status: string;
  patient_number: string;
  patient_name: string;
  received_by: string | null;
}

interface ReceiptDetail extends Receipt {
  patient_email: string | null;
  patient_phone: string | null;
  invoice_date: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

interface Stats {
  total_receipts: string;
  total_collected: string;
  collected_today: string;
  collected_week: string;
  collected_month: string;
  cash_count: string;
  cash_total: string;
  card_count: string;
  card_total: string;
  momo_count: string;
  momo_total: string;
}

const ReceiptsPage: React.FC = () => {
  const { showToast } = useNotification();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [stats, setStats] = useState<Stats | null>(null);

  // Receipt detail modal
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDetail | null>(null);
  const [receiptItems, setReceiptItems] = useState<InvoiceItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const getDateRange = () => {
    const now = new Date();
    let start_date = '';
    const end_date = now.toISOString().split('T')[0];

    if (timePeriod === 'today') {
      start_date = end_date;
    } else if (timePeriod === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      start_date = weekAgo.toISOString().split('T')[0];
    } else if (timePeriod === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      start_date = monthAgo.toISOString().split('T')[0];
    }

    return { start_date, end_date };
  };

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const { start_date, end_date } = getDateRange();
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (methodFilter !== 'all') params.append('payment_method', methodFilter);
      if (start_date) params.append('start_date', start_date);
      if (end_date) params.append('end_date', end_date);

      const response = await apiClient.get(`/receipts?${params.toString()}`);
      setReceipts(response.data.receipts || []);
      setStats(response.data.stats || null);
    } catch (error) {
      console.error('Error fetching receipts:', error);
      showToast('Failed to load receipts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [timePeriod, methodFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchReceipts(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const viewReceipt = async (receiptId: number) => {
    try {
      const response = await apiClient.get(`/receipts/${receiptId}`);
      setSelectedReceipt(response.data.receipt);
      setReceiptItems(response.data.invoice_items || []);
      setShowDetail(true);
    } catch (error) {
      console.error('Error loading receipt:', error);
      showToast('Failed to load receipt', 'error');
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) { showToast('Please allow popups to print', 'error'); return; }

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Receipt</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; padding: 20px; }
        .text-3xl { font-size: 24px; } .text-2xl { font-size: 20px; } .text-lg { font-size: 16px; }
        .text-sm { font-size: 11px; } .text-xs { font-size: 10px; }
        .font-bold { font-weight: 700; } .font-semibold { font-weight: 600; }
        .text-primary-600 { color: #0d9488; } .text-gray-900 { color: #111827; }
        .text-gray-600 { color: #4b5563; } .text-gray-500 { color: #6b7280; }
        .text-success-600 { color: #059669; }
        .bg-gray-50 { background: #f9fafb; } .bg-success-50 { background: #ecfdf5; }
        .border-primary-600 { border-color: #0d9488; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: left; }
        th { background: #f3f4f6; border-bottom: 2px solid #d1d5db; font-weight: 600; }
        .border-t { border-top: 1px solid #e5e7eb; }
        .border-b-2 { border-bottom: 2px solid; }
        .mt-4 { margin-top: 16px; } .mb-4 { margin-bottom: 16px; } .mb-6 { margin-bottom: 24px; }
        .p-4 { padding: 16px; } .px-4 { padding: 0 16px; } .py-2 { padding: 8px 0; }
        .rounded { border-radius: 4px; }
        .flex { display: flex; } .justify-between { justify-content: space-between; }
        .text-right { text-align: right; } .text-center { text-align: center; }
        @media print { body { padding: 0; } @page { margin: 10mm; } }
      </style></head><body>${printContent}
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}};</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const formatMethod = (method: string) => {
    const map: Record<string, string> = {
      cash: 'Cash', card: 'Card', mobile_money: 'Mobile Money',
      rpay: 'Rpay', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
    };
    return map[method] || method;
  };

  const methodBadgeColor = (method: string) => {
    const map: Record<string, string> = {
      cash: 'bg-green-100 text-green-800',
      card: 'bg-blue-100 text-blue-800',
      mobile_money: 'bg-yellow-100 text-yellow-800',
      rpay: 'bg-purple-100 text-purple-800',
      bank_transfer: 'bg-indigo-100 text-indigo-800',
      cheque: 'bg-gray-100 text-gray-800',
    };
    return map[method] || 'bg-gray-100 text-gray-800';
  };

  const safeDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
  };

  return (
    <AppLayout title="Receipts">
      <div className="space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Today</p>
              <p className="text-2xl font-bold text-gray-900">GHS {parseFloat(stats.collected_today).toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">This Week</p>
              <p className="text-2xl font-bold text-gray-900">GHS {parseFloat(stats.collected_week).toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">This Month</p>
              <p className="text-2xl font-bold text-gray-900">GHS {parseFloat(stats.collected_month).toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Cash: {stats.cash_count}</span>
                <span>Card: {stats.card_count}</span>
                <span>MoMo: {stats.momo_count}</span>
              </div>
              <p className="text-sm font-semibold text-gray-700">
                GHS {parseFloat(stats.cash_total).toFixed(0)} / {parseFloat(stats.card_total).toFixed(0)} / {parseFloat(stats.momo_total).toFixed(0)}
              </p>
            </div>
          </div>
        )}

        {/* Receipts Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Payment Receipts</h2>
            <p className="text-sm text-gray-500">Record of all payments received</p>
          </div>

          {/* Filters */}
          <div className="px-6 py-3 bg-gray-50 border-b flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by patient name, number, or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
            <AppSelect
              value={methodFilter}
              onChange={(val) => setMethodFilter(val)}
              options={[{value:'all',label:'All Methods'},{value:'cash',label:'Cash'},{value:'card',label:'Card'},{value:'mobile_money',label:'Mobile Money'},{value:'rpay',label:'Rpay'},{value:'bank_transfer',label:'Bank Transfer'},{value:'cheque',label:'Cheque'}]}
            />
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['today', 'week', 'month', 'all'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setTimePeriod(period)}
                  className={`px-3 py-2 text-sm font-medium ${
                    timePeriod === period
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {period === 'all' ? 'All Time' : period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Receipt #</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Received By</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-mono text-gray-600">RCP{String(receipt.id).padStart(6, '0')}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{safeDate(receipt.payment_date)}</td>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-gray-900">{receipt.patient_name}</div>
                        <div className="text-xs text-gray-500">{receipt.patient_number}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{receipt.invoice_number}</td>
                      <td className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">
                        GHS {parseFloat(receipt.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${methodBadgeColor(receipt.payment_method)}`}>
                          {formatMethod(receipt.payment_method)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{receipt.received_by || '—'}</td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => viewReceipt(receipt.id)}
                          className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {receipts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                        No receipts found for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Detail / Print Modal */}
      {showDetail && selectedReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 relative" onClick={(e) => e.stopPropagation()}>
            {/* Actions bar */}
            <div className="bg-gray-100 px-6 py-4 border-b rounded-t-lg flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Receipt Details</h2>
              <div className="flex gap-2">
                <button onClick={handlePrint} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button onClick={() => setShowDetail(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm">
                  Close
                </button>
              </div>
            </div>

            {/* Printable content */}
            <div ref={printRef} className="p-8">
              {/* Header */}
              <div className="border-b-2 border-primary-600 pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-bold text-primary-600">MedSys EMR</h1>
                    <p className="text-gray-600 mt-1">Electronic Medical Records System</p>
                    <p className="text-sm text-gray-500">123 Healthcare Avenue, Accra, Ghana</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold text-gray-900">RECEIPT</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold">Receipt #:</span> RCP{String(selectedReceipt.id).padStart(6, '0')}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Date:</span> {safeDate(selectedReceipt.payment_date)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Invoice:</span> {selectedReceipt.invoice_number}
                    </p>
                  </div>
                </div>
              </div>

              {/* Patient Info */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Received From:</h3>
                <div className="bg-gray-50 p-4 rounded">
                  <p className="font-bold text-gray-900">{selectedReceipt.patient_name}</p>
                  <p className="text-sm text-gray-600">Patient #: {selectedReceipt.patient_number}</p>
                  {selectedReceipt.patient_phone && <p className="text-sm text-gray-600">Tel: {selectedReceipt.patient_phone}</p>}
                </div>
              </div>

              {/* Services rendered */}
              {receiptItems.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Services:</h3>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">Description</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-gray-600">Qty</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptItems.map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2 px-3 text-sm text-gray-700">{item.description}</td>
                          <td className="py-2 px-3 text-sm text-center text-gray-600">{item.quantity}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-700">GHS {parseFloat(item.total_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment details */}
              <div className="bg-success-50 border border-green-200 rounded-lg p-5 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-gray-700 font-medium">Invoice Total:</span>
                  <span className="font-semibold">GHS {parseFloat(selectedReceipt.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-3 border-t border-green-200 pt-3">
                  <span className="text-gray-700 font-medium">Amount Paid (this receipt):</span>
                  <span className="text-2xl font-bold text-success-600">GHS {parseFloat(selectedReceipt.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="font-semibold capitalize">{formatMethod(selectedReceipt.payment_method)}</span>
                </div>
                {selectedReceipt.received_by && (
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-600">Received By:</span>
                    <span className="font-medium">{selectedReceipt.received_by}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t-2 border-gray-300 pt-4 text-center text-sm text-gray-600">
                <p className="font-semibold mb-1">Thank you for your payment!</p>
                <p className="text-xs">This is a computer-generated receipt and does not require a signature.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default ReceiptsPage;
