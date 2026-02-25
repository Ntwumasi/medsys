import React from 'react';
import PharmacyDashboard from './PharmacyDashboard';

const PharmacyTechDashboard: React.FC = () => {
  return (
    <PharmacyDashboard
      showRevenueTab={false}
      title="Pharmacy Tech Dashboard"
    />
  );
};

export default PharmacyTechDashboard;
