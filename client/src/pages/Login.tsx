import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">MedSys EMR</h1>
          <p className="text-gray-600 mt-2">Electronic Medical Record System</p>
        </div>

        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Sign In</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
              placeholder="doctor@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-600">
          <p className="font-semibold mb-3 text-center">Demo credentials:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <p><span className="font-medium">Receptionist:</span> receptionist@medsys.com</p>
            <p><span className="font-medium">Nurse:</span> nurse@medsys.com</p>
            <p><span className="font-medium">Doctor:</span> doctor@medsys.com</p>
            <p><span className="font-medium">Admin:</span> admin@medsys.com</p>
            <p><span className="font-medium">Lab:</span> lab@medsys.com</p>
            <p><span className="font-medium">Pharmacy:</span> pharmacy@medsys.com</p>
            <p><span className="font-medium">Imaging:</span> imaging@medsys.com</p>
            <p><span className="font-medium">Patient:</span> patient@medsys.com</p>
          </div>
          <p className="text-center mt-2 text-gray-500">Password for all: <span className="font-mono bg-gray-100 px-1 rounded">demo123</span></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
