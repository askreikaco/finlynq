"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { InviteLinkHandler } from "../_components/invite-link-handler";

/** Target of the invite email link (/family/accept?token=...). Same handler as /family. */
export default function FamilyAcceptPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">{FAMILY_STRINGS.page_title}</h1>
      <InviteLinkHandler />
      <Link href="/family" className={buttonVariants()}>
        {FAMILY_STRINGS.accept_go_to_page}
      </Link>
    </div>
  );
}
