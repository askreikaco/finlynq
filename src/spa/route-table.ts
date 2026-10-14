/**
 * Pure route matching shared by the browser (isSpaPath for the Link/router shims), the service worker (navigation
 * allowlist), the vite dev/preview fallback and the tests. No imports, no vite globs, no node APIs.
 * The nginx include is generated from the SAME inputs (deploy/web/sync-routes.mjs -> spa-routes.txt -> gen-routes.sh),
 * and tests/spa/route-table.test.ts proves the two agree.
 *
 * A route is a Next file-convention path ("/accounts/[id]"). It matches ONLY that path (optional trailing slash, query
 * ignored): sub-paths and sibling routes stay on Next unless they are listed themselves. A dynamic segment never matches
 * the name of a static sibling page of the same directory (/accounts/groups is its own Next page, not account "groups"),
 * so a route's exclusions = static sibling segments found in the full page list.
 */

const isDyn = (s: string) => /^\[[^\]]+\]$/.test(s);
const segs = (route: string) => route.split("/").filter(Boolean);

/** Static sibling names a dynamic segment of `route` must not swallow, derived from every page route of the app. */
export function exclusionsFor(route: string, pageRoutes: readonly string[]): string[] {
  const rs = segs(route);
  const out = new Set<string>();
  rs.forEach((seg, i) => {
    if (!isDyn(seg)) return;
    for (const p of pageRoutes) {
      const ps = segs(p);
      if (ps.length <= i || isDyn(ps[i])) continue;
      if (!rs.slice(0, i).every((s, k) => (isDyn(s) ? isDyn(ps[k]) : s === ps[k]))) continue;
      out.add(ps[i]);
    }
  });
  return [...out].sort();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Regex source (JS and PCRE compatible) matching the path of `route`, with optional trailing slash and query. */
export function routeSource(route: string, exclude: readonly string[] = []): string {
  const body = segs(route)
    .map((s) => {
      if (!isDyn(s)) return esc(s);
      const lookahead = exclude.length ? `(?!(?:${exclude.map(esc).join("|")})(?:/|$))` : "";
      return `${lookahead}[^/]+`;
    })
    .join("\\/");
  return `^\\/${body}\\/?(?:\\?.*)?$`;
}

export function routeMatchers(spaRoutes: readonly string[], pageRoutes: readonly string[]): string[] {
  return spaRoutes.map((r) => routeSource(r, exclusionsFor(r, pageRoutes)));
}

export function makeIsSpaPath(spaRoutes: readonly string[], pageRoutes: readonly string[]): (pathname: string) => boolean {
  const res = routeMatchers(spaRoutes, pageRoutes).map((s) => new RegExp(s));
  return (pathname) => res.some((re) => re.test(pathname));
}
