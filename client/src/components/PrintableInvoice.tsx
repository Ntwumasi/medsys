import React, { useRef, useState } from 'react';
import { format } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import AppSelect from './ui/AppSelect';
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

interface CorporateClient {
  id: number;
  name: string;
}

interface InsuranceProvider {
  id: number;
  name: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_id?: number;
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
  invoice: initialInvoice,
  items: initialItems,
  payerSources,
  encounterId,
  onClose,
  onPaymentComplete,
}) => {
  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  const printRef = useRef<HTMLDivElement>(null);

  // Editable state for items and invoice totals
  const [editableItems, setEditableItems] = useState<InvoiceItem[]>(initialItems);
  const [invoice, setInvoice] = useState(initialInvoice);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [otherDescription, setOtherDescription] = useState('');
  const [otherPrice, setOtherPrice] = useState('');
  const [isAddingOther, setIsAddingOther] = useState(false);

  const isEditable = !!encounterId;
  const items = editableItems;

  // Payer editing state
  const [editingPayer, setEditingPayer] = useState(false);
  const [editPayerType, setEditPayerType] = useState(() => {
    const primary = payerSources.find(p => p.is_primary) || payerSources[0];
    return primary?.payer_type || 'self_pay';
  });
  const [editPayerId, setEditPayerId] = useState<number | null>(() => {
    const primary = payerSources.find(p => p.is_primary) || payerSources[0];
    if (!primary) return null;
    return (primary as any).corporate_client_id || (primary as any).insurance_provider_id || null;
  });
  const [currentPayerSources, setCurrentPayerSources] = useState(payerSources);
  const [ccOptions, setCcOptions] = useState<CorporateClient[]>([]);
  const [ipOptions, setIpOptions] = useState<InsuranceProvider[]>([]);
  const [savingPayer, setSavingPayer] = useState(false);

  // Calculate balance due
  const balanceDue = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);

  // Handle inline price edit
  const handlePriceEdit = (item: InvoiceItem) => {
    setEditingItemId(item.id);
    setEditingPrice(parseFloat(item.unit_price.toString()).toFixed(2));
  };

  const handlePriceSave = async (itemId: number) => {
    const newPrice = parseFloat(editingPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }

    try {
      const response = await apiClient.put(`/invoice-items/${itemId}`, { unit_price: newPrice });
      const newTotal = response.data.new_total;

      // Update local state
      setEditableItems(prev => prev.map(item =>
        item.id === itemId
          ? { ...item, unit_price: newPrice, total_price: newPrice * item.quantity }
          : item
      ));
      setInvoice(prev => ({ ...prev, total_amount: newTotal, subtotal: newTotal }));
      setEditingItemId(null);
    } catch (error) {
      console.error('Error updating price:', error);
      showToast('Failed to update price', 'error');
    }
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent, itemId: number) => {
    if (e.key === 'Enter') handlePriceSave(itemId);
    if (e.key === 'Escape') setEditingItemId(null);
  };

  // Handle adding custom "Other" charge
  const handleAddOther = async () => {
    if (!otherDescription.trim()) {
      showToast('Please enter a description', 'error');
      return;
    }

    const price = parseFloat(otherPrice) || 0;

    try {
      const response = await apiClient.post('/invoice-items', {
        invoice_id: invoice.id,
        description: otherDescription.trim(),
        unit_price: price,
        quantity: 1,
      });

      const newItem = response.data.item;
      const newTotal = response.data.new_total;

      setEditableItems(prev => [...prev, newItem]);
      setInvoice(prev => ({ ...prev, total_amount: newTotal, subtotal: newTotal }));
      setOtherDescription('');
      setOtherPrice('');
      setIsAddingOther(false);
      showToast('Charge added', 'success');
    } catch (error) {
      console.error('Error adding charge:', error);
      showToast('Failed to add charge', 'error');
    }
  };

  // Handle removing an item
  const handleRemoveItem = async (itemId: number) => {
    try {
      const response = await apiClient.delete(`/invoice-items/${itemId}`);
      const newTotal = response.data.new_total;

      setEditableItems(prev => prev.filter(item => item.id !== itemId));
      setInvoice(prev => ({ ...prev, total_amount: newTotal, subtotal: newTotal }));
      showToast('Item removed', 'success');
    } catch (error) {
      console.error('Error removing item:', error);
      showToast('Failed to remove item', 'error');
    }
  };

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState<string>(balanceDue.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [isProcessing, setIsProcessing] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Post-payment summary state
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [paymentSummaryData, setPaymentSummaryData] = useState<{
    amountReceived: number;
    amountApplied: number;
    changeDue: number;
    remainingBalance: number;
    paymentMethodUsed: string;
    isFullPayment: boolean;
  } | null>(null);

  const handlePrint = () => {
    if (!printRef.current) return;

    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (!printWindow) {
      showToast('Please allow popups to print the invoice', 'error');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; padding: 20px; }
            .text-3xl { font-size: 24px; }
            .text-2xl { font-size: 20px; }
            .text-lg { font-size: 16px; }
            .text-sm { font-size: 11px; }
            .text-xs { font-size: 10px; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .font-medium { font-weight: 500; }
            .text-primary-600 { color: #0d9488; }
            .text-gray-900 { color: #111827; }
            .text-gray-700 { color: #374151; }
            .text-gray-600 { color: #4b5563; }
            .text-gray-500 { color: #6b7280; }
            .text-success-600 { color: #059669; }
            .text-green-800 { color: #166534; }
            .text-yellow-800 { color: #854d0e; }
            .bg-gray-50 { background: #f9fafb; }
            .bg-gray-100 { background: #f3f4f6; }
            .bg-success-100 { background: #d1fae5; }
            .bg-yellow-100 { background: #fef3c7; }
            .bg-primary-100 { background: #ccfbf1; }
            .text-primary-800 { color: #115e59; }
            .border-primary-600 { border-color: #0d9488; }
            .border-gray-300 { border-color: #d1d5db; }
            .border-gray-200 { border-color: #e5e7eb; }
            .rounded { border-radius: 4px; }
            .rounded-lg { border-radius: 8px; }
            .p-4 { padding: 12px; }
            .px-2 { padding-left: 8px; padding-right: 8px; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .py-3 { padding-top: 12px; padding-bottom: 12px; }
            .px-4 { padding-left: 16px; padding-right: 16px; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
            .mt-3 { margin-top: 12px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-6 { margin-bottom: 16px; }
            .mb-8 { margin-bottom: 20px; }
            .ml-2 { margin-left: 8px; }
            .pt-3 { padding-top: 12px; }
            .pt-6 { padding-top: 16px; }
            .pb-6 { padding-bottom: 16px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .border-b-2 { border-bottom: 2px solid; }
            .border-t-2 { border-top: 2px solid; }
            .border-t { border-top: 1px solid #e5e7eb; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .justify-end { justify-content: flex-end; }
            .items-start { align-items: flex-start; }
            .items-center { align-items: center; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .uppercase { text-transform: uppercase; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
            .gap-8 { gap: 20px; }
            .w-full { width: 100%; }
            .w-64 { width: 200px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px 12px; text-align: left; }
            th { background: #f3f4f6; border-bottom: 2px solid #d1d5db; font-weight: 600; }
            tr:nth-child(even) { background: #f9fafb; }
            .text-center { text-align: center; }
            .print-hidden { display: none !important; }
            .print-no-border { border: none !important; padding: 0 !important; background: none !important; cursor: default !important; }
            @media print {
              body { padding: 0; }
              @page { margin: 10mm; }
              .print-hidden { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isSelfPay = payerSources.length === 0 || payerSources.every(p => p.payer_type === 'self_pay');

  const handleMarkAsPaid = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    // For non-cash payments, amount cannot exceed balance due
    if (paymentMethod !== 'cash' && amount > balanceDue) {
      showToast(`Payment amount cannot exceed balance due (GHS ${balanceDue.toFixed(2)})`, 'error');
      return;
    }

    // Show styled confirmation modal instead of native confirm()
    setShowConfirmModal(true);
  };

  const handleConfirmPayment = async () => {
    setShowConfirmModal(false);
    setIsProcessing(true);

    const amountReceived = parseFloat(paymentAmount);
    // For cash, only apply up to balanceDue (excess is change to return)
    const amountToApply = Math.min(amountReceived, balanceDue);
    const changeDue = paymentMethod === 'cash' ? Math.max(0, amountReceived - balanceDue) : 0;
    const isFullPayment = amountToApply >= balanceDue;

    try {
      const newAmountPaid = Number(invoice.amount_paid || 0) + amountToApply;
      const newStatus = newAmountPaid >= Number(invoice.total_amount) ? 'paid' : 'partial';

      await apiClient.put(`/invoices/${invoice.id}`, {
        status: newStatus,
        amount_paid: newAmountPaid,
        payment_method: paymentMethod,
      });

      if (isFullPayment && encounterId) {
        await apiClient.post('/workflow/release-room', {
          encounter_id: encounterId,
        });
      }

      // Show post-payment summary modal
      setPaymentSummaryData({
        amountReceived,
        amountApplied: amountToApply,
        changeDue,
        remainingBalance: balanceDue - amountToApply,
        paymentMethodUsed: paymentMethod,
        isFullPayment,
      });
      setShowPaymentSummary(true);
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
    if (!(await confirmDialog({
      title: 'Defer this payment?',
      message: 'The patient will be marked as "Miscellaneous - Pending" and can pay later.',
      variant: 'warning',
      confirmLabel: 'Defer',
    }))) {
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
    if (!(await confirmDialog({
      title: 'Submit invoice?',
      message: 'Submit this invoice to the payer and complete the encounter?',
      confirmLabel: 'Submit',
    }))) {
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

  const startEditPayer = async () => {
    try {
      const [ccRes, ipRes] = await Promise.all([
        apiClient.get('/payer-sources/corporate-clients'),
        apiClient.get('/payer-sources/insurance-providers'),
      ]);
      setCcOptions(ccRes.data.corporate_clients || []);
      setIpOptions(ipRes.data.insurance_providers || []);
    } catch {
      // Options may fail but we can still show the dropdown
    }
    setEditingPayer(true);
  };

  const handleSavePayer = async () => {
    setSavingPayer(true);
    try {
      const payerSource: Record<string, unknown> = { payer_type: editPayerType, is_primary: true };
      if (editPayerType === 'corporate' && editPayerId) {
        payerSource.corporate_client_id = editPayerId;
      } else if (editPayerType === 'insurance' && editPayerId) {
        payerSource.insurance_provider_id = editPayerId;
      }
      const res = await apiClient.put(`/payer-sources/patient/${invoice.patient_id}`, {
        payer_sources: [payerSource],
      });
      setCurrentPayerSources(res.data.payer_sources || []);
      setEditingPayer(false);
      showToast('Payment method updated', 'success');

      // Re-resolve prices for invoice items based on new payer
      if (encounterId) {
        try {
          const invoiceRes = await apiClient.get(`/invoices/encounter/${encounterId}`);
          setEditableItems(invoiceRes.data.items || []);
          setInvoice(invoiceRes.data.invoice);
        } catch { /* keep existing data */ }
      }
    } catch {
      showToast('Failed to update payment method', 'error');
    } finally {
      setSavingPayer(false);
    }
  };

  const balance = (Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0)).toFixed(2);

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
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrint}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received (GHS)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={paymentMethod === 'cash' ? undefined : balanceDue}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Enter amount"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the amount received. You may enter less for partial payment.
                      </p>
                    </div>
                    <div>
                      <AppSelect
                        label="Payment Method"
                        value={paymentMethod}
                        onChange={(val) => setPaymentMethod(val)}
                        options={[
                          { value: 'cash', label: 'Cash' },
                          { value: 'card', label: 'Card' },
                          { value: 'mobile_money', label: 'Mobile Money' },
                          { value: 'rpay', label: 'Rpay' },
                          { value: 'bank_transfer', label: 'Bank Transfer' },
                          { value: 'cheque', label: 'Cheque' },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Partial Payment Indicator */}
                  {parseFloat(paymentAmount) > 0 && parseFloat(paymentAmount) < balanceDue && (
                    <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm text-warning-700 font-medium">Partial Payment</span>
                      <span className="text-sm font-semibold text-warning-700">
                        Remaining balance: GHS {(balanceDue - parseFloat(paymentAmount)).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Cash Change Indicator */}
                  {paymentMethod === 'cash' && parseFloat(paymentAmount) > balanceDue && (
                    <div className="bg-success-50 border border-success-200 rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm text-success-700 font-medium">Change to Return</span>
                      <span className="text-sm font-semibold text-success-700">
                        GHS {(parseFloat(paymentAmount) - balanceDue).toFixed(2)}
                      </span>
                    </div>
                  )}

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
                <img src="/medics-logo.png" alt="Medics Clinic" style={{ height: '64px', maxWidth: '220px', objectFit: 'contain' }} className="mb-2" />
                <p className="text-sm text-gray-500 mt-2">Adjacent The Avenue</p>
                <p className="text-sm text-gray-500">Mahama Road, Accra</p>
                <p className="text-sm text-gray-500">Tel: +233 (0) 55 341 1221</p>
                <p className="text-sm text-gray-500">info@medicsgroupgh.com</p>
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-500 uppercase">Payment Method:</h3>
                {isEditable && invoice.patient_id && !editingPayer && (
                  <button
                    onClick={startEditPayer}
                    className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit
                  </button>
                )}
              </div>
              <div className="bg-gray-50 p-4 rounded">
                {editingPayer ? (
                  <div className="space-y-3">
                    <div>
                      <AppSelect
                        label="Payer Type"
                        value={editPayerType}
                        onChange={(val) => { setEditPayerType(val); setEditPayerId(null); }}
                        options={[
                          { value: 'self_pay', label: 'Self Pay' },
                          { value: 'corporate', label: 'Corporate / Employer' },
                          { value: 'insurance', label: 'Health Insurance' },
                        ]}
                      />
                    </div>
                    {editPayerType === 'corporate' && (
                      <div>
                        <AppSelect
                          label="Corporate Client"
                          value={editPayerId ?? ''}
                          onChange={(val) => setEditPayerId(val ? Number(val) : null)}
                          placeholder="Select corporate client"
                          options={ccOptions.map((cc) => ({ value: cc.id, label: cc.name }))}
                        />
                      </div>
                    )}
                    {editPayerType === 'insurance' && (
                      <div>
                        <AppSelect
                          label="Insurance Provider"
                          value={editPayerId ?? ''}
                          onChange={(val) => setEditPayerId(val ? Number(val) : null)}
                          placeholder="Select insurance provider"
                          options={ipOptions.map((ip) => ({ value: ip.id, label: ip.name }))}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSavePayer}
                        disabled={savingPayer || ((editPayerType === 'corporate' || editPayerType === 'insurance') && !editPayerId)}
                        className="px-3 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        {savingPayer ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingPayer(false)}
                        className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentPayerSources.length > 0 ? (
                      <ul className="space-y-1">
                        {currentPayerSources.map((payer) => (
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
                  </>
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
                  {isEditable && <th className="text-center py-3 px-4 font-semibold text-gray-700 print:hidden print-hidden" style={{ width: '40px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-4 text-gray-700">{item.description}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{item.quantity}</td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {isEditable && editingItemId === item.id ? (
                        <div className="flex items-center justify-end gap-1 print:hidden print-hidden">
                          <span className="text-sm text-gray-500">GHS</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onBlur={() => handlePriceSave(item.id)}
                            onKeyDown={(e) => handlePriceKeyDown(e, item.id)}
                            className="w-24 px-2 py-1 border-2 border-primary-500 rounded text-right text-sm focus:ring-2 focus:ring-primary-500 bg-primary-50"
                            autoFocus
                          />
                        </div>
                      ) : isEditable ? (
                        <button
                          type="button"
                          onClick={() => handlePriceEdit(item)}
                          className="inline-flex items-center gap-1.5 text-gray-700 border border-dashed border-gray-300 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 px-2.5 py-1 rounded transition-colors cursor-pointer group print:border-0 print:p-0 print-no-border"
                          title="Click to edit price"
                        >
                          GHS {parseFloat(item.unit_price.toString()).toFixed(2)}
                          <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-500 print:hidden print-hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      ) : (
                        <>GHS {parseFloat(item.unit_price.toString()).toFixed(2)}</>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700 font-medium">
                      GHS {parseFloat(item.total_price.toString()).toFixed(2)}
                    </td>
                    {isEditable && (
                      <td className="py-3 px-4 text-center print:hidden print-hidden">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove item"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Add Other Charge Row */}
                {isEditable && (
                  <tr className="print:hidden print-hidden">
                    {isAddingOther ? (
                      <>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            value={otherDescription}
                            onChange={(e) => setOtherDescription(e.target.value)}
                            placeholder="Enter description..."
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddOther(); if (e.key === 'Escape') setIsAddingOther(false); }}
                          />
                        </td>
                        <td className="py-2 px-4 text-center text-gray-500 text-sm">1</td>
                        <td className="py-2 px-4 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={otherPrice}
                            onChange={(e) => setOtherPrice(e.target.value)}
                            placeholder="0.00"
                            className="w-24 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-primary-500"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddOther(); if (e.key === 'Escape') setIsAddingOther(false); }}
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={handleAddOther}
                              className="px-2 py-1 bg-primary-600 text-white rounded text-xs hover:bg-primary-700"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => { setIsAddingOther(false); setOtherDescription(''); setOtherPrice(''); }}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                        <td></td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-2 px-4">
                        <button
                          type="button"
                          onClick={() => setIsAddingOther(true)}
                          className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Other Charge
                        </button>
                      </td>
                    )}
                  </tr>
                )}
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
            <p className="font-semibold mb-2">Thank you for choosing Medics Clinic.</p>
            <p>For billing inquiries, please contact us at info@medicsgroupgh.com</p>
            <p className="mt-2 text-xs">This is a computer-generated invoice and does not require a signature.</p>
          </div>
        </div>
      </div>

      {/* Payment Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Payment</h3>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Balance Due:</span>
                <span className="font-semibold">GHS {balanceDue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Received:</span>
                <span className="font-semibold">GHS {parseFloat(paymentAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-semibold capitalize">{paymentMethod.replace(/_/g, ' ')}</span>
              </div>

              {/* Change for cash overpayment */}
              {paymentMethod === 'cash' && parseFloat(paymentAmount) > balanceDue && (
                <div className="border-t pt-3 flex justify-between text-lg font-bold text-success-700">
                  <span>Change to Return:</span>
                  <span>GHS {(parseFloat(paymentAmount) - balanceDue).toFixed(2)}</span>
                </div>
              )}

              {/* Remaining balance for partial payment */}
              {parseFloat(paymentAmount) < balanceDue && (
                <div className="border-t pt-3 flex justify-between text-lg font-bold text-warning-600">
                  <span>Remaining Balance:</span>
                  <span>GHS {(balanceDue - parseFloat(paymentAmount)).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-semibold disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Payment Summary Modal */}
      {showPaymentSummary && paymentSummaryData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            {/* Success header */}
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900">Payment Recorded</h3>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Amount Received:</span>
                <span className="font-semibold">GHS {paymentSummaryData.amountReceived.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-semibold capitalize">{paymentSummaryData.paymentMethodUsed.replace(/_/g, ' ')}</span>
              </div>

              {paymentSummaryData.changeDue > 0 && (
                <div className="border-t border-gray-200 pt-3 flex justify-between text-lg font-bold text-success-700">
                  <span>Change Due:</span>
                  <span>GHS {paymentSummaryData.changeDue.toFixed(2)}</span>
                </div>
              )}

              {paymentSummaryData.remainingBalance > 0 && (
                <div className="border-t border-gray-200 pt-3 flex justify-between text-lg font-bold text-warning-700">
                  <span>Outstanding Balance:</span>
                  <span>GHS {paymentSummaryData.remainingBalance.toFixed(2)}</span>
                </div>
              )}

              {paymentSummaryData.isFullPayment && paymentSummaryData.changeDue === 0 && (
                <div className="border-t border-gray-200 pt-3 text-center text-success-700 font-semibold">
                  Fully Paid - No Balance
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setShowPaymentSummary(false);
                onClose();
                if (onPaymentComplete) onPaymentComplete();
              }}
              className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintableInvoice;
