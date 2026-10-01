/**
 * Legacy Import deep links (/settings/import?tab=email, ?provider=moneypro, …)
 * whose sections moved from Reconciliation to Integrations.
 */

// Import sections that moved to Integrations (legacy tab=connect -> migrate).
const MOVED_TO_INTEGRATIONS: Record<string, string> = {
  email: "email",
  migrate: "migrate",
  connect: "migrate",
  statements: "statements",
};

/** Integrations URL for a legacy Import deep link, or null. Pure. */
export function movedImportHref(search: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  const provider = params.get("provider");
  const tab = MOVED_TO_INTEGRATIONS[params.get("tab") ?? hash.replace(/^#/, "")];
  if (provider) return `/settings/integrations?tab=migrate&provider=${encodeURIComponent(provider)}`;
  return tab ? `/settings/integrations?tab=${tab}` : null;
}
