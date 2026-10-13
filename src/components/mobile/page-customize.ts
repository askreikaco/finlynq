"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Page Customize registry. A page that has cards calls usePageCustomize({ onOpen }); the shared PageHeader
 * reads the active registration and shows the [Customize] button in its More group. No registration = no
 * button. The page owns its sheet (CustomizeCardsSheet) and opens it from onOpen. A module store (not a
 * context) so it works wherever the header renders, with no provider. The newest mounted registration wins.
 */

export interface PageCustomizeRegistration {
  title: string;
  onOpen: () => void;
}

interface Entry {
  reg: PageCustomizeRegistration;
}

let stack: Entry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PageCustomizeRegistration | null {
  return stack[stack.length - 1]?.reg ?? null;
}

/** Registers this page's Customize handler while mounted. Pass null to register nothing (e.g. empty states). */
export function usePageCustomize(opts: { onOpen: () => void; title?: string } | null): void {
  const enabled = opts !== null;
  const title = opts?.title ?? "Customize";
  const onOpen = opts?.onOpen;
  // Latest handler without re-registering on every render.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { reg: { title, onOpen: () => onOpenRef.current?.() } };
    stack = [...stack, entry];
    emit();
    return () => {
      stack = stack.filter((e) => e !== entry);
      emit();
    };
  }, [enabled, title]);
}

/** The active Customize registration for the header (null = the page has no cards to customize). */
export function usePageCustomizeRegistration(): PageCustomizeRegistration | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
