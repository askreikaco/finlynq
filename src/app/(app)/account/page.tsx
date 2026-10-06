import { redirect } from "next/navigation";
import { isNavV2Enabled } from "@/lib/nav-v2/flag";
import { AccountHub } from "@/components/account-hub";

/**
 * /account landing.
 *
 * When FINLYNQ_NAV_V2 is enabled: shows iOS grouped list hub of all account sections.
 * When disabled (default): redirects to /account/info.
 */
export default function AccountPage() {
  const navV2Enabled = isNavV2Enabled();

  if (!navV2Enabled) {
    redirect("/account/info");
  }

  return <AccountHub />;
}
