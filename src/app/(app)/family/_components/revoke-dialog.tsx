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

interface RevokeDialogProps {
  shareId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RevokeDialog({ shareId, isOpen, onClose, onSuccess }: RevokeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/family/manage/revoke", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke share");
      }

      onSuccess();
    } catch (err) {
      console.error("[revoke]", err);
      setError(err instanceof Error ? err.message : FAMILY_STRINGS.error_generic);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{FAMILY_STRINGS.revoke_dialog_title}</DialogTitle>
          <DialogDescription>{FAMILY_STRINGS.revoke_dialog_message}</DialogDescription>
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
              variant="destructive"
              onClick={handleRevoke}
              disabled={loading}
              className="flex-1 gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {FAMILY_STRINGS.revoke_dialog_button_revoke}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
