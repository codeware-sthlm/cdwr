'use client';
import { createContext, use, useEffect, useRef } from 'react';

/** Where an overlay lists itself, so a `#anchor` link can open it */
export type AnchorTargets = {
  /** Register `open` for `anchor`; returns the unregister */
  register: (anchor: string, open: () => void) => () => void;
  /** Open the target registered for `anchor`; false when there is none */
  open: (anchor: string) => boolean;
};

export const AnchorTargetsContext = createContext<AnchorTargets | null>(null);

/**
 * Make `open` what a link to `#anchor` runs, for as long as the caller is
 * mounted. `open` is kept in a ref so a re-render does not re-register.
 */
export function useAnchorTarget(
  anchor: string | null | undefined,
  open: () => void
) {
  const targets = use(AnchorTargetsContext);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    if (!targets || !anchor) return;
    return targets.register(anchor, () => openRef.current());
  }, [targets, anchor]);
}
