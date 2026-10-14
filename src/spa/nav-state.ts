/**
 * Shared navigation state for the next/* shims. Kept free of react-router imports so the shims
 * and the route table can both import it without a cycle. main.tsx fills it in at boot.
 */
export type SpaNavigator = {
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
  /** true when pathname is a route the SPA serves (everything else is a full page load into Next). */
  isSpaPath: (pathname: string) => boolean;
};

let nav: SpaNavigator | null = null;
let stale = false;

export function setNavigator(n: SpaNavigator) {
  nav = n;
}
export function getNavigator() {
  return nav;
}

/** A newer build is live (version.json differs / new SW took control): the next navigation is a full page load. */
export function markStale() {
  stale = true;
}
export function isStale() {
  return stale;
}

/** Split "/a/b?x=1#h" into parts, resolving relative hrefs against the current location. */
export function parseHref(href: string): URL | null {
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/** Navigate like next/navigation router.push: in-app when the SPA owns the path, full page load otherwise. */
export function go(href: string, replace = false) {
  const url = parseHref(href);
  if (!url) return;
  const sameOrigin = url.origin === window.location.origin;
  if (nav && sameOrigin && !stale && nav.isSpaPath(url.pathname)) {
    nav.navigate(url.pathname + url.search + url.hash, { replace });
    return;
  }
  if (replace) window.location.replace(url.href);
  else window.location.assign(url.href);
}
