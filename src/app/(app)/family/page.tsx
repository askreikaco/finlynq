"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { OverviewTab } from "./_components/overview-tab";
import { SharingTab } from "./_components/sharing-tab";

export default function FamilyPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "sharing">("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{FAMILY_STRINGS.page_title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{FAMILY_STRINGS.page_description}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "sharing")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">{FAMILY_STRINGS.tab_overview}</TabsTrigger>
          <TabsTrigger value="sharing">{FAMILY_STRINGS.tab_sharing}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="sharing" className="space-y-6">
          <SharingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
