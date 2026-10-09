/**
 * /settings/about — About Finlynq (moved out of General; last in the settings nav).
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Database } from "lucide-react";
import { PageHeader } from "@/components/mobile";

export default function AboutSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="About" titleClassName="text-2xl font-bold tracking-tight" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">About</CardTitle>
              <CardDescription>Finlynq</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Track your money here, analyze it anywhere.
          </p>
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
          <p className="text-xs text-muted-foreground">
            All data is stored locally on your machine. No data is sent to any server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
