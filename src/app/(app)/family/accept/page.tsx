"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { InviteLinkHandler } from "../_components/invite-link-handler";
import { PageHeader } from "@/components/mobile";

/** Target of the invite email link (/family/accept?token=...). Same handler as /family. */
export default function FamilyAcceptPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={FAMILY_STRINGS.page_title} titleClassName="text-2xl font-bold tracking-tight" />
      <InviteLinkHandler requireToken />
      <Link href="/family" className={buttonVariants()}>
        {FAMILY_STRINGS.accept_go_to_page}
      </Link>
    </div>
  );
}
