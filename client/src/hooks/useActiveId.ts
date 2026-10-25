import { useCallback, useRef } from 'react';

/**
 * Guards async loads against the wrong patient. Returns `isActive(id)`, which
 * is true only while `id` is still the one on screen — so a slow reply for
 * patient A that lands after the user moved to patient B is ignored instead
 * of being shown under B's name. The ref is updated during render, so the
 * check is correct even before effects run.
 */
export function useActiveId<T extends string | number | null | undefined>(currentId: T): (id: T) => boolean {
  const ref = useRef<T>(currentId);
  ref.current = currentId;
  return useCallback((id: T) => ref.current === id, []);
}
