import React from 'react';

interface Order {
  status: string;
}

interface ProgressTrackerProps {
  encounterId?: number;
  hasVitals?: boolean;
  hasHPStarted?: boolean;
  labOrders?: Order[];
  pharmacyOrders?: Order[];
  imagingOrders?: Order[];
  encounterStatus?: string;
  compact?: boolean;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  hasVitals = false,
  hasHPStarted = false,
  labOrders = [],
  pharmacyOrders = [],
  imagingOrders = [],
  encounterStatus = 'active',
  compact = false,
}) => {
  // Calculate progress
  const hasOrders = labOrders.length > 0 || pharmacyOrders.length > 0 || imagingOrders.length > 0;
  const allOrdersComplete = hasOrders &&
    [...labOrders, ...pharmacyOrders, ...imagingOrders].every(order => order.status === 'completed');

  let progress = 15; // Started (checked in + room assigned)
  let stage = 'Checked In';

  if (hasVitals) {
    progress = 30;
    stage = 'Vitals Recorded';
  }
  if (hasVitals && hasHPStarted) {
    progress = 45;
    stage = 'Assessment In Progress';
  }
  if (hasOrders) {
    progress = 65;
    stage = 'Orders Placed';
  }
  if (allOrdersComplete) {
    progress = 85;
    stage = 'Orders Complete';
  }
  if (encounterStatus === 'completed') {
    progress = 100;
    stage = 'Completed';
  }

  if (compact) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 rounded-xl border border-blue-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Journey Progress</div>
          <div className="text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            {progress}%
          </div>
        </div>

        {/* Compact Progress Bar */}
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse"></div>
          </div>
        </div>

        {/* Order badges if any */}
        {hasOrders && (
          <div className="mt-2 flex gap-1 flex-wrap">
            {labOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                labOrders.every(o => o.status === 'completed') ? 'bg-emerald-100 text-emerald-800' :
                labOrders.some(o => o.status === 'in_progress') ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                Labs {labOrders.every(o => o.status === 'completed') ? '✓' : labOrders.some(o => o.status === 'in_progress') ? '⏳' : '⏸'}
              </span>
            )}
            {pharmacyOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                pharmacyOrders.every(o => o.status === 'completed') ? 'bg-emerald-100 text-emerald-800' :
                pharmacyOrders.some(o => o.status === 'in_progress') ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                Rx {pharmacyOrders.every(o => o.status === 'completed') ? '✓' : pharmacyOrders.some(o => o.status === 'in_progress') ? '⏳' : '⏸'}
              </span>
            )}
            {imagingOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                imagingOrders.every(o => o.status === 'completed') ? 'bg-emerald-100 text-emerald-800' :
                imagingOrders.some(o => o.status === 'in_progress') ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                Img {imagingOrders.every(o => o.status === 'completed') ? '✓' : imagingOrders.some(o => o.status === 'in_progress') ? '⏳' : '⏸'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 rounded-2xl border-2 border-blue-200 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Patient Journey</div>
          <div className="text-lg font-bold text-gray-900">{stage}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            {progress}%
          </div>
          <div className="text-xs text-gray-500 font-semibold">Complete</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-lg"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent animate-pulse"></div>
        </div>

        {/* Milestone markers */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full flex justify-between px-1">
          {[15, 30, 45, 65, 85, 100].map((milestone) => (
            <div
              key={milestone}
              className={`w-2 h-2 rounded-full border-2 transition-all duration-300 ${
                progress >= milestone
                  ? 'bg-white border-blue-600 scale-110 shadow-lg'
                  : 'bg-gray-300 border-gray-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Order Status Badges */}
      {hasOrders && (
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider w-full mb-1">
            Active Orders:
          </div>
          {labOrders.length > 0 && (
            <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
              labOrders.every(o => o.status === 'completed')
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : labOrders.some(o => o.status === 'in_progress')
                ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Labs ({labOrders.length})
              {labOrders.every(o => o.status === 'completed') ? ' ✓' :
               labOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
            </div>
          )}
          {pharmacyOrders.length > 0 && (
            <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
              pharmacyOrders.every(o => o.status === 'completed')
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : pharmacyOrders.some(o => o.status === 'in_progress')
                ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Pharmacy ({pharmacyOrders.length})
              {pharmacyOrders.every(o => o.status === 'completed') ? ' ✓' :
               pharmacyOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
            </div>
          )}
          {imagingOrders.length > 0 && (
            <div className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
              imagingOrders.every(o => o.status === 'completed')
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : imagingOrders.some(o => o.status === 'in_progress')
                ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Imaging ({imagingOrders.length})
              {imagingOrders.every(o => o.status === 'completed') ? ' ✓' :
               imagingOrders.some(o => o.status === 'in_progress') ? ' ⏳' : ' ⏸'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;
