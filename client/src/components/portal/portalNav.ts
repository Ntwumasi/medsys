// Patient portal sections, shared by the shell (navigation) and the page.
export type PortalView = 'home' | 'results' | 'bills' | 'medicines' | 'visits';

export const PORTAL_NAV: { key: PortalView; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'results', label: 'Results' },
  { key: 'bills', label: 'Bills' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'visits', label: 'Visits' },
];
