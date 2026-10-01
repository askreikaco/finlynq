"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Key } from "lucide-react";

const STRINGS = {
  title: "Passkeys & recovery codes",
  description: "Advanced security features",
  comingSoon: "Coming soon",
} as const;

export function PasskeysPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{STRINGS.title}</CardTitle>
            <CardDescription>{STRINGS.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{STRINGS.comingSoon}</p>
      </CardContent>
    </Card>
  );
}
