"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";

interface StepUpDialogProps {
  isOpen: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}

/** Password re-entry. One submit = one attempt; the caller never retries on its own. */
export function StepUpDialog({ isOpen, busy, error, onCancel, onSubmit }: StepUpDialogProps) {
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!password) {
      setLocalError(FAMILY_STRINGS.step_up_required_field);
      return;
    }
    setLocalError(null);
    onSubmit(password);
  };

  const cancel = () => {
    setPassword("");
    setLocalError(null);
    onCancel();
  };

  const shownError = localError ?? error;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="regular:max-w-sm">
        <DialogHeader>
          <DialogTitle>{FAMILY_STRINGS.step_up_title}</DialogTitle>
          <DialogDescription>{FAMILY_STRINGS.step_up_message}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="family-step-up-password">{FAMILY_STRINGS.step_up_password_label}</Label>
            <Input
              id="family-step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLocalError(null);
              }}
              disabled={busy}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? "family-step-up-error" : undefined}
              className="mt-2"
              autoFocus
            />
          </div>

          {shownError && (
            <Alert variant="destructive" id="family-step-up-error">
              <AlertDescription>{shownError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={cancel} disabled={busy} className="flex-1">
              {FAMILY_STRINGS.step_up_button_cancel}
            </Button>
            <Button type="submit" disabled={busy} className="flex-1 gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {FAMILY_STRINGS.step_up_button_verify}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
