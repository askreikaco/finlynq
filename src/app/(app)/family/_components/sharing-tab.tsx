"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { InviteDialog } from "./invite-dialog";
import { SharesList, type Notice } from "./shares-list";
import { ReconsentBanner } from "./reconsent-banner";
import { errorMessage } from "./api";
import { fill } from "./section-labels";
import { LIVE_STATUSES, type SharesResponse } from "./types";
import { usePageFab } from "@/components/mobile/page-fab";

export function SharingTab({ reloadKey = 0, onSharesChanged }: { reloadKey?: number; onSharesChanged?: () => void }) {
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState<SharesResponse | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(
    (n?: Notice) => {
      if (n) setNotice(n);
      setVersion((v) => v + 1);
      onSharesChanged?.();
    },
    [onSharesChanged],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/family/manage/list");
        if (!res.ok) {
          const msg = res.status === 429 ? await errorMessage(res) : FAMILY_STRINGS.error_loading_shares;
          if (!cancelled) setError(msg);
          return;
        }
        const data: SharesResponse = await res.json();
        if (!cancelled) setShares(data);
      } catch {
        if (!cancelled) setError(FAMILY_STRINGS.error_loading_shares);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, version]);

  usePageFab("family.invite", () => setShowInvite(true));

  if (loading && !shares) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={FAMILY_STRINGS.accept_loading}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (error && !shares) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div role="alert">
            <p className="font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setVersion((v) => v + 1)}>
              {FAMILY_STRINGS.sharing_try_again}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const outgoing = shares?.outgoing ?? [];
  const incoming = shares?.incoming ?? [];
  const reconsents = incoming.filter(
    (s) => s.reconsentRequired && s.mustShareBack && (LIVE_STATUSES as readonly string[]).includes(s.status),
  );

  return (
    <>
      <div className="space-y-6">
        <div aria-live="polite" className="space-y-3">
          {notice && (
            <Alert variant={notice.kind === "error" ? "destructive" : "default"}>
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {reconsents.map((parent) => (
          <ReconsentBanner
            key={parent.id}
            parent={parent}
            reciprocal={outgoing.find(
              (o) => o.reciprocalOf === parent.id && (LIVE_STATUSES as readonly string[]).includes(o.status),
            )}
            onChanged={reload}
          />
        ))}

        <section aria-labelledby="family-outgoing-heading">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 id="family-outgoing-heading" className="text-xl font-bold">
              {FAMILY_STRINGS.sharing_outgoing_title}
            </h2>
            <Button onClick={() => setShowInvite(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {FAMILY_STRINGS.sharing_invite_button}
            </Button>
          </div>
          <SharesList
            shares={outgoing}
            incoming={incoming}
            emptyMessage={FAMILY_STRINGS.sharing_outgoing_empty}
            role="owner"
            onChanged={reload}
          />
        </section>

        <section aria-labelledby="family-incoming-heading">
          <h2 id="family-incoming-heading" className="text-xl font-bold mb-4">
            {FAMILY_STRINGS.sharing_incoming_title}
          </h2>
          <SharesList
            shares={incoming}
            incoming={incoming}
            emptyMessage={FAMILY_STRINGS.sharing_incoming_empty}
            role="viewer"
            onChanged={reload}
          />
        </section>
      </div>

      {showInvite && (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onSuccess={(email) => {
            setShowInvite(false);
            reload({ kind: "success", text: fill(FAMILY_STRINGS.sharing_notice_invite_sent, { email }) });
          }}
        />
      )}
    </>
  );
}
