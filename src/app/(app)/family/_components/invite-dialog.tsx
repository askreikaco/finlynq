"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Check } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { FAMILY_SECTIONS_V1 } from "@/lib/family/sections";
import { StepUpDialog } from "./step-up-dialog";
import type { FamilySection } from "@/lib/family/sections";

interface InviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type StepUpState = { required: true; lastBody?: Record<string, unknown> } | { required: false };

export function InviteDialog({ isOpen, onClose, onSuccess }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [selectedSections, setSelectedSections] = useState<Set<FamilySection>>(new Set(FAMILY_SECTIONS_V1));
  const [viewAll, setViewAll] = useState(true);
  const [mustShareBack, setMustShareBack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUpState, setStepUpState] = useState<StepUpState>({ required: false });
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const toggleSection = (section: FamilySection) => {
    const newSections = new Set(selectedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
      setViewAll(false);
    } else {
      newSections.add(section);
    }
    setSelectedSections(newSections);
  };

  const handleViewAllChange = (checked: boolean) => {
    setViewAll(checked);
    if (checked) {
      setSelectedSections(new Set(FAMILY_SECTIONS_V1));
    }
  };

  const handleSubmit = async (password?: string) => {
    if (!email.trim()) {
      setError(FAMILY_STRINGS.invite_dialog_error_invalid_email);
      return;
    }

    if (email.toLowerCase() === "me@example.com") {
      setError(FAMILY_STRINGS.invite_dialog_error_self_invite);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const body = {
        email: email.trim(),
        sections: Array.from(selectedSections),
        allSections: viewAll,
        mustShareBack,
        ...(password && { currentPassword: password }),
      };

      const res = await fetch("/api/family/manage/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        const resData = await res.json().catch(() => ({}));
        if (resData.code === "step_up_required") {
          setStepUpState({ required: true, lastBody: body });
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const resData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(resData.error || "Failed to send invite");
      }

      setSuccessEmail(email);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err) {
      console.error("[invite]", err);
      setError(err instanceof Error ? err.message : FAMILY_STRINGS.error_generic);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setSelectedSections(new Set(FAMILY_SECTIONS_V1));
    setViewAll(true);
    setMustShareBack(false);
    setError(null);
    setSuccessEmail(null);
    setStepUpState({ required: false });
    onClose();
  };

  const selectedLabels = Array.from(selectedSections)
    .map((s) => FAMILY_STRINGS[`invite_dialog_section_${s}` as keyof typeof FAMILY_STRINGS] || s)
    .join(", ");

  return (
    <>
      <Dialog open={isOpen && !stepUpState.required} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{FAMILY_STRINGS.invite_dialog_title}</DialogTitle>
            <DialogDescription>{FAMILY_STRINGS.page_description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Email input */}
            <div>
              <Label htmlFor="email">{FAMILY_STRINGS.invite_dialog_email_label}</Label>
              <Input
                id="email"
                type="email"
                placeholder={FAMILY_STRINGS.invite_dialog_email_placeholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={loading}
                className="mt-2"
              />
            </div>

            {/* Sections checklist */}
            <div>
              <Label className="text-base font-semibold mb-3 block">{FAMILY_STRINGS.invite_dialog_sections_label}</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="view-all"
                    checked={viewAll}
                    onCheckedChange={handleViewAllChange}
                    disabled={loading}
                  />
                  <Label htmlFor="view-all" className="font-normal cursor-pointer">
                    {FAMILY_STRINGS.invite_dialog_sections_all}
                  </Label>
                </div>
                {!viewAll && (
                  <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                    {FAMILY_SECTIONS_V1.map((section) => (
                      <div key={section} className="flex items-center space-x-2">
                        <Checkbox
                          id={`section-${section}`}
                          checked={selectedSections.has(section)}
                          onCheckedChange={() => toggleSection(section)}
                          disabled={loading}
                        />
                        <Label htmlFor={`section-${section}`} className="font-normal cursor-pointer text-sm">
                          {FAMILY_STRINGS[`invite_dialog_section_${section}` as keyof typeof FAMILY_STRINGS] || section}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Must share back toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="must-share-back"
                checked={mustShareBack}
                onCheckedChange={(checked) => setMustShareBack(!!checked)}
                disabled={loading}
              />
              <div className="flex-1">
                <Label htmlFor="must-share-back" className="font-normal cursor-pointer">
                  {FAMILY_STRINGS.invite_dialog_must_share_back}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {FAMILY_STRINGS.invite_dialog_must_share_back_description}
                </p>
              </div>
            </div>

            {/* Disclosure */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4 text-sm">
                <h4 className="font-semibold text-blue-900 mb-2">{FAMILY_STRINGS.invite_dialog_disclosure_title}</h4>
                <div className="space-y-1 text-blue-900">
                  <p>{FAMILY_STRINGS.invite_dialog_disclosure_net_worth}</p>
                  <p>
                    {FAMILY_STRINGS.invite_dialog_disclosure_sections.replace(
                      "{sections}",
                      viewAll ? "all sections" : selectedLabels || "none",
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Success state */}
            {successEmail && (
              <div className="flex items-center gap-2 p-3 bg-green-50 text-green-900 rounded-md border border-green-200">
                <Check className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">
                  {FAMILY_STRINGS.invite_dialog_success.replace("{email}", successEmail)}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="flex-1"
              >
                {FAMILY_STRINGS.invite_dialog_button_cancel}
              </Button>
              <Button
                onClick={() => handleSubmit()}
                disabled={loading || !email.trim()}
                className="flex-1 gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {FAMILY_STRINGS.invite_dialog_button_invite}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step-up dialog */}
      {stepUpState.required && (
        <StepUpDialog
          isOpen={true}
          onClose={() => {
            setStepUpState({ required: false });
            handleClose();
          }}
          onSubmit={(password) => {
            handleSubmit(password);
          }}
        />
      )}
    </>
  );
}
