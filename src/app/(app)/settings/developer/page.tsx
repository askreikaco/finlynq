"use client";

/**
 * /settings/developer — Dev Mode toggle (issue #57).
 * Extracted from the monolith /settings/page.tsx.
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Code, Database, ToggleLeft, ToggleRight } from "lucide-react";
import { useOpenSection } from "@/components/settings/use-open-section";
import { DataSection } from "@/components/settings/sections/data-section";

// /settings/data renders this page in place with Data open.
const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/data", section: "data" }],
  valid: ["data"],
};
import { SectionPage } from "@/components/templates";

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
        setDevModeStatus(data.devMode ? "Enabled" : "Disabled");
      } else {
        setDevModeStatus(data.error || "Failed to update");
      }
    } catch {
      setDevModeStatus("Update failed");
    }
    setDevModeLoading(false);
  }

  return (
    <SectionPage
      id="settings-developer"
      title="Developer"
      padBottom="none"
      minW0={false}
      suspense={false}
      grid
    >

      <Card
        title="Dev mode"
        icon={Code}
        tone="violet"
        info="Shows advanced and experimental features in the navigation. Off shows the production set only."
        infoLabel="About dev mode"
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {devMode ? "On" : "Off"}
            </p>
          </div>
          <Button
            variant={devMode ? "primary" : "outline"}
            size="sm"
            onClick={handleDevModeToggle}
            disabled={devModeLoading}
          >
            {devMode ? <ToggleRight className="h-4 w-4 mr-1.5" /> : <ToggleLeft className="h-4 w-4 mr-1.5" />}
            {devMode ? "Disable" : "Enable"}
          </Button>
        </div>
        {devModeStatus && (
          <p className="text-xs text-muted-foreground" data-keep="status">{devModeStatus}</p>
        )}
      </Card>

      <div className="col-span-full">
      <Accordion value={tab} onValueChange={setTab}>
        <AccordionItem
          value="data"
          icon={<Database className="h-4 w-4" />}
          title="Data"
          info="Import, export and manage your data."
        >
          <div id="data">
            <DataSection />
          </div>
        </AccordionItem>
      </Accordion>
      </div>
    </SectionPage>
  );
}
