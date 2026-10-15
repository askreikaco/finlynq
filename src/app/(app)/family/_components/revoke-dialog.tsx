"use client";

import { useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { errorMessage, postJson } from "./api";

interface RevokeDialogProps {
  shareId: string;
  /** owner revokes; viewer leaves */
  role: "owner" | "viewer";
  onClose: () => void;
  onSuccess: () => void;
}

export function RevokeDialog({ shareId, role, onClose, onSuccess }: RevokeDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("POST", "/api/family/manage/revoke", { shareId });
      if (!res.ok) {
        setError(await errorMessage(res, FAMILY_STRINGS.error_generic));
        return;
      }
      onSuccess();
    } catch {
      setError(FAMILY_STRINGS.error_network);
    } finally {
      setBusy(false);
    }
  };

  const isOwner = role === "owner";
  return (
    <Overlay
      open
      onClose={() => !busy && onClose()}
      size="sm"
      title={isOwner ? FAMILY_STRINGS.revoke_dialog_title : FAMILY_STRINGS.leave_dialog_title}
      info={isOwner ? FAMILY_STRINGS.revoke_dialog_message : FAMILY_STRINGS.leave_dialog_message}
    >
        <div className="space-y-4">
          <div aria-live="polite">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="flex-1">
              {FAMILY_STRINGS.revoke_dialog_button_cancel}
            </Button>
            <Button type="button" variant="destructive" onClick={revoke} disabled={busy} className="flex-1 gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isOwner ? FAMILY_STRINGS.revoke_dialog_button_revoke : FAMILY_STRINGS.sharing_list_leave}
            </Button>
          </div>
        </div>
    </Overlay>
  );
}
