"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { FAMILY_SECTIONS_V1 } from "@/lib/family/sections";
import { fill, getSectionLabel } from "./section-labels";
import { useStepUp } from "./use-step-up";
import { errorMessage, postJson } from "./api";
import { counterpartyLabel, type ShareDto } from "./types";

interface Props {
  /** incoming must-share-back parent with reconsentRequired */
  parent: ShareDto;
  /** my reciprocal share (reciprocalOf === parent.id), if live */
  reciprocal: ShareDto | undefined;
  onChanged: (notice: { kind: "success" | "error"; text: string }) => void;
}

/**
 * Re-consent: the owner widened a must-share-back share, so I must widen my reciprocal share to
 * cover the new sections. One click = update-sections(reciprocal sections U missing); widening
 * triggers the password step-up like any other widen.
 */
export function ReconsentBanner({ parent, reciprocal, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const stepUp = useStepUp();
  const name = counterpartyLabel(parent);
  const missing = parent.reconsentSections;
  const sectionsText = missing.map(getSectionLabel).join(", ");

  const widen = async () => {
    if (!reciprocal || busy) return;
    setBusy(true);
    const next = FAMILY_SECTIONS_V1.filter((s) => reciprocal.sections.includes(s) || missing.includes(s));
    try {
      const res = await stepUp.execute((currentPassword) =>
        postJson("PUT", "/api/family/manage/update-sections", {
          shareId: reciprocal.id,
          sections: next,
          ...(currentPassword ? { currentPassword } : {}),
        }),
      );
      if (!res) return;
      if (!res.ok) {
        onChanged({ kind: "error", text: await errorMessage(res, FAMILY_STRINGS.update_sections_error) });
        return;
      }
      onChanged({ kind: "success", text: FAMILY_STRINGS.sharing_notice_reconsented });
    } catch {
      onChanged({ kind: "error", text: FAMILY_STRINGS.error_network });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
        <AlertTitle>{fill(FAMILY_STRINGS.reconsent_title, { name })}</AlertTitle>
        <AlertDescription className="space-y-2 mt-1">
          <p>{fill(FAMILY_STRINGS.reconsent_message, { name, sections: sectionsText })}</p>
          {reciprocal ? (
            <Button size="sm" onClick={widen} disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {FAMILY_STRINGS.reconsent_button_share_back}
            </Button>
          ) : (
            <p>{fill(FAMILY_STRINGS.reconsent_no_reciprocal, { name, sections: sectionsText })}</p>
          )}
        </AlertDescription>
      </Alert>
      {stepUp.dialog}
    </>
  );
}
