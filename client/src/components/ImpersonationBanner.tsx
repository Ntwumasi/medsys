import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const ImpersonationBanner: React.FC = () => {
  const { user, impersonation, endImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!impersonation.isImpersonating) {
    return null;
  }

  const handleEndImpersonation = () => {
    endImpersonation();
    navigate('/dashboard');
  };

  return (
    <div className="bg-purple-600 text-white py-2 px-4 flex items-center justify-between text-sm fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span>
          <strong>Admin View:</strong> You are logged in as{' '}
          <span className="font-semibold">{user?.first_name} {user?.last_name}</span>{' '}
          ({user?.role})
        </span>
      </div>
      <button
        onClick={handleEndImpersonation}
        className="bg-white text-purple-600 px-3 py-1 rounded font-medium hover:bg-purple-50 transition-colors"
      >
        Return to Admin
      </button>
    </div>
  );
};

export default ImpersonationBanner;
