"use client";

import { useState } from "react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { PageHeader } from "@/components/mobile";
import { SharingTab } from "../_components/sharing-tab";

/** /family/share: invite family members and manage shares (was the "Sharing" tab of /family). */
export default function FamilySharePage() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div className="space-y-6">
      <PageHeader
        className="flex items-start gap-3"
        title={FAMILY_STRINGS.share_page_title}
        titleClassName="text-2xl sm:text-3xl font-bold"
        subtitle={FAMILY_STRINGS.share_page_description}
        subtitleClassName="text-sm text-muted-foreground mt-1"
        backHref="/family"
        backLabel={FAMILY_STRINGS.share_back}
      />
      <SharingTab reloadKey={reloadKey} onSharesChanged={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
