"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { OverviewTab } from "./_components/overview-tab";
import { InviteLinkHandler } from "./_components/invite-link-handler";
import { PageHeader } from "@/components/mobile";
import { FAMILY_SHARE_PATH, legacySharingRedirect } from "./_components/share-path";

export default function FamilyPage() {
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  // Read the address bar during the first render: InviteLinkHandler's effect strips ?token=
  // before this component's own effect runs.
  const [initialSearch] = useState(() => (typeof window === "undefined" ? "" : window.location.search));

  useEffect(() => {
    const target = legacySharingRedirect(initialSearch);
    if (target) router.replace(target);
  }, [initialSearch, router]);

  return (
    <div className="space-y-6">
      <PageHeader
        className="flex items-start justify-between gap-3"
        title={FAMILY_STRINGS.page_title}
        titleClassName="text-2xl sm:text-3xl font-bold"
        subtitle={FAMILY_STRINGS.page_description}
        subtitleClassName="text-sm text-muted-foreground mt-1"
        actions={
          <Link
            href={FAMILY_SHARE_PATH}
            aria-label={FAMILY_STRINGS.share_action}
            title={FAMILY_STRINGS.share_action}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      <InviteLinkHandler onDone={() => setReloadKey((k) => k + 1)} />

      <OverviewTab reloadKey={reloadKey} />
    </div>
  );
}
