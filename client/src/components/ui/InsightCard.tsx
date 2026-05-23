import React from 'react';

// Small accent-bordered card surfacing one auto-derived observation per
// dashboard. Today it's rule-based (e.g., "3 patients haven't been called
// back in 14 days"); the contract is kept LLM-friendly so we can plug in a
// real assistant later without changing every caller.
//
// Visual treatment: thin left accent stripe + sparkle icon to signal
// "automated insight" without making it look like a fake AI demo.

export type InsightTone = 'info' | 'warning' | 'positive';

interface InsightCardProps {
  tone?: InsightTone;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  icon?: React.ReactNode;
}

const toneClasses: Record<InsightTone, { stripe: string; iconBg: string; iconFg: string; chip: string }> = {
  info: {
    stripe: 'bg-primary-500',
    iconBg: 'bg-primary-50',
    iconFg: 'text-primary-600',
    chip: 'text-primary-700 bg-primary-50 border-primary-200',
  },
  warning: {
    stripe: 'bg-warning-500',
    iconBg: 'bg-warning-50',
    iconFg: 'text-warning-600',
    chip: 'text-warning-700 bg-warning-50 border-warning-200',
  },
  positive: {
    stripe: 'bg-success-500',
    iconBg: 'bg-success-50',
    iconFg: 'text-success-600',
    chip: 'text-success-700 bg-success-50 border-success-200',
  },
};

const InsightCard: React.FC<InsightCardProps> = ({ tone = 'info', title, body, action, icon }) => {
  const t = toneClasses[tone];
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex items-stretch">
      <div className={`w-1 ${t.stripe}`} />
      <div className="flex-1 p-4 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${t.iconBg} ${t.iconFg} flex items-center justify-center flex-shrink-0`}>
          {icon || (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.chip}`}>
              Insight
            </span>
            <h4 className="text-sm font-semibold text-gray-900 truncate">{title}</h4>
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{body}</p>
          {action && (
            <button
              onClick={action.onClick}
              className={`mt-2 text-xs font-semibold ${t.iconFg} hover:underline inline-flex items-center gap-1`}
            >
              {action.label}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InsightCard;
