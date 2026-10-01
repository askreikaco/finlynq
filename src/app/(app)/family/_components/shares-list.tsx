"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { RevokeDialog } from "./revoke-dialog";
import { AcceptDeclineDialog } from "./accept-decline-dialog";
import type { toShareDto } from "@/lib/family/manage-guard";

type ShareDto = ReturnType<typeof toShareDto>;

interface SharesListProps {
  shares: ShareDto[];
  emptyMessage: string;
  role: "owner" | "viewer";
  onSharesChanged: () => void;
}

export function SharesList({ shares, emptyMessage, role, onSharesChanged }: SharesListProps) {
  const [revokeShareId, setRevokeShareId] = useState<string | null>(null);
  const [acceptDeclineShareId, setAcceptDeclineShareId] = useState<string | null>(null);
  const [acceptDeclineAction, setAcceptDeclineAction] = useState<"accept" | "decline">("accept");

  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-8">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {shares.map((share) => (
          <ShareCard
            key={share.id}
            share={share}
            role={role}
            onRevoke={(id) => setRevokeShareId(id)}
            onAccept={(id) => {
              setAcceptDeclineShareId(id);
              setAcceptDeclineAction("accept");
            }}
            onDecline={(id) => {
              setAcceptDeclineShareId(id);
              setAcceptDeclineAction("decline");
            }}
            _onSharesChanged={onSharesChanged}
          />
        ))}
      </div>

      {/* Revoke dialog */}
      {revokeShareId && (
        <RevokeDialog
          shareId={revokeShareId}
          isOpen={true}
          onClose={() => setRevokeShareId(null)}
          onSuccess={() => {
            setRevokeShareId(null);
            onSharesChanged();
          }}
        />
      )}

      {/* Accept/Decline dialog */}
      {acceptDeclineShareId && (
        <AcceptDeclineDialog
          shareId={acceptDeclineShareId}
          action={acceptDeclineAction}
          isOpen={true}
          onClose={() => setAcceptDeclineShareId(null)}
          onSuccess={() => {
            setAcceptDeclineShareId(null);
            onSharesChanged();
          }}
        />
      )}
    </>
  );
}

function ShareCard({
  share,
  role,
  onRevoke,
  onAccept,
  onDecline,
  _onSharesChanged,
}: {
  share: ShareDto;
  role: "owner" | "viewer";
  onRevoke: (id: string) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  _onSharesChanged: () => void;
}) {
  const statusIcon = {
    pending: <Clock className="h-5 w-5 text-amber-600" />,
    awaiting_owner_unlock: <Clock className="h-5 w-5 text-amber-600" />,
    active: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    suspended: <AlertCircle className="h-5 w-5 text-red-600" />,
    revoked: <AlertCircle className="h-5 w-5 text-gray-400" />,
    declined: <AlertCircle className="h-5 w-5 text-gray-400" />,
    expired: <AlertCircle className="h-5 w-5 text-gray-400" />,
    key_reset: <AlertCircle className="h-5 w-5 text-amber-600" />,
  };

  const statusLabel = {
    pending: FAMILY_STRINGS.sharing_status_pending,
    awaiting_owner_unlock: FAMILY_STRINGS.sharing_status_awaiting_unlock,
    active: FAMILY_STRINGS.sharing_status_active,
    suspended: FAMILY_STRINGS.sharing_status_suspended,
    revoked: FAMILY_STRINGS.sharing_status_revoked,
    declined: FAMILY_STRINGS.sharing_status_declined,
    expired: FAMILY_STRINGS.sharing_status_expired,
    key_reset: FAMILY_STRINGS.sharing_status_key_reset,
  };

  const isActive = ["active", "awaiting_owner_unlock"].includes(share.status);
  const isPending = share.status === "pending" && role === "viewer";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Counterparty info */}
            <div>
              <p className="font-medium">
                {share.role === "owner" && "email" in share.counterparty
                  ? share.counterparty.email
                  : share.counterparty.name}
              </p>
              {"email" in share.counterparty && share.counterparty.name && (
                <p className="text-sm text-muted-foreground">{share.counterparty.name}</p>
              )}
            </div>

            {/* Status and sections */}
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline" className="flex items-center gap-2">
                {statusIcon[share.status as keyof typeof statusIcon]}
                {statusLabel[share.status as keyof typeof statusLabel]}
              </Badge>
              {share.sections.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {share.sections.length} of 7 sections
                </span>
              )}
            </div>

            {/* Dates */}
            <div className="text-xs text-muted-foreground space-y-1">
              {share.createdAt && (
                <div>
                  {FAMILY_STRINGS.sharing_list_created_at}:{" "}
                  {new Date(share.createdAt).toLocaleDateString()}
                </div>
              )}
              {share.acceptedAt && (
                <div>
                  {FAMILY_STRINGS.sharing_list_accepted_at}:{" "}
                  {new Date(share.acceptedAt).toLocaleDateString()}
                </div>
              )}
              {share.lastViewedAt && (
                <div>
                  {FAMILY_STRINGS.sharing_list_last_viewed}:{" "}
                  {new Date(share.lastViewedAt).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Must share back info */}
            {share.mustShareBack && (
              <div className="text-xs text-blue-600 font-medium">
                Must share back: {share.requiredBackSections?.join(", ") || "all sections"}
              </div>
            )}

            {/* Re-consent required */}
            {share.reconsentRequired && (
              <div className="text-xs text-amber-600 font-medium">
                Changes require approval: {share.reconsentSections?.join(", ")}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDecline(share.id)}
                >
                  {FAMILY_STRINGS.sharing_list_decline}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onAccept(share.id)}
                >
                  {FAMILY_STRINGS.sharing_list_accept}
                </Button>
              </>
            )}
            {isActive && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className="h-8 w-8 p-0" />}>
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {role === "owner" && (
                    <>
                      <DropdownMenuItem onClick={() => {}}>
                        {FAMILY_STRINGS.sharing_list_edit_sections}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {role === "owner" && (
                    <DropdownMenuItem onClick={() => {}}>
                      {FAMILY_STRINGS.sharing_list_resend}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onRevoke(share.id)}
                    className="text-red-600"
                  >
                    {FAMILY_STRINGS.sharing_list_revoke}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
