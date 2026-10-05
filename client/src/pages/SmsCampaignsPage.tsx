import React from 'react';
import AppLayout from '../components/AppLayout';
import MarketingSmsCampaigns from '../components/MarketingSmsCampaigns';

// Standalone page so admins (who don't get the Marketing dashboard) can
// review and approve campaigns from the sidebar.
const SmsCampaignsPage: React.FC = () => (
  <AppLayout title="Bulk SMS">
    <div className="max-w-6xl mx-auto">
      <MarketingSmsCampaigns />
    </div>
  </AppLayout>
);

export default SmsCampaignsPage;
