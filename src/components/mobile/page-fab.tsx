"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  resolveFab,
  type FabHandlerKey,
  type FabHandlerRegistration,
} from "./fab-registry";

const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"],[data-slot="sheet-content"],[role="alertdialog"]';

const FAB_CLASS =
  "md:hidden print:hidden fixed z-40 inline-flex size-14 min-h-11 min-w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-white/15 transition-transform duration-150 motion-safe:active:scale-95 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]";

const FAB_STYLE = {
  bottom: "calc(var(--mobile-bar-clearance, calc(60px + var(--sab))) + 12px)",
  right: "calc(1rem + var(--sar))",
} as const;

interface PageFabContextValue {
  handlers: ReadonlyMap<FabHandlerKey, FabHandlerRegistration>;
  hideCount: number;
  register: (key: FabHandlerKey, reg: FabHandlerRegistration) => () => void;
  hide: () => () => void;
}

// Default (no provider): no-op, so pages still render in isolated tests.
const noop = () => {};
const PageFabContext = createContext<PageFabContextValue>({
  handlers: new Map(),
  hideCount: 0,
  register: () => noop,
  hide: () => noop,
});

export function PageFabProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<ReadonlyMap<FabHandlerKey, FabHandlerRegistration>>(
    () => new Map(),
  );
  const [hideCount, setHideCount] = useState(0);

  const register = useCallback((key: FabHandlerKey, reg: FabHandlerRegistration) => {
    setHandlers((prev) => {
      const next = new Map(prev);
      next.set(key, reg);
      return next;
    });
    return () => {
      setHandlers((prev) => {
        if (prev.get(key) !== reg) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    };
  }, []);

  const hide = useCallback(() => {
    setHideCount((c) => c + 1);
    return () => setHideCount((c) => c - 1);
  }, []);

  const value = useMemo<PageFabContextValue>(
    () => ({ handlers, hideCount, register, hide }),
    [handlers, hideCount, register, hide],
  );

  return <PageFabContext.Provider value={value}>{children}</PageFabContext.Provider>;
}

export interface PageFabOptions {
  enabled?: boolean;
  disabled?: boolean;
  label?: string;
  icon?: FabHandlerRegistration["icon"];
}

/**
 * Register this page's primary action for its FAB. Call before any early return.
 * The handler is read through a ref, so it is never stale.
 */
export function usePageFab(
  key: FabHandlerKey,
  onClick: () => void,
  opts: PageFabOptions = {},
): void {
  const { enabled = true, disabled = false, label, icon } = opts;
  const { register } = useContext(PageFabContext);
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  });

  useEffect(() => {
    if (!enabled) return;
    return register(key, {
      onClick: () => onClickRef.current(),
      disabled,
      label,
      icon,
    });
  }, [key, enabled, disabled, label, icon, register]);
}

/** Hide the FAB while a transient bottom overlay is shown. Call before any early return. */
export function useHidePageFab(active: boolean): void {
  const { hide } = useContext(PageFabContext);
  useEffect(() => {
    if (!active) return;
    return hide();
  }, [active, hide]);
}

function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(document.querySelector(OVERLAY_SELECTOR) !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-open"],
    });
    return () => observer.disconnect();
  }, []);
  return open;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "range"].includes(type);
  }
  return false;
}

function useTextFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const onIn = (e: FocusEvent) => setFocused(isTextEntry(e.target));
    const onOut = () => setFocused(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return focused;
}

/** Mobile-only per-page floating action button. Mount once in the (app) layout. */
export function PageFab() {
  const pathname = usePathname() ?? "";
  const { handlers, hideCount } = useContext(PageFabContext);
  const overlayOpen = useOverlayOpen();
  const textFocused = useTextFocused();

  const resolved = resolveFab(pathname, handlers);
  if (!resolved) return null;
  if (hideCount > 0 || overlayOpen || textFocused) return null;

  const Icon = resolved.icon;

  if (resolved.type === "link") {
    return (
      <Link
        href={resolved.href}
        aria-label={resolved.label}
        title={resolved.label}
        data-testid="page-fab"
        data-fab-route={resolved.pattern ?? undefined}
        data-fab-kind="link"
        className={FAB_CLASS}
        style={FAB_STYLE}
      >
        <Icon className="size-6" aria-hidden />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={resolved.label}
      title={resolved.label}
      aria-disabled={resolved.disabled ? "true" : undefined}
      data-testid="page-fab"
      data-fab-route={resolved.pattern}
      data-fab-kind="button"
      className={resolved.disabled ? `${FAB_CLASS} opacity-50` : FAB_CLASS}
      style={FAB_STYLE}
      onClick={() => {
        if (!resolved.disabled) resolved.onClick();
      }}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  );
}
