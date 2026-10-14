/**
 * Next patches window.history.pushState/replaceState so a raw call updates usePathname()/useSearchParams().
 * The list toolbar, metric range and split view (?q ?sort ?range ?month ?sel) rely on that: they mirror state into the
 * URL with history.replaceState and later build hrefs from useSearchParams(). react-router does not look at raw
 * history calls, so this module (1) emits "spa:history" after each call (useSearchParams re-reads window.location),
 * and (2) keeps react-router's own history.state ({usr,key,idx}) when a caller passes null, so Back/Forward still
 * resolve. Installed once, on import.
 */
const EVENT = "spa:history";
const FLAG = "__spaHistorySync";

export function installHistorySync(): void {
  if (typeof window === "undefined") return;
  const h = window.history as History & { [FLAG]?: boolean };
  if (h[FLAG]) return;
  h[FLAG] = true;
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = h[m].bind(h);
    h[m] = (data: unknown, unused: string, url?: string | URL | null) => {
      // pushState starts a fresh entry (RR's own pushes always pass their state); only replaceState(null) inherits.
      orig(m === "replaceState" && data == null ? h.state : data, unused, url);
      window.dispatchEvent(new Event(EVENT));
    };
  }
}

export function subscribeLocation(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("popstate", cb);
  };
}
