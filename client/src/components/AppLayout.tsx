import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import NotificationCenter from './NotificationCenter';
import apiClient from '../api/client';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Registration',
    path: '/register-patient',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'Patients',
    path: '/patients',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    roles: ['doctor', 'nurse', 'admin', 'receptionist'],
  },
  {
    label: 'Appointments',
    path: '/appointments',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['doctor', 'nurse', 'admin', 'receptionist'],
  },
  {
    label: 'Lab',
    path: '/lab',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    roles: ['lab'],
  },
  {
    label: 'Pharmacy',
    path: '/pharmacy',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    roles: ['pharmacy'],
  },
  {
    label: 'Imaging',
    path: '/imaging',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    roles: ['imaging'],
  },
  {
    label: 'Billing',
    path: '/billing',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    roles: ['receptionist', 'admin'],
  },
  {
    label: 'My Health',
    path: '/portal',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    roles: ['patient'],
  },
];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: { label: string; path?: string }[];
}

interface SearchResult {
  type: 'patient' | 'appointment';
  id: number;
  title: string;
  subtitle: string;
  path: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, title, breadcrumbs }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);

  // Close search on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search handler with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await apiClient.get(`/patients?search=${encodeURIComponent(searchQuery)}&limit=5`);
        const patients = response.data.patients || response.data || [];
        const results: SearchResult[] = patients.map((p: { id: number; first_name: string; last_name: string; date_of_birth: string; mrn?: string }) => ({
          type: 'patient' as const,
          id: p.id,
          title: `${p.first_name} ${p.last_name}`,
          subtitle: `DOB: ${new Date(p.date_of_birth).toLocaleDateString()} ${p.mrn ? `| MRN: ${p.mrn}` : ''}`,
          path: `/patients/${p.id}`,
        }));
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSelect = (result: SearchResult) => {
    navigate(result.path);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role || '')
  );

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-warning-100 text-warning-700',
      doctor: 'bg-secondary-100 text-secondary-700',
      nurse: 'bg-success-100 text-success-700',
      receptionist: 'bg-primary-100 text-primary-700',
      lab: 'bg-accent-100 text-accent-700',
      pharmacy: 'bg-primary-100 text-primary-700',
      imaging: 'bg-secondary-100 text-secondary-700',
      patient: 'bg-success-100 text-success-700',
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to content link for accessibility */}
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border z-40 flex items-center px-4 lg:px-6">
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-text-secondary hover:bg-primary-50 hover:text-primary-500 mr-2"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <Link to="/dashboard" className="flex items-center">
          <Logo size="sm" showText={!sidebarCollapsed} />
        </Link>

        {/* Global Search */}
        <div ref={searchRef} className="relative ml-4 lg:ml-8 flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search patients..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchOpen && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface rounded-xl shadow-card-hover border border-border overflow-hidden z-50 animate-slide-in-up">
              {searchResults.length > 0 ? (
                <ul className="py-2">
                  {searchResults.map((result) => (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        onClick={() => handleSearchSelect(result)}
                        className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors flex items-center gap-3"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          result.type === 'patient' ? 'bg-primary-100 text-primary-600' : 'bg-secondary-100 text-secondary-600'
                        }`}>
                          {result.type === 'patient' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{result.title}</p>
                          <p className="text-xs text-text-secondary">{result.subtitle}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !searchLoading ? (
                <div className="px-4 py-6 text-center text-text-secondary text-sm">
                  No results found for "{searchQuery}"
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Spacer (for mobile) */}
        <div className="flex-1 sm:hidden" />

        {/* Right side items */}
        <div className="flex items-center gap-2 lg:gap-4 ml-auto">
          {/* Notifications */}
          <NotificationCenter />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white font-semibold text-sm">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-text-primary">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className={`text-xs px-2 py-0.5 rounded-full inline-block ${getRoleColor(user?.role || '')}`}>
                  {user?.role}
                </p>
              </div>
              <svg className="w-4 h-4 text-text-secondary hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl shadow-card-hover border border-border py-2 z-20 animate-slide-in-up">
                  <div className="px-4 py-2 border-b border-border">
                    <p className="text-sm font-medium text-text-primary">
                      {user?.first_name} {user?.last_name}
                    </p>
                    <p className="text-xs text-text-secondary">{user?.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-primary-50 hover:text-primary-600"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-danger-600 hover:bg-danger-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar - Desktop */}
      <aside
        className={`fixed left-0 top-16 bottom-0 bg-surface border-r border-border z-30 transition-all duration-200 hidden lg:block ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute -right-3 top-6 w-6 h-6 bg-surface border border-border rounded-full flex items-center justify-center text-text-secondary hover:text-primary-500 hover:border-primary-500 transition-colors"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 font-medium'
                      : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
                  } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          {!sidebarCollapsed && (
            <div className="p-4 border-t border-border">
              <div className="text-xs text-text-secondary text-center">
                MedSys EMR
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface z-50 lg:hidden animate-slide-in-right">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Logo size="sm" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-text-secondary hover:bg-primary-50"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {filteredNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary-50 text-primary-600 font-medium'
                        : 'text-text-secondary hover:bg-primary-50 hover:text-primary-600'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Main Content */}
      <main
        id="main-content"
        className={`pt-16 min-h-screen transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        {/* Page header with breadcrumbs and title */}
        {(title || breadcrumbs) && (
          <div className="bg-surface border-b border-border px-4 lg:px-6 py-4">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="breadcrumbs mb-2">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="separator">/</span>}
                    {crumb.path ? (
                      <Link to={crumb.path}>{crumb.label}</Link>
                    ) : (
                      <span className="current">{crumb.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}
            {title && <h1 className="text-2xl font-bold text-text-primary">{title}</h1>}
          </div>
        )}

        {/* Page content */}
        <div className="p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40 lg:hidden safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {filteredNavItems.slice(0, 5).map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors ${
                  isActive ? 'text-primary-600' : 'text-text-secondary'
                }`}
              >
                <span className={`${isActive ? 'scale-110' : ''} transition-transform`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] mt-1 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {filteredNavItems.length > 5 && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center flex-1 h-full px-2 text-text-secondary"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] mt-1 font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
