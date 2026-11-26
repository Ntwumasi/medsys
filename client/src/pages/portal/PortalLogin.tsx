import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientPortalAPI } from '../../api/patientPortal';
import PortalAuthLayout from '../../components/portal/PortalAuthLayout';
import type { User } from '../../types';

/** Remembered per phone: someone who set a password sees that form first. */
export const PORTAL_MODE_KEY = 'portalSignInMode';
const readMode = (): 'password' | 'link' => {
  try { return localStorage.getItem(PORTAL_MODE_KEY) === 'password' ? 'password' : 'link'; } catch { return 'link'; }
};

const PortalLogin: React.FC = () => {
  const { user, loginWithSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'link'>(readMode);
  const [pwId, setPwId] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setPwError(null);
    setSubmitting(true);
    try {
      const res = await patientPortalAPI.passwordLogin(pwId.trim(), password);
      try { localStorage.setItem(PORTAL_MODE_KEY, 'password'); } catch { /* storage unavailable */ }
      loginWithSession(res.user as unknown as User, res.token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPwError(msg || 'Could not sign you in. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-4 h-ds-control border border-ds-border-control rounded-ds-control bg-ds-surface text-ds-text placeholder:text-ds-text-muted focus:bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent transition-colors';

  // Already signed in on this phone (90-day session): straight to their records.
  if (user?.role === 'patient') return <Navigate to="/dashboard" replace />;

  return (
    <PortalAuthLayout
      title={sent ? 'Check your phone' : 'Sign in'}
      subtitle={sent ? 'Your secure link is on its way.' : mode === 'password' ? 'Welcome back.' : "First time, or forgot your password? We'll text you a secure link."}
    >
      {!sent && (
        <div role="tablist" aria-label="How to sign in" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-ds-control bg-ds-subtle">
          {([['link', 'Text me a link'], ['password', 'Password']] as const).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPwError(null); }}
              className={`min-h-[44px] rounded-ds-control text-sm font-semibold transition-colors ${mode === m ? 'bg-ds-surface text-ds-text shadow-ds-card' : 'text-ds-text-secondary hover:text-ds-text'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!sent && mode === 'password' ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="pw-id" className="block text-sm font-medium text-ds-text mb-1.5">Phone number or patient number</label>
            <input id="pw-id" type="text" autoComplete="username" value={pwId} onChange={(e) => setPwId(e.target.value)}
              placeholder="024 123 4567 or P000123" className={inputCls} required />
            <p className="mt-1.5 text-xs text-ds-text-muted">If your family shares one phone, use your patient number.</p>
          </div>
          <div>
            <label htmlFor="pw-password" className="block text-sm font-medium text-ds-text mb-1.5">Password</label>
            <input id="pw-password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputCls} required />
          </div>
          {pwError && <p className="text-sm text-ds-critical-text" role="alert">{pwError}</p>}
          <button type="submit" disabled={submitting}
            className="w-full h-ds-control bg-ds-accent text-ds-on-accent font-semibold rounded-ds-control shadow-ds-card hover:bg-ds-accent-hover disabled:opacity-50 transition-all">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => setMode('link')} className="w-full min-h-[44px] text-sm font-semibold text-ds-accent-text hover:text-ds-accent-hover">
            Forgot your password? Text me a link
          </button>
        </form>
      ) : sent ? (
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
