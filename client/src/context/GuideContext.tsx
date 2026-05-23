import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import DepartmentGuide from '../components/DepartmentGuide';
import NurseGuide from '../components/NurseGuide';
import { doctorGuideSections } from '../components/guides/doctorGuideContent';
import { pharmacyGuideSections } from '../components/guides/pharmacyGuideContent';
import { receptionistGuideSections } from '../components/guides/receptionistGuideContent';

// Global "How-To Guide" opener. Lets any component (sidebar nav, command
// palette, dashboard headers) trigger the role-appropriate guide without
// owning the modal state. Roles without a guide get hasGuide=false so
// the nav can hide the entry instead of showing a dead link.

interface GuideContextValue {
  open: () => void;
  close: () => void;
  hasGuide: boolean;
}

const Ctx = createContext<GuideContextValue | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useGuide = (): GuideContextValue => {
  const v = useContext(Ctx);
  if (!v) return { open: () => {}, close: () => {}, hasGuide: false };
  return v;
};

export const GuideProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const role = user?.role || '';
  const hasGuide = ['doctor', 'nurse', 'pharmacist', 'receptionist'].includes(role);

  const open = useCallback(() => {
    if (hasGuide) setIsOpen(true);
  }, [hasGuide]);
  const close = useCallback(() => setIsOpen(false), []);

  let modal: React.ReactNode = null;
  if (role === 'doctor') {
    modal = (
      <DepartmentGuide
        isOpen={isOpen}
        onClose={close}
        title="Doctor Dashboard Guide"
        sections={doctorGuideSections}
      />
    );
  } else if (role === 'nurse') {
    modal = <NurseGuide isOpen={isOpen} onClose={close} />;
  } else if (role === 'pharmacist') {
    modal = (
      <DepartmentGuide
        isOpen={isOpen}
        onClose={close}
        title="Pharmacy Dashboard Guide"
        sections={pharmacyGuideSections}
      />
    );
  } else if (role === 'receptionist') {
    modal = (
      <DepartmentGuide
        isOpen={isOpen}
        onClose={close}
        title="Receptionist Dashboard Guide"
        sections={receptionistGuideSections}
      />
    );
  }

  return (
    <Ctx.Provider value={{ open, close, hasGuide }}>
      {children}
      {modal}
    </Ctx.Provider>
  );
};
