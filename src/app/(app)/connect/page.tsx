import { SettingsShell } from "@/components/settings-shell";
import IntegrationsSettingsPage from "../settings/integrations/page";

// /connect — old URL kept. Renders Settings → Integrations in place (settings
// left nav, Integrations highlighted) with the "Connect your AI" section open;
// Integrations derives the open section from the pathname. The public
// /mcp-guide page stays for SEO; CLAUDE.md forbids re-adding an (app)/mcp-guide
// route, hence this distinct /connect path.
export default function ConnectPage() {
  return (
    <SettingsShell>
      <IntegrationsSettingsPage />
    </SettingsShell>
  );
}
