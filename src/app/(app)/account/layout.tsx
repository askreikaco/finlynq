/**
 * /account shared layout: Header + Info/Security tab navigation (AccountShell).
 */

import { AccountShell } from "@/components/account-shell";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountShell>{children}</AccountShell>;
}
