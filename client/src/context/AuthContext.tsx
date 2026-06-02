import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { authAPI } from '../api/auth';
import { resetApiClientState, setActiveToken } from '../api/client';
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
  loginWithSession: (user: User, token: string) => void;
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
        try {
          // Check if token is expired before restoring session
          const payload = JSON.parse(atob(storedToken.split('.')[1]));
          const isExpired = payload.exp && payload.exp * 1000 < Date.now();

          if (isExpired) {
            // Token expired — clear everything and send to login
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('impersonation');
            localStorage.removeItem('mustChangePassword');
            localStorage.removeItem('activeRole');
          } else {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            setActiveToken(storedToken);
          }
        } catch {
          // Corrupted localStorage or malformed token — clear and start fresh
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }

      if (storedImpersonation) {
        try {
          setImpersonation(JSON.parse(storedImpersonation));
        } catch {
          localStorage.removeItem('impersonation');
        }
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
    setActiveToken(authToken);

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

  // Super admin "view as" — two modes:
  //   1. Real identity (no demo): when the super admin picks their OWN role
  //      (e.g. Sedo, who is is_super_admin + role='doctor', picking Doctor)
  //      OR picks Admin (since super admin ⊇ admin). The session, JWT, and
  //      audited user_id stay as the real super admin — only the UI view
  //      changes. This is the path Sedo uses to see patients as himself.
  //   2. Demo impersonation: when the super admin picks a role they don't
  //      have (e.g. Sedo previewing Nurse). The /switch-to-demo endpoint
  //      swaps the JWT for a predictable demo user (Sarah Johnson etc.) so
  //      workflows route correctly during testing. Reversible via
  //      setActiveRole(null).
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

    // Real-identity branch: own role, or admin when the original user is a
    // super admin. No demo session, no JWT swap — just flip the UI view.
    const ownRoleOrAdmin =
      role === originalUser.role ||
      (originalUser.is_super_admin && role === 'admin');

    if (ownRoleOrAdmin) {
      // If we were impersonating a demo, restore the original session first.
      if (impersonation.isImpersonating) {
        setUser(originalUser);
        setToken(originalToken);
        localStorage.setItem('token', originalToken);
        localStorage.setItem('user', JSON.stringify(originalUser));
        setImpersonation({ isImpersonating: false, originalUser: null, originalToken: null });
        localStorage.removeItem('impersonation');
      }
      setActiveRoleState(role);
      localStorage.setItem('activeRole', role);
      return;
    }

    // Demo-preview branch: spawn a demo user for the picked role.
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

  // Establish a session from an already-issued token (e.g. patient portal
  // SMS-link verification, which authenticates without a password).
  const loginWithSession = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setActiveToken(authToken);
    setMustChangePassword(false);
    localStorage.removeItem('mustChangePassword');
    setImpersonation({ isImpersonating: false, originalUser: null, originalToken: null });
    localStorage.removeItem('impersonation');
    setActiveRoleState(null);
    localStorage.removeItem('activeRole');
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
    localStorage.removeItem('mustChangePassword');
  };

  const logout = () => {
    // Clear all auth state from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonation');
    localStorage.removeItem('mustChangePassword');
    localStorage.removeItem('activeRole');
    resetApiClientState();

    // Hard redirect to /login — this fully resets all React state,
    // SSE connections, polling intervals, and stale closures.
    // A soft navigate() leaves orphaned connections that interfere
    // with the next login session.
    window.location.href = '/login';
  };

  const impersonateUser = async (userId: number) => {
    // If we are already impersonating (e.g. a super admin sitting on the
    // demo admin user via the role switcher), the /impersonate endpoint
    // must be called with the *original* super-admin token, otherwise the
    // controller sees the demo user as the actor. Briefly swap the original
    // token into localStorage so the axios interceptor sends it.
    const savedToken = localStorage.getItem('token');
    if (impersonation.originalToken) {
      localStorage.setItem('token', impersonation.originalToken);
    }

    let response;
    try {
      response = await authAPI.impersonate(userId);
    } catch (err) {
      if (savedToken) localStorage.setItem('token', savedToken);
      throw err;
    }

    const { user: impersonatedUser, token: impersonatedToken } = response;

    // Preserve the outermost original session as the rollback target so
    // "Return to Admin" still goes back to the super admin, not the demo
    // user we were currently viewing as.
    const originalUser = impersonation.originalUser ?? user;
    const originalToken = impersonation.originalToken ?? token;

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

    // Clear any stale activeRole hint — we're now impersonating a specific
    // user, not viewing a generic role.
    setActiveRoleState(null);
    localStorage.removeItem('activeRole');
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
        loginWithSession,
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
