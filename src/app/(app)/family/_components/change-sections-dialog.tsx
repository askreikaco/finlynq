"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { FAMILY_SECTIONS_V1, type FamilySection } from "@/lib/family/sections";
import { SectionChecklist } from "./section-checklist";
import { fill, getSectionLabel } from "./section-labels";
import { useStepUp } from "./use-step-up";
import { errorMessage, postJson } from "./api";
import { counterpartyLabel, type ShareDto } from "./types";

interface Props {
  share: ShareDto;
  /** must-share-back minimum (parent's requiredBackSections) shown as locked checked boxes */
  lockedSections?: FamilySection[];
  onClose: () => void;
  onSaved: () => void;
}

/** Owner changes the sections of a share. Widening needs the password (step-up); 409 is shown verbatim. */
export function ChangeSectionsDialog({ share, lockedSections = [], onClose, onSaved }: Props) {
  const locked = new Set(lockedSections);
  const [selected, setSelected] = useState<Set<FamilySection>>(new Set([...share.sections, ...lockedSections]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepUp = useStepUp();

  const sections = FAMILY_SECTIONS_V1.filter((s) => selected.has(s) || locked.has(s));
  const unchanged =
    sections.length === share.sections.length && sections.every((s) => share.sections.includes(s));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || unchanged || sections.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await stepUp.execute((currentPassword) =>
        postJson("PUT", "/api/family/manage/update-sections", {
          shareId: share.id,
          sections,
          ...(currentPassword ? { currentPassword } : {}),
        }),
      );
      if (!res) return;
      if (!res.ok) {
        setError(await errorMessage(res, FAMILY_STRINGS.update_sections_error));
        return;
      }
      onSaved();
    } catch {
      setError(FAMILY_STRINGS.error_network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={!stepUp.open} onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="regular:max-w-md">
          <DialogHeader>
            <DialogTitle>{FAMILY_STRINGS.update_sections_dialog_title}</DialogTitle>
            <DialogDescription>
              {fill(FAMILY_STRINGS.update_sections_dialog_description, { name: counterpartyLabel(share) })}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="space-y-5" noValidate>
            <SectionChecklist
              legend={FAMILY_STRINGS.invite_dialog_sections_label}
              selected={selected}
              onChange={setSelected}
              locked={locked}
              disabled={busy}
            />
            {lockedSections.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {fill(FAMILY_STRINGS.update_sections_required_list, {
                  sections: lockedSections.map(getSectionLabel).join(", "),
                })}
              </p>
            )}

            <div aria-live="polite">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="flex-1">
                {FAMILY_STRINGS.invite_dialog_button_cancel}
              </Button>
              <Button
                type="submit"
                disabled={busy || unchanged || sections.length === 0}
                title={unchanged ? FAMILY_STRINGS.update_sections_unchanged : undefined}
                className="flex-1 gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {FAMILY_STRINGS.update_sections_save}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {stepUp.dialog}
    </>
  );
}
