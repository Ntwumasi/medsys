import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { authAPI } from '../api/auth';
import { resetApiClientState } from '../api/client';
import type { LoginCredentials, LoginResponse } from '../api/auth';

interface ImpersonationInfo {
  isImpersonating: boolean;
  originalUser: User | null;
  originalToken: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: () => void;
  isAuthenticated: boolean;
  // Password change requirement
  mustChangePassword: boolean;
  clearMustChangePassword: () => void;
  // Impersonation
  impersonation: ImpersonationInfo;
  impersonateUser: (userId: number) => Promise<void>;
  endImpersonation: () => void;
  // Super admin role switching
  activeRole: string | null;
  setActiveRole: (role: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationInfo>({
    isImpersonating: false,
    originalUser: null,
    originalToken: null,
  });
  const [activeRole, setActiveRoleState] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const storedImpersonation = localStorage.getItem('impersonation');
      const storedMustChangePassword = localStorage.getItem('mustChangePassword');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }

      if (storedImpersonation) {
        setImpersonation(JSON.parse(storedImpersonation));
      }

      if (storedMustChangePassword === 'true') {
        setMustChangePassword(true);
      }

      const storedActiveRole = localStorage.getItem('activeRole');
      if (storedActiveRole) {
        setActiveRoleState(storedActiveRole);
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await authAPI.login(credentials);
    const { user: userData, token: authToken, must_change_password } = response;

    setUser(userData as User);
    setToken(authToken);

    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));

    // Handle must_change_password flag
    if (must_change_password) {
      setMustChangePassword(true);
      localStorage.setItem('mustChangePassword', 'true');
    } else {
      setMustChangePassword(false);
      localStorage.removeItem('mustChangePassword');
    }

    // Clear any impersonation state on fresh login
    setImpersonation({
      isImpersonating: false,
      originalUser: null,
      originalToken: null,
    });
    localStorage.removeItem('impersonation');

    // Clear active role for super admin on fresh login
    setActiveRoleState(null);
    localStorage.removeItem('activeRole');

    return response;
  };

  // Super admin "view as" — actually impersonates the demo user for that role
  // so workflows route to predictable test users (e.g. nurse → Sarah Johnson).
  const setActiveRole = async (role: string | null) => {
    // Returning to super admin home: restore the original session.
    if (!role) {
      if (impersonation.originalUser && impersonation.originalToken) {
        setUser(impersonation.originalUser);
        setToken(impersonation.originalToken);
        localStorage.setItem('token', impersonation.originalToken);
        localStorage.setItem('user', JSON.stringify(impersonation.originalUser));
      }
      setImpersonation({ isImpersonating: false, originalUser: null, originalToken: null });
      localStorage.removeItem('impersonation');
      setActiveRoleState(null);
      localStorage.removeItem('activeRole');
      return;
    }

    // Determine the original super admin session we'll restore later.
    const originalUser = impersonation.originalUser ?? user;
    const originalToken = impersonation.originalToken ?? token;

    if (!originalUser || !originalToken) {
      throw new Error('No active session to switch from');
    }

    // The /switch-to-demo endpoint requires a super-admin JWT. If we are
    // currently sitting on a demo-user token (already impersonating), we
    // briefly put the super admin token back in localStorage so the axios
    // interceptor sends it on this one call.
    const savedToken = localStorage.getItem('token');
    localStorage.setItem('token', originalToken);

    try {
      const response = await authAPI.switchToDemoRole(role);

      setUser(response.user);
      setToken(response.token);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      const impersonationState = {
        isImpersonating: true,
        originalUser,
        originalToken,
      };
      setImpersonation(impersonationState);
      localStorage.setItem('impersonation', JSON.stringify(impersonationState));

      setActiveRoleState(role);
      localStorage.setItem('activeRole', role);
    } catch (err) {
      // Restore whatever token was in localStorage so the user isn't logged out.
      if (savedToken) {
        localStorage.setItem('token', savedToken);
      }
      throw err;
    }
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
    localStorage.removeItem('mustChangePassword');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setMustChangePassword(false);
    setActiveRoleState(null);
    setImpersonation({
      isImpersonating: false,
      originalUser: null,
      originalToken: null,
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonation');
    localStorage.removeItem('mustChangePassword');
    localStorage.removeItem('activeRole');
    // Reset the 401 counter so stale polling requests don't interfere with next login
    resetApiClientState();
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

    // Also clear any super-admin role-switch hint
    setActiveRoleState(null);
    localStorage.removeItem('activeRole');
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
        mustChangePassword,
        clearMustChangePassword,
        impersonation,
        impersonateUser,
        endImpersonation,
        activeRole,
        setActiveRole,
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
