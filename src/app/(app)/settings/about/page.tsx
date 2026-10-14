/**
 * /settings/about — About Finlynq (moved out of General; last in the settings nav).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Shield, Database } from "lucide-react";
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-1 text-base">
                Finlynq
                <InfoTip label="About Finlynq" text="Track your money here, analyze it anywhere. All data is stored locally on your machine; nothing is sent to any server." />
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>
    </SectionPage>
  );
}
