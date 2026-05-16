/**
 * CriticalFlowProvider — Tracks whether the user is in a critical flow.
 *
 * Critical flows (order editing, product editing, payment, auth, etc.)
 * should suppress campaign display to avoid interrupting the user.
 *
 * Usage:
 * - Wrap app with <CriticalFlowProvider>
 * - Call setCriticalFlow(true) when entering a critical flow
 * - Call setCriticalFlow(false) when leaving
 * - Read isInCriticalFlow from useCriticalFlow()
 *
 * Session 3 — Remote Campaigns + Rule Engine
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

interface CriticalFlowContextType {
  /** Whether the user is currently in a critical flow. */
  isInCriticalFlow: boolean;
  /** Set critical flow state. Use a string tag for debugging. */
  setCriticalFlow: (active: boolean, tag?: string) => void;
}

const CriticalFlowContext = createContext<CriticalFlowContextType>({
  isInCriticalFlow: false,
  setCriticalFlow: () => {} });

export function CriticalFlowProvider({ children }: { children: React.ReactNode }) {
  // Use a ref-backed counter so multiple flows can overlap
  const activeFlowsRef = useRef<Set<string>>(new Set());
  const [isInCriticalFlow, setIsInCriticalFlow] = useState(false);

  const setCriticalFlow = useCallback((active: boolean, tag: string = "default") => {
    if (active) {
      activeFlowsRef.current.add(tag);
    } else {
      activeFlowsRef.current.delete(tag);
    }
    setIsInCriticalFlow(activeFlowsRef.current.size > 0);
  }, []);

  const value = useMemo(
    () => ({ isInCriticalFlow, setCriticalFlow }),
    [isInCriticalFlow, setCriticalFlow],
  );

  return (
    <CriticalFlowContext.Provider value={value}>
      {children}
    </CriticalFlowContext.Provider>
  );
}

export function useCriticalFlow(): CriticalFlowContextType {
  return useContext(CriticalFlowContext);
}
