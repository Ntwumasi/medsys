import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { patientPortalAPI } from '../../api/patientPortal';
import { branding } from '../../config/branding';

const PortalLogin: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || submitting) return;
    setSubmitting(true);
    try {
      await patientPortalAPI.requestLink(phone.trim());
      // Always show the same confirmation regardless of whether the number matched.
      setSent(true);
    } catch {
      // Backend returns generic success even on error; show confirmation anyway.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{branding.clinicName}</h1>
          <p className="text-gray-500 mt-1">Patient Portal</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl">
              ✓
            </div>
            <p className="text-gray-700">
              If an account exists for that number, we've sent a login link by SMS.
              Open the link on your phone and confirm your date of birth to view your records.
            </p>
            <p className="text-sm text-gray-400">The link is valid for 15 minutes.</p>
            <button
              onClick={() => { setSent(false); setPhone(''); }}
              className="text-primary-600 hover:underline text-sm"
            >
              Use a different number
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-gray-600 text-sm">
              Enter the mobile number registered at the clinic and we'll text you a secure
              link to access your records.
            </p>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Mobile number
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 024 123 4567"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send me a login link'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-gray-400 hover:text-gray-600">
            Staff login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PortalLogin;
