import React, { useRef, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import type { ApiError } from '../types';

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PayerSource {
  id: number;
  payer_type: string;
  corporate_client_name?: string;
  insurance_provider_name?: string;
  is_primary: boolean;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  patient_address?: string;
  patient_city?: string;
  patient_state?: string;
  subtotal: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  chief_complaint?: string;
  encounter_date?: string;
}

interface PrintableInvoiceProps {
  invoice: Invoice;
  items: InvoiceItem[];
  payerSources: PayerSource[];
  encounterId?: number;
  onClose: () => void;
  onPaymentComplete?: () => void;
}

const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({
  invoice,
  items,
  payerSources,
  encounterId,
  onClose,
  onPaymentComplete,
}) => {
  const { showToast } = useNotification();
  const printRef = useRef<HTMLDivElement>(null);

  // Calculate balance due
  const balanceDue = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState<string>(balanceDue.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [isProcessing, setIsProcessing] = useState(false);

  const isSelfPay = payerSources.length === 0 || payerSources.every(p => p.payer_type === 'self_pay');

  const handleMarkAsPaid = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    if (amount > balanceDue) {
      showToast(`Payment amount cannot exceed balance due (GHS ${balanceDue.toFixed(2)})`, 'error');
      return;
    }

    const isFullPayment = amount >= balanceDue;
    const confirmMessage = isFullPayment
      ? 'Record full payment and complete the encounter?'
      : `Record partial payment of GHS ${amount.toFixed(2)}? Balance will be GHS ${(balanceDue - amount).toFixed(2)}`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);
    try {
      // Calculate new amount_paid
      const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
      const newStatus = newAmountPaid >= Number(invoice.total_amount) ? 'paid' : 'partial';

      // Record payment
      await apiClient.put(`/invoices/${invoice.id}`, {
        status: newStatus,
        amount_paid: newAmountPaid,
        payment_method: paymentMethod,
      });

      // Complete the encounter only if fully paid
      if (isFullPayment && encounterId) {
        await apiClient.post('/workflow/release-room', {
          encounter_id: encounterId,
        });
        showToast('Payment recorded and encounter completed successfully!', 'success');
      } else {
        showToast(`Partial payment of GHS ${amount.toFixed(2)} recorded. Balance: GHS ${(balanceDue - amount).toFixed(2)}`, 'success');
      }

      onClose();
      if (onPaymentComplete) onPaymentComplete();
    } catch (error) {
      console.error('Error completing payment:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.error || apiError.message || 'Unknown error occurred';
      showToast(`Failed to complete payment: ${errorMessage}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeferPayment = async () => {
    if (!confirm('Defer this payment? The patient will be marked as "Miscellaneous - Pending" and can pay later.')) {
      return;
    }

    try {
      // Update invoice payer source to miscellaneous_pending
      await apiClient.post(`/invoices/${invoice.id}/defer-payment`, {
        encounter_id: encounterId,
      });

      showToast('Payment deferred. Patient moved to Miscellaneous Pending.', 'success');
      onClose();
      if (onPaymentComplete) onPaymentComplete();
    } catch (error) {
      console.error('Error deferring payment:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.error || apiError.message || 'Unknown error occurred';
      showToast(`Failed to defer payment: ${errorMessage}`, 'error');
    }
  };

  const handleSubmitToPayer = async () => {
    if (!confirm('Submit this invoice to the payer and complete the encounter?')) {
      return;
    }

    try {
      // Update invoice status to paid (invoice submitted to payer for processing)
      await apiClient.put(`/invoices/${invoice.id}`, {
        status: 'paid',
      });

      // Complete the encounter
      await apiClient.post('/workflow/release-room', {
        encounter_id: encounterId,
      });

      showToast('Invoice submitted to payer and encounter completed successfully!', 'success');
      onClose();
      if (onPaymentComplete) onPaymentComplete();
    } catch (error) {
      console.error('Error submitting to payer:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.error || apiError.message || 'Unknown error occurred';
      showToast(`Failed to submit to payer: ${errorMessage}`, 'error');
    }
  };

  const formatPayerSource = (payer: PayerSource) => {
    if (payer.payer_type === 'self_pay') {
      return 'Self Pay';
    } else if (payer.payer_type === 'corporate' && payer.corporate_client_name) {
      return `Corporate: ${payer.corporate_client_name}`;
    } else if (payer.payer_type === 'insurance' && payer.insurance_provider_name) {
      return `Insurance: ${payer.insurance_provider_name}`;
    }
    return payer.payer_type;
  };

  const balance = (invoice.total_amount - (invoice.amount_paid || 0)).toFixed(2);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-2 sm:my-8 relative max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Close button - always visible in top-right corner */}
        <button
          onClick={onClose}
          className="print:hidden absolute -top-3 -right-3 z-10 w-10 h-10 bg-danger-500 hover:bg-danger-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          title="Close (Press Escape)"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Non-printable header with action buttons - sticky on scroll */}
        <div className="print:hidden bg-gray-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 rounded-t-lg sticky top-0 z-10 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Invoice Preview</h2>
            <div className="flex gap-2 flex-wrap relative z-20">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span className="whitespace-nowrap">Print Invoice</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Payment Actions - Only show if encounterId is provided */}
          {encounterId && (
            <div className="pt-4 border-t border-gray-300">
              {isSelfPay ? (
                <div className="space-y-4">
                  {/* Balance Due Display */}
                  <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-primary-700">Balance Due:</span>
                    <span className="text-xl font-bold text-primary-700">GHS {balanceDue.toFixed(2)}</span>
                  </div>

                  {/* Payment Input Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (GHS)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={balanceDue}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Enter amount"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleMarkAsPaid}
                      disabled={isProcessing}
                      className="flex-1 px-6 py-3 bg-success-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Record Payment
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDeferPayment}
                      disabled={isProcessing}
                      className="flex-1 px-6 py-3 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Defer Payment
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSubmitToPayer}
                  className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center justify-center gap-2 shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Submit to {payerSources[0]?.payer_type === 'corporate' ? 'Corporate' : 'Insurance'} & Complete Encounter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Printable invoice content */}
        <div ref={printRef} id="printable-invoice" className="p-4 sm:p-8 print:p-12 overflow-y-auto flex-1">
          {/* Header */}
          <div className="border-b-2 border-primary-600 pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-primary-600">MedSys EMR</h1>
                <p className="text-gray-600 mt-2">Electronic Medical Records System</p>
                <p className="text-sm text-gray-500 mt-1">123 Healthcare Avenue</p>
                <p className="text-sm text-gray-500">Accra, Ghana</p>
                <p className="text-sm text-gray-500">Tel: +233 XX XXX XXXX</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-semibold">Invoice #:</span> {invoice.invoice_number}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Date:</span> {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Status:</span>{' '}
                  <span className={`px-2 py-1 rounded ${
                    invoice.status === 'paid' ? 'bg-success-100 text-green-800' :
                    invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {invoice.status.toUpperCase()}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Patient Information */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To:</h3>
              <div className="bg-gray-50 p-4 rounded">
                <p className="font-bold text-gray-900">{invoice.patient_name}</p>
                <p className="text-sm text-gray-600">Patient #: {invoice.patient_number}</p>
                {invoice.patient_address && (
                  <p className="text-sm text-gray-600 mt-2">{invoice.patient_address}</p>
                )}
                {(invoice.patient_city || invoice.patient_state) && (
                  <p className="text-sm text-gray-600">
                    {invoice.patient_city}{invoice.patient_city && invoice.patient_state && ', '}{invoice.patient_state}
                  </p>
                )}
                {invoice.patient_phone && (
                  <p className="text-sm text-gray-600 mt-1">Tel: {invoice.patient_phone}</p>
                )}
                {invoice.patient_email && (
                  <p className="text-sm text-gray-600">Email: {invoice.patient_email}</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Payment Method:</h3>
              <div className="bg-gray-50 p-4 rounded">
                {payerSources.length > 0 ? (
                  <ul className="space-y-1">
                    {payerSources.map((payer) => (
                      <li key={payer.id} className="text-sm text-gray-700">
                        <span className="font-medium">{formatPayerSource(payer)}</span>
                        {payer.is_primary && (
                          <span className="ml-2 text-xs bg-primary-100 text-primary-800 px-2 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">Self Pay</p>
                )}
                {invoice.chief_complaint && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Today's Visit:</p>
                    <p className="text-sm text-gray-700 mt-1">{invoice.chief_complaint}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Invoice Items Table */}
          <div className="mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Description</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Qty</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Unit Price</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-4 text-gray-700">{item.description}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.quantity}</td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      GHS {parseFloat(item.unit_price.toString()).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700 font-medium">
                      GHS {parseFloat(item.total_price.toString()).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 text-gray-700">
                <span>Subtotal:</span>
                <span className="font-medium">GHS {parseFloat(invoice.subtotal.toString()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 text-gray-700">
                <span>Tax:</span>
                <span className="font-medium">GHS {parseFloat(invoice.tax.toString()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 text-lg font-bold text-gray-900 border-t-2 border-gray-300">
                <span>Total:</span>
                <span>GHS {parseFloat(invoice.total_amount.toString()).toFixed(2)}</span>
              </div>
              {invoice.amount_paid > 0 && (
                <>
                  <div className="flex justify-between py-2 text-gray-700">
                    <span>Amount Paid:</span>
                    <span className="font-medium text-success-600">
                      -GHS {parseFloat(invoice.amount_paid.toString()).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 text-lg font-bold text-primary-600 border-t-2 border-gray-300">
                    <span>Balance Due:</span>
                    <span>GHS {balance}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-300 pt-6 text-center text-sm text-gray-600">
            <p className="font-semibold mb-2">Thank you for choosing MedSys EMR!</p>
            <p>For billing inquiries, please contact our billing department at billing@medsys.com</p>
            <p className="mt-2 text-xs">This is a computer-generated invoice and does not require a signature.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 10mm;
          }

          /* Hide EVERYTHING first */
          body * {
            visibility: hidden !important;
          }

          /* Show only the invoice and its contents */
          #printable-invoice,
          #printable-invoice * {
            visibility: visible !important;
          }

          /* Position invoice at top left */
          #printable-invoice {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 15px !important;
            background: white !important;
            font-size: 11px !important;
          }

          #printable-invoice h1 {
            font-size: 18px !important;
          }
          #printable-invoice h2 {
            font-size: 14px !important;
          }
          #printable-invoice h3 {
            font-size: 10px !important;
            margin-bottom: 4px !important;
          }
          #printable-invoice table {
            font-size: 10px !important;
          }
          #printable-invoice th,
          #printable-invoice td {
            padding: 3px 6px !important;
          }
          #printable-invoice .border-b-2 {
            padding-bottom: 6px !important;
            margin-bottom: 6px !important;
          }
          #printable-invoice .mb-8 {
            margin-bottom: 10px !important;
          }
          #printable-invoice .mb-6 {
            margin-bottom: 6px !important;
          }
          #printable-invoice .pb-6 {
            padding-bottom: 6px !important;
          }
          #printable-invoice .p-4 {
            padding: 6px !important;
          }
          #printable-invoice .pt-6 {
            padding-top: 6px !important;
          }
          #printable-invoice .gap-8 {
            gap: 10px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintableInvoice;
