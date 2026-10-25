import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientPortalAPI } from '../../api/patientPortal';
import PortalAuthLayout from '../../components/portal/PortalAuthLayout';
import type { User } from '../../types';
import type { ApiError } from '../../types';

const SELECT_CLS =
  'w-full px-3 h-ds-control border border-ds-border-control rounded-ds-control bg-ds-surface text-ds-text focus:bg-ds-surface focus:ring-2 focus:ring-ds-focus-ring focus:border-ds-accent';
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = Array.from({ length: 111 }, (_, i) => String(new Date().getFullYear() - i));

const PortalVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { loginWithSession } = useAuth();

  // Day / month / year dropdowns: the native date picker is awkward on
  // Android for birth years decades back.
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const dob = day && month && year ? `${year}-${month}-${day}` : '';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dob || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await patientPortalAPI.verify(token, dob);
      loginWithSession(res.user as unknown as User, res.token);
      // A texted link opens what it was sent for (a visit, or the clinic's reply).
      const visit = res.target?.match(/^visit:(\d+)$/)?.[1];
      navigate(visit ? `/dashboard?view=visits&visit=${visit}` : res.target === 'messages' ? '/dashboard?view=messages' : '/dashboard');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.response?.data?.error || 'Could not verify. Please request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalAuthLayout title="Confirm it's you" subtitle="For your security, enter your date of birth.">
      {!token ? (
        <div className="space-y-3">
          <p className="text-ds-text">This link is missing its access code.</p>
          <Link to="/portal" className="text-sm font-semibold text-ds-accent-text hover:text-ds-accent-hover">
            Get a new sign-in link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="block text-sm font-medium text-ds-text mb-1.5">Date of birth</legend>
            <div className="grid grid-cols-[1fr_1.6fr_1.3fr] gap-2">
              <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} required className={SELECT_CLS}>
                <option value="">Day</option>
                {DAYS.map((d) => <option key={d} value={d}>{Number(d)}</option>)}
              </select>
              <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} required className={SELECT_CLS}>
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
              </select>
              <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} required className={SELECT_CLS}>
                <option value="">Year</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </fieldset>
          {error && (
            <p className="text-sm text-ds-critical-text bg-ds-critical-soft border border-ds-critical-border rounded-ds-control px-3 py-2" role="alert">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !dob}
            className="w-full h-ds-control bg-ds-accent text-ds-on-accent font-semibold rounded-ds-control shadow-ds-card hover:bg-ds-accent-hover disabled:opacity-50 transition-all"
          >
            {submitting ? 'Checking…' : 'See my records'}
          </button>
          <div className="text-center">
            <Link to="/portal" className="text-sm text-ds-text-muted hover:text-ds-text">
              Link not working? Get a new one
            </Link>
          </div>
        </form>
      )}
    </PortalAuthLayout>
  );
};

export default PortalVerify;
