/**
 * /settings/about — About Finlynq (moved out of General; last in the settings nav).
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Info, Shield } from "lucide-react";
import { SectionPage } from "@/components/templates";

export default function AboutSettingsPage() {
  return (
    <SectionPage
      id="settings-about"
      title="About"
      padBottom="none"
      minW0={false}
      suspense={false}
      grid
    >

      <Card
        title="Finlynq"
        icon={Info}
        tone="cyan"
        info="Track your money here, analyze it anywhere. All data is stored locally on your machine; nothing is sent to any server."
        infoLabel="About Finlynq"
        className="space-y-2"
      >
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Zero-knowledge
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Database className="h-3 w-3 mr-1" />
            Local-first
          </Badge>
        </div>
      </Card>
    </SectionPage>
  );
}
