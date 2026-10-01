"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { FAMILY_STRINGS, MFA_SETUP_HREF } from "@/lib/family/strings";

export function MfaRequiredCta() {
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
      <CardContent className="pt-6">
        <div className="flex gap-4 items-start" role="alert">
          <ShieldAlert className="h-6 w-6 text-amber-600 flex-shrink-0 mt-1" aria-hidden="true" />
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">{FAMILY_STRINGS.mfa_required_title}</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">{FAMILY_STRINGS.mfa_required_message}</p>
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
