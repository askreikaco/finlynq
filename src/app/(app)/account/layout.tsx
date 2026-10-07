/**
 * /account shared layout — Header + Info/Security tab navigation.
 * Server component that renders AccountShell with nav-v2 flag.
 */

import { isNavV2Enabled } from "@/lib/nav-v2/flag";
import { AccountShell } from "@/components/account-shell";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navV2Enabled = isNavV2Enabled();

  return <AccountShell navV2={navV2Enabled}>{children}</AccountShell>;
}
