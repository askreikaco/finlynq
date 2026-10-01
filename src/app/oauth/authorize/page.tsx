import { AuthorizeClient } from "./authorize-client";
import { ActiveAccountBanner, type AuthorizeSearchParams } from "./active-account";

// Server wrapper: renders the active account (server-side, from the session
// cookie) into the client consent UI.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<AuthorizeSearchParams>;
}) {
  const sp = await searchParams;
  return <AuthorizeClient accountSlot={<ActiveAccountBanner searchParams={sp} />} />;
}
