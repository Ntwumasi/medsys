import React from 'react';
import { format, differenceInDays } from 'date-fns';
import { Modal } from '../ui';

interface BatchInfo {
  id: number;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  unit_cost: string;
}

interface BatchExpiryWarningProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  onSelectDifferentBatch: () => void;
  batch: BatchInfo | null;
  medicationName: string;
  quantityToDispense: number;
}

const BatchExpiryWarning: React.FC<BatchExpiryWarningProps> = ({
  isOpen,
  onClose,
  onProceed,
  onSelectDifferentBatch,
  batch,
  medicationName,
  quantityToDispense,
}) => {
  if (!batch) return null;

  const expiryDate = new Date(batch.expiry_date);
  const daysUntilExpiry = differenceInDays(expiryDate, new Date());
  const isExpired = daysUntilExpiry < 0;

  const getSeverityColor = () => {
    if (isExpired) return 'red';
    if (daysUntilExpiry <= 7) return 'red';
    if (daysUntilExpiry <= 30) return 'orange';
    return 'yellow';
  };

  const severity = getSeverityColor();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="md">
      <div className="text-center">
        {/* Warning Icon */}
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            severity === 'red'
              ? 'bg-red-100'
              : severity === 'orange'
              ? 'bg-orange-100'
              : 'bg-yellow-100'
          }`}
        >
          <svg
            className={`w-8 h-8 ${
              severity === 'red'
                ? 'text-red-600'
                : severity === 'orange'
                ? 'text-orange-600'
                : 'text-yellow-600'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <h3
          className={`text-xl font-bold mb-2 ${
            severity === 'red'
              ? 'text-red-700'
              : severity === 'orange'
              ? 'text-orange-700'
              : 'text-yellow-700'
          }`}
        >
          {isExpired ? 'Batch Expired!' : 'Near-Expiry Warning'}
        </h3>

        {/* Message */}
        <p className="text-gray-600 mb-4">
          {isExpired
            ? 'This batch has already expired and should not be dispensed.'
            : `This batch expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.`}
        </p>

        {/* Batch Details */}
        <div
          className={`rounded-lg p-4 mb-6 ${
            severity === 'red'
              ? 'bg-red-50 border border-red-200'
              : severity === 'orange'
              ? 'bg-orange-50 border border-orange-200'
              : 'bg-yellow-50 border border-yellow-200'
          }`}
        >
          <div className="text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Medication:</span>
              <span className="font-semibold">{medicationName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Batch Number:</span>
              <span className="font-semibold">{batch.batch_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Expiry Date:</span>
              <span
                className={`font-semibold ${
                  severity === 'red' ? 'text-red-600' : severity === 'orange' ? 'text-orange-600' : 'text-yellow-600'
                }`}
              >
                {format(expiryDate, 'MMMM d, yyyy')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Available Quantity:</span>
              <span className="font-semibold">{batch.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Dispensing:</span>
              <span className="font-semibold">{quantityToDispense} units</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onSelectDifferentBatch}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Select Different Batch
          </button>
          {!isExpired && (
            <button
              onClick={onProceed}
              className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors ${
                severity === 'red'
                  ? 'bg-red-600 hover:bg-red-700'
                  : severity === 'orange'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
            >
              Proceed Anyway
            </button>
          )}
          {isExpired && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {!isExpired && (
          <p className="text-xs text-gray-500 mt-3">
            Proceeding will dispense from this near-expiry batch. Ensure patient is informed.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default BatchExpiryWarning;
