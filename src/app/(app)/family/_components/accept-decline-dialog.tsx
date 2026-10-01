"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";

interface AcceptDeclineDialogProps {
  shareId: string;
  action: "accept" | "decline";
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AcceptDeclineDialog({
  shareId,
  action,
  isOpen,
  onClose,
  onSuccess,
}: AcceptDeclineDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = action === "accept" ? "/api/family/manage/accept" : "/api/family/manage/decline";
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} invite`);
      }

      onSuccess();
    } catch (err) {
      console.error(`[${action}]`, err);
      setError(err instanceof Error ? err.message : FAMILY_STRINGS.error_generic);
    } finally {
      setLoading(false);
    }
  };

  const title = action === "accept" ? FAMILY_STRINGS.sharing_list_accept : FAMILY_STRINGS.decline_dialog_title;
  const message = action === "accept" ? "Are you sure?" : FAMILY_STRINGS.decline_dialog_message;
  const buttonLabel = action === "accept" ? FAMILY_STRINGS.sharing_list_accept : FAMILY_STRINGS.decline_dialog_button_decline;
  const buttonVariant = action === "accept" ? "default" : "destructive";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              {FAMILY_STRINGS.revoke_dialog_button_cancel}
            </Button>
            <Button
              variant={buttonVariant === "destructive" ? "destructive" : "default"}
              onClick={handleAction}
              disabled={loading}
              className="flex-1 gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {buttonLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
