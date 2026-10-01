/**
 * Server component: "Continue as <email> · Switch account" on the OAuth
 * consent screen. With several accounts on one browser the grant goes to the
 * ACTIVE one; the user must see which before pressing Allow.
 *
 * Rendered on the server from the pf_session cookie (same verification gate as
 * the auth strategy), so the identity is never taken from the URL or the client.
 */
import { cookies } from "next/headers";
import { resolveSessionToken, ACTIVE_COOKIE } from "@/lib/auth/session-bundle";
import { getUserById } from "@/lib/auth/queries";

export type AuthorizeSearchParams = Record<string, string | string[] | undefined>;

/** `/oauth/authorize?...` rebuilt from the incoming params (return target after switching). */
export function authorizeReturnUrl(sp: AuthorizeSearchParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v.length > 0) q.set(k, v[0]);
  }
  return `/oauth/authorize?${q.toString()}`;
}

export async function ActiveAccountBanner({ searchParams }: { searchParams: AuthorizeSearchParams }) {
  const token = (await cookies()).get(ACTIVE_COOKIE)?.value;
  if (!token) return null;
  const r = await resolveSessionToken(token);
  if (!r.userId || (r.status !== "ok" && r.status !== "locked")) return null;
  const user = await getUserById(r.userId).catch(() => null);
  const label = user?.email || user?.username || user?.displayName || null;
  if (!label) return null;
  const switchHref = `/cloud?add=1&redirect=${encodeURIComponent(authorizeReturnUrl(searchParams))}`;
  return (
    <p data-testid="authorize-active-account" className="mb-4 text-center text-sm text-muted-foreground">
      Continue as <strong className="text-foreground">{label}</strong>
      {" · "}
      <a href={switchHref} className="underline underline-offset-2 hover:text-foreground">
        Switch account
      </a>
    </p>
  );
}
