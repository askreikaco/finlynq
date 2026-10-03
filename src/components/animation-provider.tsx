"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export const ANIMATIONS_STORAGE_KEY = "pf-animations-enabled";
const DEFAULT_ANIMATIONS_ENABLED = false;

type AnimationContextValue = {
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
};

const AnimationContext = createContext<AnimationContextValue | null>(null);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean>(DEFAULT_ANIMATIONS_ENABLED);

  // Sync with localStorage after hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
      if (stored !== null) {
        setAnimationsEnabledState(stored === "true");
      }
    } catch {
      // localStorage unavailable / blocked
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ANIMATIONS_STORAGE_KEY) {
        setAnimationsEnabledState(e.newValue === "true");
      }
    };

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setAnimationsEnabledState(customEvent.detail);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("pf-animations-change", handleCustomChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("pf-animations-change", handleCustomChange);
    };
  }, []);

  const setAnimationsEnabled = useCallback((enabled: boolean) => {
    setAnimationsEnabledState(enabled);
    try {
      if (enabled === DEFAULT_ANIMATIONS_ENABLED) {
        localStorage.removeItem(ANIMATIONS_STORAGE_KEY);
      } else {
        localStorage.setItem(ANIMATIONS_STORAGE_KEY, String(enabled));
      }
      window.dispatchEvent(
        new CustomEvent("pf-animations-change", { detail: enabled })
      );
    } catch {
      // Storage unavailable
    }
  }, []);

  return (
    <AnimationContext.Provider value={{ animationsEnabled, setAnimationsEnabled }}>
      {children}
    </AnimationContext.Provider>
  );
}

/**
 * Returns whether chart and counter animations are enabled (default: false).
 */
export function useAnimations(): boolean {
  const ctx = useContext(AnimationContext);
  if (ctx) {
    return ctx.animationsEnabled;
  }
  // Safe fallback if used outside provider (e.g. standalone test or component)
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem(ANIMATIONS_STORAGE_KEY) === "true";
    } catch {
      return DEFAULT_ANIMATIONS_ENABLED;
    }
  }
  return DEFAULT_ANIMATIONS_ENABLED;
}

/**
 * Returns preference state and updater for settings UI.
 */
export function useAnimationPreference(): AnimationContextValue {
  const ctx = useContext(AnimationContext);
  if (!ctx) {
    return {
      animationsEnabled: DEFAULT_ANIMATIONS_ENABLED,
      setAnimationsEnabled: () => {},
    };
  }
  return ctx;
}
