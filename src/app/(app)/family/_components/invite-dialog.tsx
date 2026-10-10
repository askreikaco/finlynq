"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { FAMILY_OVERVIEW_SECTIONS, type FamilySection } from "@/lib/family/sections";
import { SectionChecklist } from "./section-checklist";
import { getSectionDescription, getSectionLabel } from "./section-labels";
import { useStepUp } from "./use-step-up";
import { errorMessage, postJson } from "./api";

interface InviteDialogProps {
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export function InviteDialog({ onClose, onSuccess }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<FamilySection>>(new Set(FAMILY_OVERVIEW_SECTIONS));
  const [mustShareBack, setMustShareBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepUp = useStepUp();

  const sections = FAMILY_OVERVIEW_SECTIONS.filter((s) => selected.has(s));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const viewerEmail = email.trim();
    if (!viewerEmail || !viewerEmail.includes("@")) {
      setError(FAMILY_STRINGS.invite_dialog_error_invalid_email);
      return;
    }
    if (sections.length === 0) {
      setError(FAMILY_STRINGS.invite_dialog_disclosure_none);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await stepUp.execute((currentPassword) =>
        postJson("POST", "/api/family/manage/invite", {
          viewerEmail,
          sections,
          mustShareBack,
          ...(currentPassword ? { currentPassword } : {}),
        }),
      );
      if (!res) return; // cancelled the password prompt
      if (!res.ok) {
        setError(await errorMessage(res));
        return;
      }
      onSuccess(viewerEmail);
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
            <DialogTitle>{FAMILY_STRINGS.invite_dialog_title}</DialogTitle>
            <DialogDescription>{FAMILY_STRINGS.page_description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <Label htmlFor="family-invite-email">{FAMILY_STRINGS.invite_dialog_email_label}</Label>
              <Input
                id="family-invite-email"
                type="email"
                autoComplete="off"
                placeholder={FAMILY_STRINGS.invite_dialog_email_placeholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                className="mt-2"
              />
            </div>

            <SectionChecklist
              legend={FAMILY_STRINGS.invite_dialog_sections_label}
              selected={selected}
              onChange={setSelected}
              disabled={busy}
            />

            <div className="flex items-center justify-between gap-3 min-h-row">
              <div className="flex-1">
                <Label htmlFor="family-invite-must-share-back" className="font-normal cursor-pointer">
                  {FAMILY_STRINGS.invite_dialog_must_share_back}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {FAMILY_STRINGS.invite_dialog_must_share_back_description}
                </p>
              </div>
              <Switch
                id="family-invite-must-share-back"
                checked={mustShareBack}
                onCheckedChange={(v) => setMustShareBack(v)}
                disabled={busy}
                className="shrink-0"
              />
            </div>

            <section
              aria-labelledby="family-invite-disclosure"
              className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info"
            >
              <h4 id="family-invite-disclosure" className="font-semibold mb-2">
                {FAMILY_STRINGS.invite_dialog_disclosure_title}
              </h4>
              {sections.length === 0 ? (
                <p>{FAMILY_STRINGS.invite_dialog_disclosure_none}</p>
              ) : (
                <div className="space-y-2">
                  <p>
                    {selected.has("net_worth")
                      ? FAMILY_STRINGS.invite_dialog_disclosure_net_worth
                      : FAMILY_STRINGS.invite_dialog_disclosure_net_worth_implied}
                  </p>
                  <p>{FAMILY_STRINGS.invite_dialog_disclosure_sections}</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {sections.map((s) => (
                      <li key={s}>
                        <span className="font-medium">{getSectionLabel(s)}</span>: {getSectionDescription(s)}
                      </li>
                    ))}
                  </ul>
                  <p>{FAMILY_STRINGS.invite_dialog_disclosure_readonly}</p>
                  <p>{FAMILY_STRINGS.invite_dialog_disclosure_viewer_2fa}</p>
                  {mustShareBack && <p>{FAMILY_STRINGS.invite_dialog_must_share_back_note}</p>}
                </div>
              )}
            </section>

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
              <Button type="submit" disabled={busy || !email.trim() || sections.length === 0} className="flex-1 gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {FAMILY_STRINGS.invite_dialog_button_invite}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {stepUp.dialog}
    </>
  );
}
