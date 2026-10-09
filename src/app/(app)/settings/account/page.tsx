import { redirect } from "next/navigation";

/**
 * /settings/account: legacy duplicate of /account/security (G2-15).
 * Redirects, keeping the query string: the OAuth callback and the MCP guide still link here.
 */
export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  redirect(qs ? `/account/security?${qs}` : "/account/security");
}
