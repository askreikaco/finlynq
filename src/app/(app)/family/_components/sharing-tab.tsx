"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { InviteDialog } from "./invite-dialog";
import { SharesList } from "./shares-list";
import type { toShareDto } from "@/lib/family/manage-guard";

type ShareDto = ReturnType<typeof toShareDto>;

interface SharesResponse {
  outgoing: ShareDto[];
  incoming: ShareDto[];
}

export function SharingTab() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState<SharesResponse | null>(null);
  const [_refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchShares = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/family/manage/list", {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: SharesResponse = await res.json();
      setShares(data);
    } catch (err) {
      console.error("[family sharing]", err);
      setError(FAMILY_STRINGS.error_loading_shares);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchShares();
  }, [_refreshTrigger]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setRefreshTrigger((t) => t + 1)}
            >
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Outgoing shares (I share) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{FAMILY_STRINGS.sharing_outgoing_title}</h2>
            <Button
              onClick={() => setShowInviteDialog(true)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Invite
            </Button>
          </div>
          <SharesList
            shares={shares?.outgoing ?? []}
            emptyMessage={FAMILY_STRINGS.sharing_outgoing_empty}
            role="owner"
            onSharesChanged={() => setRefreshTrigger((t) => t + 1)}
          />
        </div>

        {/* Incoming shares (Shared with me) */}
        <div>
          <h2 className="text-xl font-bold mb-4">{FAMILY_STRINGS.sharing_incoming_title}</h2>
          <SharesList
            shares={shares?.incoming ?? []}
            emptyMessage={FAMILY_STRINGS.sharing_incoming_empty}
            role="viewer"
            onSharesChanged={() => setRefreshTrigger((t) => t + 1)}
          />
        </div>
      </div>

      {/* Invite dialog */}
      {showInviteDialog && (
        <InviteDialog
          isOpen={showInviteDialog}
          onClose={() => setShowInviteDialog(false)}
          onSuccess={() => {
            setShowInviteDialog(false);
            fetchShares();
          }}
        />
      )}
    </>
  );
}
