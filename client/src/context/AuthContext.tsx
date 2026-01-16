import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { authAPI } from '../api/auth';
import type { LoginCredentials } from '../api/auth';

interface ImpersonationInfo {
  isImpersonating: boolean;
  originalUser: User | null;
  originalToken: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  // Impersonation
  impersonation: ImpersonationInfo;
  impersonateUser: (userId: number) => Promise<void>;
  endImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<ImpersonationInfo>({
    isImpersonating: false,
    originalUser: null,
    originalToken: null,
  });

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const storedImpersonation = localStorage.getItem('impersonation');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }

      if (storedImpersonation) {
        setImpersonation(JSON.parse(storedImpersonation));
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const response = await authAPI.login(credentials);
    const { user: userData, token: authToken } = response;

    setUser(userData);
    setToken(authToken);

    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));

    // Clear any impersonation state on fresh login
    setImpersonation({
      isImpersonating: false,
      originalUser: null,
      originalToken: null,
    });
    localStorage.removeItem('impersonation');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setImpersonation({
      isImpersonating: false,
      originalUser: null,
      originalToken: null,
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonation');
  };

  const impersonateUser = async (userId: number) => {
    const response = await authAPI.impersonate(userId);
    const { user: impersonatedUser, token: impersonatedToken } = response;

    // Save original admin session
    const originalUser = user;
    const originalToken = token;

    // Set impersonated user as current
    setUser(impersonatedUser);
    setToken(impersonatedToken);

    const impersonationState = {
      isImpersonating: true,
      originalUser,
      originalToken,
    };
    setImpersonation(impersonationState);

    // Store in localStorage
    localStorage.setItem('token', impersonatedToken);
    localStorage.setItem('user', JSON.stringify(impersonatedUser));
    localStorage.setItem('impersonation', JSON.stringify(impersonationState));
  };

  const endImpersonation = () => {
    if (impersonation.originalUser && impersonation.originalToken) {
      // Restore original admin session
      setUser(impersonation.originalUser);
      setToken(impersonation.originalToken);

      localStorage.setItem('token', impersonation.originalToken);
      localStorage.setItem('user', JSON.stringify(impersonation.originalUser));
    }

    setImpersonation({
      isImpersonating: false,
      originalUser: null,
      originalToken: null,
    });
    localStorage.removeItem('impersonation');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!token && !!user,
        impersonation,
        impersonateUser,
        endImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
