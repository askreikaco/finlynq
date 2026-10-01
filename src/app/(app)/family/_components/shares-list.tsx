"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, CircleSlash, AlertTriangle } from "lucide-react";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { FAMILY_SECTIONS_V1 } from "@/lib/family/sections";
import { formatDateTimeLocal } from "@/lib/currency";
import { RevokeDialog } from "./revoke-dialog";
import { ChangeSectionsDialog } from "./change-sections-dialog";
import { fill, getSectionLabel } from "./section-labels";
import { postJson, errorMessage } from "./api";
import { ENDABLE_STATUSES, LIVE_STATUSES, type ShareDto } from "./types";

export type Notice = { kind: "success" | "error"; text: string };

interface SharesListProps {
  shares: ShareDto[];
  /** the viewer's incoming shares: lets a reciprocal share find its must-share-back minimum */
  incoming: ShareDto[];
  emptyMessage: string;
  role: "owner" | "viewer";
  onChanged: (notice?: Notice) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: FAMILY_STRINGS.sharing_status_pending,
  awaiting_owner_unlock: FAMILY_STRINGS.sharing_status_awaiting_unlock,
  active: FAMILY_STRINGS.sharing_status_active,
  suspended: FAMILY_STRINGS.sharing_status_suspended,
  revoked: FAMILY_STRINGS.sharing_status_revoked,
  declined: FAMILY_STRINGS.sharing_status_declined,
  expired: FAMILY_STRINGS.sharing_status_expired,
  key_reset: FAMILY_STRINGS.sharing_status_key_reset,
};

function StatusIcon({ status }: { status: string }) {
  if (status === "active") return <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />;
  if (status === "pending" || status === "awaiting_owner_unlock") return <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  if (status === "suspended" || status === "key_reset") return <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  return <CircleSlash className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export function SharesList({ shares, incoming, emptyMessage, role, onChanged }: SharesListProps) {
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-8">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const editing = shares.find((s) => s.id === editId) ?? null;
  const lockedFor = (s: ShareDto) => {
    if (!s.reciprocalOf) return [];
    const parent = incoming.find((p) => p.id === s.reciprocalOf);
    return parent && parent.mustShareBack && (LIVE_STATUSES as readonly string[]).includes(parent.status)
      ? parent.requiredBackSections
      : [];
  };

  const resend = async (id: string) => {
    if (resending) return;
    setResending(id);
    try {
      const res = await postJson("POST", "/api/family/manage/resend", { shareId: id });
      if (!res.ok) {
        onChanged({ kind: "error", text: await errorMessage(res) });
        return;
      }
      onChanged({ kind: "success", text: FAMILY_STRINGS.sharing_notice_resent });
    } catch {
      onChanged({ kind: "error", text: FAMILY_STRINGS.error_network });
    } finally {
      setResending(null);
    }
  };

  return (
    <>
      <ul className="grid gap-4" aria-label={role === "owner" ? FAMILY_STRINGS.sharing_outgoing_title : FAMILY_STRINGS.sharing_incoming_title}>
        {shares.map((share) => {
          const canEnd = (ENDABLE_STATUSES as readonly string[]).includes(share.status);
          const canEdit = role === "owner" && (LIVE_STATUSES as readonly string[]).includes(share.status);
          const canResend = role === "owner" && share.status === "pending";
          return (
            <li key={share.id}>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">
                          {role === "owner" ? share.counterparty.email : share.counterparty.name}
                        </p>
                        {role === "owner" && share.counterparty.name && (
                          <p className="text-sm text-muted-foreground break-words">{share.counterparty.name}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline" className="gap-1.5">
                          <StatusIcon status={share.status} />
                          {STATUS_LABEL[share.status] ?? share.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {fill(FAMILY_STRINGS.sharing_list_sections_count, {
                            count: share.sections.length,
                            total: FAMILY_SECTIONS_V1.length,
                          })}
                        </span>
                      </div>
                      {share.sections.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {share.sections.map(getSectionLabel).join(", ")}
                        </p>
                      )}

                      <dl className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          <dt className="inline">{FAMILY_STRINGS.sharing_list_created_at}: </dt>
                          <dd className="inline">{formatDateTimeLocal(share.createdAt)}</dd>
                        </div>
                        {share.acceptedAt && (
                          <div>
                            <dt className="inline">{FAMILY_STRINGS.sharing_list_accepted_at}: </dt>
                            <dd className="inline">{formatDateTimeLocal(share.acceptedAt)}</dd>
                          </div>
                        )}
                        {share.lastViewedAt && (
                          <div>
                            <dt className="inline">{FAMILY_STRINGS.sharing_list_last_viewed}: </dt>
                            <dd className="inline">{formatDateTimeLocal(share.lastViewedAt)}</dd>
                          </div>
                        )}
                      </dl>

                      {share.mustShareBack && (
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                          {fill(FAMILY_STRINGS.sharing_list_must_share_back, {
                            sections: share.requiredBackSections.map(getSectionLabel).join(", "),
                          })}
                        </p>
                      )}
                      {role === "owner" && share.reconsentRequired && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          {fill(FAMILY_STRINGS.sharing_list_reconsent_waiting, {
                            sections: share.reconsentSections.map(getSectionLabel).join(", "),
                          })}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setEditId(share.id)}>
                          {FAMILY_STRINGS.sharing_list_edit_sections}
                        </Button>
                      )}
                      {canResend && (
                        <Button size="sm" variant="outline" disabled={resending === share.id} onClick={() => resend(share.id)}>
                          {FAMILY_STRINGS.sharing_list_resend}
                        </Button>
                      )}
                      {canEnd && (
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRevokeId(share.id)}>
                          {role === "owner" ? FAMILY_STRINGS.sharing_list_revoke : FAMILY_STRINGS.sharing_list_leave}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {revokeId && (
        <RevokeDialog
          shareId={revokeId}
          role={role}
          onClose={() => setRevokeId(null)}
          onSuccess={() => {
            setRevokeId(null);
            onChanged({ kind: "success", text: FAMILY_STRINGS.sharing_notice_revoked });
          }}
        />
      )}
      {editing && (
        <ChangeSectionsDialog
          share={editing}
          lockedSections={lockedFor(editing)}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            onChanged({ kind: "success", text: FAMILY_STRINGS.sharing_notice_sections_updated });
          }}
        />
      )}
    </>
  );
}

