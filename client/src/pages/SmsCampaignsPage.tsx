import React, { useState } from 'react';
import AppLayout from '../components/AppLayout';
import MarketingSmsCampaigns from '../components/MarketingSmsCampaigns';
import PatientAutoTexts from '../components/PatientAutoTexts';
import { useAuth } from '../context/AuthContext';

// Standalone page so admins (who don't get the Marketing dashboard) can
// review and approve campaigns from the sidebar. Admins also manage the
// automatic patient texts (reminders / "it's ready" notices) here.
const SmsCampaignsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.is_super_admin === true;
  const [tab, setTab] = useState<'campaigns' | 'auto'>('campaigns');

  return (
    <AppLayout title="SMS">
      <div className="max-w-6xl mx-auto">
        {isAdmin && (
          <div className="flex gap-2 mb-4 border-b border-gray-200" role="tablist">
            {([['campaigns', 'Bulk campaigns'], ['auto', 'Automatic texts']] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
                  tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {isAdmin && tab === 'auto' ? <PatientAutoTexts /> : <MarketingSmsCampaigns />}
      </div>
    </AppLayout>
  );
};

export default SmsCampaignsPage;
