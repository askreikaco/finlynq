"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { OverviewTab } from "./_components/overview-tab";
import { SharingTab } from "./_components/sharing-tab";
import { InviteLinkHandler } from "./_components/invite-link-handler";

export default function FamilyPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "sharing">("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{FAMILY_STRINGS.page_title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{FAMILY_STRINGS.page_description}</p>
      </div>

      <InviteLinkHandler onDone={bump} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "sharing")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">{FAMILY_STRINGS.tab_overview}</TabsTrigger>
          <TabsTrigger value="sharing">{FAMILY_STRINGS.tab_sharing}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab reloadKey={reloadKey} />
        </TabsContent>

        <TabsContent value="sharing" className="space-y-6">
          <SharingTab reloadKey={reloadKey} onSharesChanged={bump} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
