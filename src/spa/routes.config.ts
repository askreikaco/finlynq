/**
 * Strangler list: Next route paths (file-convention form, route groups removed) that the SPA serves.
 * Every other (app) route stays on Next SSR: the shim <Link>/router does a FULL page navigation for them
 * (src/spa/shims/next-link.tsx, nav-state.ts). Add a route here to migrate it; keep the nginx include in sync
 * (deploy/web, owned elsewhere). Dynamic segments use Next syntax: /accounts/[id].
 *
 * Wave 0: /more, /settings, /settings/about
 */
export const SPA_ROUTES: readonly string[] = ["/more", "/settings", "/settings/about"];

/** Route patterns the SPA serves in react-router syntax ("/accounts/:id"). Used by the SW, vite fallback and routes.json. */
export function spaRoutePatterns(): string[] {
  return SPA_ROUTES.map((r) => r.replace(/\[\.\.\.[^\]]+\]/g, "*").replace(/\[([^\]]+)\]/g, ":$1"));
}
