import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientPortalAPI } from '../../api/patientPortal';
import { branding } from '../../config/branding';
import type { User } from '../../types';
import type { ApiError } from '../../types';

const PortalVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { loginWithSession } = useAuth();

  const [dob, setDob] = useState('');
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
      navigate('/dashboard');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.response?.data?.error || 'Could not verify. Please request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{branding.clinicName}</h1>
          <p className="text-gray-500 mt-1">Confirm your identity</p>
        </div>

        {!token ? (
          <div className="text-center space-y-4">
            <p className="text-gray-700">This link is missing its access code.</p>
            <Link to="/portal" className="text-primary-600 hover:underline">
              Request a new login link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-gray-600 text-sm">
              For your security, please confirm your date of birth to access your records.
            </p>
            <div>
              <label htmlFor="dob" className="block text-sm font-medium text-gray-700 mb-1">
                Date of birth
              </label>
              <input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? 'Verifying…' : 'Access my records'}
            </button>
            <div className="text-center">
              <Link to="/portal" className="text-sm text-gray-400 hover:text-gray-600">
                Request a new link
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PortalVerify;
