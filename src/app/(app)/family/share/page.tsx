"use client";

import { useState } from "react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { SectionPage } from "@/components/templates/section-page";
import { SharingTab } from "../_components/sharing-tab";

/** /family/share: invite family members and manage shares (was the "Sharing" tab of /family). */
export default function FamilySharePage() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <SectionPage
      id="family-share"
      title={FAMILY_STRINGS.share_page_title}
      info={FAMILY_STRINGS.share_page_description}
      back={{ href: "/family", label: FAMILY_STRINGS.share_back }}
      width="none"
      padBottom="none"
      minW0={false}
      suspense={false}
    >
      <SharingTab reloadKey={reloadKey} onSharesChanged={() => setReloadKey((k) => k + 1)} />
    </SectionPage>
  );
}
