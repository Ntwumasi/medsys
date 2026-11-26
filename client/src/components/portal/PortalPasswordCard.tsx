import React, { useState } from 'react';
import { patientPortalAPI } from '../../api/patientPortal';
import type { PortalMe } from '../../api/patientPortal';
import { setActiveToken } from '../../api/client';

/**
 * Lets a signed-in patient set (or change) a password so they can come back
 * with their phone or patient number instead of waiting for a text. Saving
 * signs out every other phone.
 */
const PortalPasswordCard: React.FC<{ me: PortalMe | null; onSaved: () => void }> = ({ me, onSaved }) => {
  const hasPassword = !!me?.portal_password_set;
  const [open, setOpen] = useState(!hasPassword);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ patient_number: string; phone_works: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 8 characters, with at least one letter and one number.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords are different.');
      return;
    }
    setSaving(true);
    try {
      const res = await patientPortalAPI.setPassword(password);
      localStorage.setItem('token', res.token);
      setActiveToken(res.token);
      setSaved(res.sign_in_with);
      try { localStorage.setItem('portalSignInMode', 'password'); } catch { /* storage unavailable */ }
      setPassword('');
      setConfirm('');
      onSaved();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Could not save your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-4 h-ds-control border border-ds-border-control rounded-ds-control bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent';

  return (
    <section className="rounded-ds-card bg-ds-surface border border-ds-border shadow-ds-card p-5" aria-labelledby="pw-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pw-title" className="!text-base font-semibold text-ds-text">
            {hasPassword ? 'Your password' : 'Sign in faster next time'}
          </h2>
          <p className="text-sm text-ds-text-secondary mt-0.5">
            {hasPassword
              ? 'You can sign in with your phone or patient number and your password.'
              : 'Set a password and you can sign in without waiting for a text.'}
          </p>
        </div>
        {hasPassword && !open && (
          <button onClick={() => { setOpen(true); setSaved(null); }} className="min-h-[44px] px-4 text-sm font-semibold text-ds-accent-text hover:text-ds-accent-hover">
            Change password
          </button>
        )}
      </div>

      {saved && (
        <div className="mt-4 p-3 rounded-lg bg-ds-success-soft text-ds-success-text text-sm" role="status">
          <p className="font-semibold">Password saved.</p>
          <p className="mt-1">
            Next time, sign in with your patient number <strong>{saved.patient_number}</strong>
            {saved.phone_works ? ' or your phone number' : ''} and this password.
            {!saved.phone_works && ' Your phone is shared with family, so use your patient number.'}
          </p>
          <p className="mt-1">Any other phone signed in to your records has been signed out.</p>
        </div>
      )}

      {open && !saved && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pw-new" className="block text-sm font-medium text-ds-text mb-1">New password</label>
            <input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-sm font-medium text-ds-text mb-1">Type it again</label>
            <input id="pw-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
          </div>
          <p className="sm:col-span-2 text-xs text-ds-text-muted">At least 8 characters, with a letter and a number. Don’t use your date of birth.</p>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-ds-text-secondary min-h-[44px]">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-5 h-5" />
            Show password
          </label>
          {error && <p className="sm:col-span-2 text-sm text-ds-critical-text" role="alert">{error}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="min-h-[44px] px-5 bg-ds-accent text-ds-on-accent font-semibold rounded-ds-control hover:bg-ds-accent-hover disabled:opacity-50">
              {saving ? 'Saving…' : 'Save password'}
            </button>
            {hasPassword && (
              <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 text-sm font-medium text-ds-text-secondary hover:text-ds-text">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
};

export default PortalPasswordCard;
