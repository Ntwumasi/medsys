// Patient portal sections, shared by the shell (navigation) and the page.
export type PortalView = 'home' | 'visits' | 'results' | 'bills' | 'medicines' | 'messages';

/** `phone: false` keeps an item out of the 5-slot phone tab bar (still on Home and the desktop sidebar). */
export const PORTAL_NAV: { key: PortalView; label: string; phone?: boolean }[] = [
  { key: 'home', label: 'Home' },
  { key: 'visits', label: 'Visits' },
  { key: 'results', label: 'Results' },
  { key: 'bills', label: 'Bills' },
  { key: 'medicines', label: 'Medicines', phone: false },
  { key: 'messages', label: 'Messages' },
];
