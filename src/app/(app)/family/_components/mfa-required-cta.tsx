"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { FAMILY_STRINGS, MFA_SETUP_HREF } from "@/lib/family/strings";

export function MfaRequiredCta() {
  return (
    <Card className="border-warning/30 bg-warning/10">
      <CardContent className="pt-6">
        <div className="flex gap-4 items-start" role="alert">
          <ShieldAlert className="h-6 w-6 text-warning flex-shrink-0 mt-1" aria-hidden="true" />
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="font-semibold text-warning">{FAMILY_STRINGS.mfa_required_title}</h3>
              <p className="text-sm text-warning mt-1">{FAMILY_STRINGS.mfa_required_message}</p>
            </div>
            <Link href={MFA_SETUP_HREF} className={buttonVariants({ size: "sm", variant: "outline" })}>
              {FAMILY_STRINGS.mfa_required_button_setup}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
