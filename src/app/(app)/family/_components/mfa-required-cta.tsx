"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";

export function MfaRequiredCta() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="pt-6">
        <div className="flex gap-4 items-start">
          <ShieldAlert className="h-6 w-6 text-amber-600 flex-shrink-0 mt-1" />
          <div className="space-y-3 flex-1">
            <div>
              <h3 className="font-semibold text-amber-900">{FAMILY_STRINGS.mfa_required_title}</h3>
              <p className="text-sm text-amber-800 mt-1">{FAMILY_STRINGS.mfa_required_message}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/settings/security">
                <Button size="sm" variant="outline" className="border-amber-200 hover:bg-amber-100">
                  {FAMILY_STRINGS.mfa_required_button_setup}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
