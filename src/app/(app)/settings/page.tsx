import { SettingsHub } from "@/components/settings-hub";

/**
 * /settings landing: the hub (grouped list of all settings sections) at every size.
 * Inbound deep links to bare /settings land here.
 */
export default function SettingsIndex() {
  return <SettingsHub />;
}
