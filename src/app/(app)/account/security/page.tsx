import { AccountContent } from "@/components/settings/account-content";

/**
 * /account/security — login (2FA, sign-in methods, devices, passkeys,
 * recovery codes, password), API key, privacy and backup / restore.
 * The same cards also render at /settings/account, which external links
 * (emails, OAuth callbacks, the MCP guide) still point to.
 */
export default function AccountSecurityPage() {
  return <AccountContent hideHeader hideEmail />;
}
