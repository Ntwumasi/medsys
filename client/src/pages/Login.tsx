import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import ChangePasswordModal from '../components/ChangePasswordModal';
import type { ApiError } from '../types';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemoCredentials, setShowDemoCredentials] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const { login, clearMustChangePassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAttemptsRemaining(null);
    setLockedUntil(null);
    setLoading(true);

    try {
      const response = await login({ username, password });

      // Check if user must change password
      if (response.must_change_password) {
        setShowChangePassword(true);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const apiError = err as ApiError;
      const errorData = apiError.response?.data;

      setError(errorData?.error || 'Login failed. Please try again.');

      // Show remaining attempts if provided
      if (errorData?.attempts_remaining !== undefined) {
        setAttemptsRemaining(errorData.attempts_remaining);
      }

      // Show locked time if account is locked
      if (errorData?.locked_until) {
        setLockedUntil(errorData.locked_until);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSuccess = () => {
    setShowChangePassword(false);
    clearMustChangePassword();
    navigate('/dashboard');
  };

  const formatLockedTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-background px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-100 opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-secondary-100 opacity-50 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Logo size="lg" />
        </div>

        {/* Login Card */}
        <div className="bg-surface rounded-2xl shadow-card-hover border border-border p-8 animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Welcome Back</h1>
            <p className="text-text-secondary mt-2">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-6 animate-slide-in-up">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
              {attemptsRemaining !== null && (
                <p className="text-xs mt-2 text-danger-600">
                  {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout
                </p>
              )}
              {lockedUntil && (
                <p className="text-xs mt-2 text-danger-600">
                  Account locked until {formatLockedTime(lockedUntil)}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="form-label">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                required
                placeholder="e.g., jsmith"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                required
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!lockedUntil}
              className="btn btn-primary w-full h-12 text-base font-semibold mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo Credentials Accordion */}
          <div className="mt-8 pt-6 border-t border-border">
            <button
              type="button"
              onClick={() => setShowDemoCredentials(!showDemoCredentials)}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-text-primary hover:text-primary-600 transition-colors"
            >
              <span>Demo Credentials</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${showDemoCredentials ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                showDemoCredentials ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="text-center text-xs text-text-secondary mb-3">
                Username format: <code className="bg-background px-2 py-1 rounded font-mono">first initial + lastname</code>
              </p>
              <p className="text-center text-xs text-text-secondary">
                Example: John Smith → <code className="bg-background px-2 py-1 rounded font-mono">jsmith</code>
              </p>
              <p className="text-center mt-3 text-xs text-text-secondary">
                Default password: <code className="bg-background px-2 py-1 rounded font-mono">demo123</code>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-secondary mt-6">
          Electronic Medical Record System
        </p>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePassword}
        isRequired={true}
        onSuccess={handlePasswordChangeSuccess}
      />
    </div>
  );
};

export default Login;
