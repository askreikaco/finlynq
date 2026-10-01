"use client";

/**
 * /settings/integrations — MCP setup guide + Connected apps (FINLYNQ-154 —
 * per-user OAuth grant list + revoke).
 *
 * Shows an MCP setup guide card when no apps are connected; hides it once
 * the user has connected at least one MCP client like Claude or ChatGPT.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { ConnectedApps } from "./connected-apps";

export default function IntegrationsSettingsPage() {
  const [hasApps, setHasApps] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const checkApps = async () => {
      try {
        const res = await fetch("/api/settings/connected-apps");
        if (res.ok) {
          const data = await res.json();
          setHasApps(Array.isArray(data.apps) && data.apps.length > 0);
        }
      } catch {
        setHasApps(false);
      } finally {
        setLoaded(true);
      }
    };
    checkApps();
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">External tools that connect to your data</p>
      </div>

      {loaded && !hasApps && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Set up MCP</CardTitle>
                <CardDescription className="mt-1">
                  Connect AI assistants like Claude, ChatGPT, or other MCP clients to securely access your financial data.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/connect">
              <Button variant="outline" className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50">
                View MCP Guide
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <ConnectedApps />
    </div>
  );
}
