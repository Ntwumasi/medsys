import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import CommandPalette from '../components/CommandPalette';
import { useGuide } from './GuideContext';

// Global ⌘K command palette. Mounted once at the root so any component
// (dashboard headers, future toolbars) can call useCommandPalette().open()
// without owning the modal state.

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<CommandPaletteContextValue | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useCommandPalette = (): CommandPaletteContextValue => {
  const v = useContext(Ctx);
  if (!v) {
    // Don't blow up if a component happens to import the hook before the
    // provider mounts (e.g., during HMR or a misconfigured test). Fall
    // back to no-ops so the UI just doesn't open the palette.
    return { open: () => {}, close: () => {}, isOpen: false };
  }
  return v;
};

export const CommandPaletteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { open: openGuide } = useGuide();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open, close, isOpen }}>
      {children}
      <CommandPalette isOpen={isOpen} onClose={close} onOpenGuide={openGuide} />
    </Ctx.Provider>
  );
};
