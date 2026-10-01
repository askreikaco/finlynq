"use client";

/**
 * /account — Account page as a dedicated route.
 *
 * Renders the account management UI without the settings sub-navigation.
 * Users can navigate here directly or from /settings/account.
 */

import { AccountContent } from "@/components/settings/account-content";

export default function AccountPage() {
  return <AccountContent />;
}
