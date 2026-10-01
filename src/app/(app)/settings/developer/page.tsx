"use client";

/**
 * /settings/developer — Dev Mode toggle (issue #57).
 * Extracted from the monolith /settings/page.tsx.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { ToggleLeft, ToggleRight, Database } from "lucide-react";
import { useOpenSection } from "@/components/settings/use-open-section";
import { DataSection } from "@/components/settings/sections/data-section";

// /settings/data renders this page in place with Data open.
const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/data", section: "data" }],
  valid: ["data"],
};
import { PageHeader } from "@/components/mobile";

export default function DeveloperSettingsPage() {
  const [devMode, setDevMode] = useState(false);
  const [devModeLoading, setDevModeLoading] = useState(false);
  const [devModeStatus, setDevModeStatus] = useState("");
  const [tab, setTab] = useOpenSection(OPEN_SECTIONS);

  // Load dev mode
  useEffect(() => {
    fetch("/api/settings/dev-mode")
      .then((r) => r.json())
      .then((data) => { if (typeof data.devMode === "boolean") setDevMode(data.devMode); })
      .catch(() => {});
  }, []);

  async function handleDevModeToggle() {
    setDevModeLoading(true);
    setDevModeStatus("");
    const next = !devMode;
    try {
      const res = await fetch("/api/settings/dev-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devMode: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setDevMode(data.devMode);
        setDevModeStatus(data.devMode ? "Dev mode enabled" : "Dev mode disabled");
      } else {
        setDevModeStatus(data.error || "Failed to update");
      }
    } catch {
      setDevModeStatus("Failed to update dev mode");
    }
    setDevModeLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
          title="Developer"
          titleClassName="text-2xl font-bold tracking-tight"
          subtitle="Advanced and experimental features"
          subtitleClassName="text-sm text-muted-foreground mt-0.5"
        />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              {devMode ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-base">Dev Mode</CardTitle>
              <CardDescription>Show advanced and experimental features in the navigation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {devMode ? "Dev mode is ON" : "Dev mode is OFF"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {devMode
                  ? "All 17 advanced features are visible in the nav. Toggle off to see the production view."
                  : "Showing production feature set only (20 features). Toggle on to see all 17 additional features."}
              </p>
            </div>
            <Button
              variant={devMode ? "default" : "outline"}
              size="sm"
              onClick={handleDevModeToggle}
              disabled={devModeLoading}
            >
              {devMode ? <ToggleRight className="h-4 w-4 mr-1.5" /> : <ToggleLeft className="h-4 w-4 mr-1.5" />}
              {devMode ? "Disable" : "Enable"}
            </Button>
          </div>
          {devModeStatus && (
            <p className="text-xs text-muted-foreground">{devModeStatus}</p>
          )}
        </CardContent>
      </Card>

      <Accordion value={tab} onValueChange={setTab}>
        <AccordionItem
          value="data"
          icon={<Database className="h-4 w-4" />}
          title="Data"
          description="Import, export, and manage your data"
        >
          <div id="data">
            <DataSection />
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
