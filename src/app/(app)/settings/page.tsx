import { redirect } from "next/navigation";
import { isNavV2Enabled } from "@/lib/nav-v2/flag";
import { SettingsHub } from "@/components/settings-hub";

/**
 * /settings landing.
 *
 * When FINLYNQ_NAV_V2 is enabled: shows iOS grouped list hub of all settings sections.
 * When disabled (default): redirects to /settings/general.
 *
 * The 1573-line monolith was split into 8 grouped sub-pages (issue #57).
 * Inbound deep links to bare /settings keep working via this redirect or hub navigation.
 */
export default function SettingsIndex() {
  const navV2Enabled = isNavV2Enabled();

  if (!navV2Enabled) {
    redirect("/settings/general");
  }

  return <SettingsHub />;
}
