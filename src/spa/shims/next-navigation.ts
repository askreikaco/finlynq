import { useMemo } from "react";
import { useLocation, useParams as useRrParams } from "react-router";
import { getNavigator, go } from "../nav-state";

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
  push: (href) => go(href, false),
  replace: (href) => go(href, true),
  back: () => (getNavigator()?.back ?? (() => window.history.back()))(),
  forward: () => (getNavigator()?.forward ?? (() => window.history.forward()))(),
  // RSC refresh has no SPA equivalent: pages that need fresh data refetch through the data layer.
  refresh: () => {
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

export function useSearchParams(): ReadonlyURLSearchParams {
  const { search } = useLocation();
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
