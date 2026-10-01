"use client";
import { PageHeader } from "@/components/mobile";

/**
 * /settings/integrations — MCP setup guide + Connected apps + Bank feeds.
 *
 * Shows an MCP setup guide card when no apps are connected and no API key has
 * been used recently. Hides it once the user has connected via OAuth or used
 * an MCP API key within the last 30 days. Also includes the SimpleFIN bank
 * feed section in an accordion.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Zap, Landmark } from "lucide-react";
import { ConnectedApps } from "./connected-apps";
import { BankFeedsSection } from "@/components/settings/sections/bank-feeds-section";
import { useOpenSection } from "@/components/settings/use-open-section";
import { isMcpConnected } from "@/lib/mcp/connected";

interface ConnectedAppsData {
  apps: { id: number }[];
  mcpApiKeyLastUsedAt: string | null;
}

// /settings/bank-feeds renders this page in place with Bank feeds open.
const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/bank-feeds", section: "bank-feeds" }],
  valid: ["bank-feeds"],
};

export default function IntegrationsSettingsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useOpenSection(OPEN_SECTIONS);

  useEffect(() => {
    const checkConnected = async () => {
      try {
        const res = await fetch("/api/settings/connected-apps");
        if (res.ok) {
          const data: ConnectedAppsData = await res.json();
          const connected = isMcpConnected(
            data.apps || [],
            data.mcpApiKeyLastUsedAt || null
          );
          setIsConnected(connected);
          setLoaded(true);
        }
      } catch {
        // leave `loaded` false: no card on failure
      }
    };
    checkConnected();
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">External tools and bank connections</p>
      </div>

      {loaded && !isConnected && (
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

      <Accordion value={tab} onValueChange={setTab}>
        <AccordionItem
          value="bank-feeds"
          icon={<Landmark className="h-4 w-4" />}
          title="Bank feeds"
          description="SimpleFIN bank sync"
        >
          <div id="bank-feeds">
            <BankFeedsSection />
          </div>
        </AccordionItem>
      </Accordion>

      {loaded && isConnected && (
        <div className="text-center text-sm text-muted-foreground">
          <Link href="/connect" className="text-primary hover:underline">
            Show setup guide
          </Link>
        </div>
      )}
    </div>
  );
}
