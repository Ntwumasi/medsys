import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientPortalAPI } from '../../api/patientPortal';
import PortalAuthLayout from '../../components/portal/PortalAuthLayout';

const PortalLogin: React.FC = () => {
  const { user } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // What we told them we'd do, so the confirmation matches what they typed.
  const [sentByEmail, setSentByEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setSentByEmail(value.includes('@'));
    try {
      await patientPortalAPI.requestLink(value);
      // Always show the same confirmation regardless of whether it matched.
      setSent(true);
    } catch {
      // Backend returns generic success even on error; show confirmation anyway.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Already signed in on this phone (90-day session): straight to their records.
  if (user?.role === 'patient') return <Navigate to="/dashboard" replace />;

  return (
    <PortalAuthLayout
      title={sent ? 'Check your phone' : 'Sign in'}
      subtitle={sent ? 'Your secure link is on its way.' : "No password needed — we'll send you a secure link."}
    >
      {sent ? (
        <div className="space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-success-50 text-success-600 flex items-center justify-center">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-text-primary">
            {sentByEmail
              ? "If an account exists for that email address, we've emailed you a link. Open it and confirm your date of birth to see your records."
              : "If an account exists for that number, we've texted you a link. Open it on your phone and confirm your date of birth to see your records."}
          </p>
          <p className="text-sm text-text-secondary">The link works for 15 minutes.</p>
          <button
            onClick={() => { setSent(false); setIdentifier(''); }}
            className="text-sm font-semibold text-primary-600 hover:text-primary-700"
          >
            Use a different email or number
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-text-primary mb-1.5">
              Mobile number or email
            </label>
            <input
              id="identifier"
              type="text"
              inputMode="email"
              autoComplete="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="024 123 4567 or you@example.com"
              className="w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              required
            />
            <p className="mt-1.5 text-xs text-text-secondary">Use the number or email you gave the clinic.</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl shadow-sm hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 transition-all"
          >
            {submitting ? 'Sending…' : 'Send me a sign-in link'}
          </button>
        </form>
      )}
      <div className="mt-6 pt-5 border-t border-gray-100 text-center">
        <Link to="/login" className="text-xs text-text-secondary hover:text-text-primary">
          Clinic staff? Sign in here
        </Link>
      </div>
    </PortalAuthLayout>
  );
};

export default PortalLogin;
