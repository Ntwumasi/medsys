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
          <div className="w-14 h-14 rounded-ds-card bg-ds-success-soft text-ds-success-text flex items-center justify-center">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-ds-text">
            {sentByEmail
              ? "If an account exists for that email address, we've emailed you a link. Open it and confirm your date of birth to see your records."
              : "If an account exists for that number, we've texted you a link. Open it on your phone and confirm your date of birth to see your records."}
          </p>
          <p className="text-sm text-ds-text-muted">The link works for 15 minutes.</p>
          <button
            onClick={() => { setSent(false); setIdentifier(''); }}
            className="text-sm font-semibold text-ds-accent-text hover:text-ds-accent-hover"
          >
            Use a different email or number
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-ds-text mb-1.5">
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
              className="w-full px-4 h-ds-control border border-ds-border-control rounded-ds-control bg-ds-surface text-ds-text placeholder:text-ds-text-muted focus:bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent transition-colors"
              required
            />
            <p className="mt-1.5 text-xs text-ds-text-muted">Use the number or email you gave the clinic.</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-ds-control bg-ds-accent text-ds-on-accent font-semibold rounded-ds-control shadow-ds-card hover:bg-ds-accent-hover disabled:opacity-50 transition-all"
          >
            {submitting ? 'Sending…' : 'Send me a sign-in link'}
          </button>
        </form>
      )}
      <div className="mt-6 pt-5 border-t border-ds-border text-center">
        <Link to="/login" className="text-xs text-ds-text-muted hover:text-ds-text">
          Clinic staff? Sign in here
        </Link>
      </div>
    </PortalAuthLayout>
  );
};

export default PortalLogin;
