"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
        lead={
          <Link
            href="/family"
            aria-label={FAMILY_STRINGS.share_back}
            title={FAMILY_STRINGS.share_back}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
        title={FAMILY_STRINGS.share_page_title}
        titleClassName="text-2xl sm:text-3xl font-bold"
        subtitle={FAMILY_STRINGS.share_page_description}
        subtitleClassName="text-sm text-muted-foreground mt-1"
      />
      <SharingTab reloadKey={reloadKey} onSharesChanged={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
