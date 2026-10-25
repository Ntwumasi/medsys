import React, { useState } from 'react';
import AppLayout from '../components/AppLayout';
import MarketingSmsCampaigns from '../components/MarketingSmsCampaigns';
import PatientAutoTexts from '../components/PatientAutoTexts';
import { useAuth } from '../context/AuthContext';
import { useDesignSystemPage } from '../hooks/useDesignSystemPage';

// Standalone page so admins (who don't get the Marketing dashboard) can
// review and approve campaigns from the sidebar. Admins also manage the
// automatic patient texts (reminders / "it's ready" notices) here.
const SmsCampaignsPage: React.FC = () => {
  const { user } = useAuth();
  useDesignSystemPage();
  const isAdmin = user?.role === 'admin' || user?.is_super_admin === true;
  const [tab, setTab] = useState<'campaigns' | 'auto'>('campaigns');

  return (
    <AppLayout title="SMS" designSystem>
      <div>
        {isAdmin && (
          <div className="mb-6 bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border">
            <nav className="flex -mb-px overflow-x-auto" role="tablist" aria-label="SMS sections">
              {([['campaigns', 'Bulk campaigns'], ['auto', 'Automatic texts']] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    tab === key
                      ? 'border-ds-accent text-ds-accent-text'
                      : 'border-transparent text-ds-text-muted hover:text-ds-text hover:border-ds-border-control'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        )}
        {isAdmin && tab === 'auto' ? <PatientAutoTexts /> : <MarketingSmsCampaigns />}
      </div>
    </AppLayout>
  );
};

export default SmsCampaignsPage;
