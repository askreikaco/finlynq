"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { InviteLinkHandler } from "../_components/invite-link-handler";
import { SectionPage } from "@/components/templates/section-page";

/** Target of the invite email link (/family/accept?token=...). Same handler as /family. */
export default function FamilyAcceptPage() {
  return (
    <SectionPage
      id="family-accept"
      title={FAMILY_STRINGS.page_title}
      width="none"
      padBottom="none"
      minW0={false}
      suspense={false}
    >
      <InviteLinkHandler requireToken />
      <Link href="/family" className={buttonVariants()}>
        {FAMILY_STRINGS.accept_go_to_page}
      </Link>
    </SectionPage>
  );
}
