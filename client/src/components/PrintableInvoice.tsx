import React, { useRef } from 'react';
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

  const handlePrint = () => {
    window.print();
  };

  const isSelfPay = payerSources.length === 0 || payerSources.every(p => p.payer_type === 'self_pay');

  const handleMarkAsPaid = async () => {
    if (!confirm('Mark this invoice as paid and complete the encounter?')) {
      return;
    }

    try {
      // Mark invoice as paid
      await apiClient.put(`/invoices/${invoice.id}`, {
        status: 'paid',
        amount_paid: invoice.total_amount,
      });

      // Complete the encounter
      await apiClient.post('/workflow/release-room', {
        encounter_id: encounterId,
      });

      showToast('Payment recorded and encounter completed successfully!', 'success');
      onClose();
      if (onPaymentComplete) onPaymentComplete();
    } catch (error) {
      console.error('Error completing payment:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.error || apiError.message || 'Unknown error occurred';
      showToast(`Failed to complete payment: ${errorMessage}`, 'error');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8 relative" onClick={(e) => e.stopPropagation()}>
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

        {/* Non-printable header with action buttons */}
        <div className="print:hidden bg-gray-100 px-6 py-4 border-b border-gray-200 rounded-t-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Invoice Preview</h2>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Invoice
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* Payment Actions - Only show if encounterId is provided */}
          {encounterId && (
            <div className="flex gap-3 pt-4 border-t border-gray-300">
              {isSelfPay ? (
                <button
                  onClick={handleMarkAsPaid}
                  className="flex-1 px-6 py-3 bg-success-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold flex items-center justify-center gap-2 shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Paid
                </button>
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
        <div ref={printRef} id="printable-invoice" className="p-8 print:p-12">
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
                      ${parseFloat(item.unit_price.toString()).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700 font-medium">
                      ${parseFloat(item.total_price.toString()).toFixed(2)}
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
                <span className="font-medium">${parseFloat(invoice.subtotal.toString()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 text-gray-700">
                <span>Tax:</span>
                <span className="font-medium">${parseFloat(invoice.tax.toString()).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 text-lg font-bold text-gray-900 border-t-2 border-gray-300">
                <span>Total:</span>
                <span>${parseFloat(invoice.total_amount.toString()).toFixed(2)}</span>
              </div>
              {invoice.amount_paid > 0 && (
                <>
                  <div className="flex justify-between py-2 text-gray-700">
                    <span>Amount Paid:</span>
                    <span className="font-medium text-success-600">
                      -${parseFloat(invoice.amount_paid.toString()).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 text-lg font-bold text-primary-600 border-t-2 border-gray-300">
                    <span>Balance Due:</span>
                    <span>${balance}</span>
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
          body * {
            visibility: hidden;
          }
          #printable-invoice,
          #printable-invoice * {
            visibility: visible;
          }
          #printable-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintableInvoice;
