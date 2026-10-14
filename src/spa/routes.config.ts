/**
 * Strangler list = the ONE source of which routes the SPA serves. Next file-convention paths (route groups removed,
 * dynamic segments as [id]); each entry matches exactly that path. Every other (app) route stays on Next SSR: the shim
 * <Link>/router does a FULL page navigation for them (shims/next-link.tsx, nav-state.ts).
 *
 * Add a route = add one line here (plus a client twin in ./pages/ if its page.tsx is a server component), then:
 *   node deploy/web/sync-routes.mjs        # regenerates deploy/web/spa-routes.txt (nginx input)
 * tests/spa/route-table.test.ts fails when spa-routes.txt drifts from this list. Keep one plain string literal per
 * line: sync-routes.mjs and the test read them textually.
 *
 * Wave 0: /more, /settings, /settings/about
 * Wave 1: /dashboard, /transactions(+new, search, [id]/edit), /accounts(+new, [id]), /categories, /filter/[list]
 */
export const SPA_ROUTES: readonly string[] = [
  // wave 0
  "/more",
  "/settings",
  "/settings/about",
  // wave 1
  "/dashboard",
  "/transactions",
  "/transactions/new",
  "/transactions/search",
  "/transactions/[id]/edit",
  "/accounts",
  "/accounts/new",
  "/accounts/[id]",
  "/categories",
  "/filter/[list]",
];

/** Route patterns in react-router syntax ("/accounts/:id"), for routes.json only (the matchers live in route-table.ts). */
export function spaRoutePatterns(): string[] {
  return SPA_ROUTES.map((r) => r.replace(/\[\.\.\.[^\]]+\]/g, "*").replace(/\[([^\]]+)\]/g, ":$1"));
}
