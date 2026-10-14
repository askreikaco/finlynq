import { useMemo, useSyncExternalStore } from "react";
import { useLocation, useParams as useRrParams } from "react-router";
import { scheduleRevalidation } from "@/lib/data/write-revalidation";
import { getNavigator, go } from "../nav-state";
import { installHistorySync, subscribeLocation } from "../history-sync";

installHistorySync();

export type AppRouterInstance = {
  push: (href: string, opts?: { scroll?: boolean }) => void;
  replace: (href: string, opts?: { scroll?: boolean }) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
};

/** Stable singleton (consumers list `router` in effect deps). */
const router: AppRouterInstance = {
  push: (href, opts) => go(href, false, opts?.scroll !== false),
  replace: (href, opts) => go(href, true, opts?.scroll !== false),
  back: () => (getNavigator()?.back ?? (() => window.history.back()))(),
  forward: () => (getNavigator()?.forward ?? (() => window.history.forward()))(),
  // router.refresh() re-ran the RSC payload in Next. All SPA data is SWR-cached /api/* keys, so the equivalent is
  // one revalidation of every mounted /api key (same coalesced path the write-revalidation layer uses). The
  // "spa:refresh" event stays as a hook for non-SWR consumers.
  refresh: () => {
    scheduleRevalidation(0);
    window.dispatchEvent(new CustomEvent("spa:refresh"));
  },
  prefetch: () => undefined,
};

export function useRouter(): AppRouterInstance {
  return router;
}

export function usePathname(): string {
  return useLocation().pathname;
}

export type ReadonlyURLSearchParams = URLSearchParams;

/** Follows react-router navigations AND raw history.replaceState/pushState (see history-sync.ts), like Next. */
export function useSearchParams(): ReadonlyURLSearchParams {
  const { search: routerSearch } = useLocation(); // re-render on every router navigation
  const search = useSyncExternalStore(subscribeLocation, () => window.location.search, () => routerSearch);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string | string[]> = Record<string, string>>(): T {
  return useRrParams() as unknown as T;
}

export class NotFoundError extends Error {
  readonly digest = "NEXT_NOT_FOUND";
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

export function redirect(href: string): never {
  go(href, true);
  throw new Error("NEXT_REDIRECT");
}
export const permanentRedirect = redirect;

export function useSelectedLayoutSegment(): string | null {
  return useLocation().pathname.split("/").filter(Boolean)[0] ?? null;
}
export function useSelectedLayoutSegments(): string[] {
  return useLocation().pathname.split("/").filter(Boolean);
}
