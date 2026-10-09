"use client";

/**
 * ManageGroupsPanel — rename / reorder / merge-into-Other account groups
 * (FINLYNQ-179). Body of the /accounts/groups page.
 *
 * Groups are scoped per account type (A=Asset, L=Liability). The caller passes
 * the live group names per type; the saved display order comes from
 * /api/settings/account-group-order.
 *
 *  - Rename  → owner-scoped bulk UPDATE via PATCH /api/accounts/groups
 *  - Merge   → same PATCH with to:"Other" (gated behind ConfirmDialog)
 *  - Reorder → move up/down persisted via PUT /api/settings/account-group-order
 *
 * "Other" is the catch-all bucket and is not itself renamable/mergeable/movable.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/mobile";
import {
  OTHER_GROUP,
  orderGroups,
  parseGroupOrder,
  type AccountGroupOrder,
  type AccountGroupType,
} from "@/lib/accounts/groups";
import { ArrowDown, ArrowUp, Check, Merge, MoreHorizontal, Pencil, X } from "lucide-react";

const TYPE_LABELS: Record<AccountGroupType, string> = {
  A: "Asset groups",
  L: "Liability groups",
};

export function ManageGroupsPanel({
  groupsByType,
  onChanged,
}: {
  /** Map of account type → the group names currently in use for that type. */
  groupsByType: Record<AccountGroupType, string[]>;
  onChanged: () => void;
}) {
  const [savedOrder, setSavedOrder] = useState<AccountGroupOrder>({ A: [], L: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Inline rename state
  const [editing, setEditing] = useState<{ type: AccountGroupType; name: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // Merge-into-Other confirm
  const [mergeTarget, setMergeTarget] = useState<{ type: AccountGroupType; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/account-group-order")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.order) setSavedOrder(parseGroupOrder(JSON.stringify(d.order)));
      })
      .catch(() => {});
  }, []);

  const ordered = useMemo(() => {
    const forType = (t: AccountGroupType) =>
      orderGroups(groupsByType[t] ?? [], savedOrder[t] ?? []);
    return { A: forType("A"), L: forType("L") };
  }, [groupsByType, savedOrder]);

  async function persistOrder(next: AccountGroupOrder) {
    setSavedOrder(next);
    try {
      await fetch("/api/settings/account-group-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      });
    } catch {
      // Non-fatal — local order already applied; surface a soft error.
      setError("Couldn't save the new order — it may not persist on reload.");
    }
  }

  // Move a group up/down within its type. We persist the FULL ordered list for
  // that type (excluding "Other", which is always sunk last) so the saved order
  // is self-describing even for groups that didn't have an explicit rank.
  function move(type: AccountGroupType, name: string, dir: -1 | 1) {
    const list = ordered[type].filter((g) => g.toLowerCase() !== OTHER_GROUP.toLowerCase());
    const i = list.findIndex((g) => g.toLowerCase() === name.toLowerCase());
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void persistOrder({ ...savedOrder, [type]: list });
  }

  async function renameGroup(type: AccountGroupType, from: string, to: string) {
    const target = to.trim();
    if (!target || target.toLowerCase() === from.toLowerCase()) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/accounts/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: target, type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Failed to rename group");
        return;
      }
      // Carry the saved order entry over to the new name so order survives.
      const list = (savedOrder[type] ?? []).map((g) =>
        g.toLowerCase() === from.toLowerCase() ? target : g,
      );
      await persistOrder({ ...savedOrder, [type]: list });
      setEditing(null);
      onChanged();
    } catch {
      setError("Failed to rename group");
    } finally {
      setBusy(false);
    }
  }

  async function mergeIntoOther(type: AccountGroupType, name: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/accounts/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: name, to: OTHER_GROUP, type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Failed to merge group");
        return;
      }
      const list = (savedOrder[type] ?? []).filter(
        (g) => g.toLowerCase() !== name.toLowerCase(),
      );
      await persistOrder({ ...savedOrder, [type]: list });
      setMergeTarget(null);
      onChanged();
    } catch {
      setError("Failed to merge group");
    } finally {
      setBusy(false);
    }
  }

  function startRename(type: AccountGroupType, name: string) {
    setEditing({ type, name });
    setEditValue(name);
  }

  function renderRow(type: AccountGroupType, g: string, movable: string[]) {
    const isOther = g.toLowerCase() === OTHER_GROUP.toLowerCase();
    const isEditing = editing?.type === type && editing?.name === g;
    const movableIndex = movable.findIndex((m) => m.toLowerCase() === g.toLowerCase());

    if (isEditing) {
      return (
        <li key={g} className="flex min-h-11 items-center gap-2 px-4 py-1.5">
          <Input
            value={editValue}
            aria-label={`New name for ${g}`}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-9 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void renameGroup(type, g, editValue);
              } else if (e.key === "Escape") {
                setEditing(null);
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            disabled={busy}
            title="Save"
            aria-label="Save group name"
            onClick={() => void renameGroup(type, g, editValue)}
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            title="Cancel"
            aria-label="Cancel rename"
            onClick={() => setEditing(null)}
          >
            <X className="size-4" />
          </Button>
        </li>
      );
    }

    return (
      <li key={g} className="flex min-h-11 items-center gap-2 pl-4 pr-1">
        <span className="min-w-0 flex-1 truncate py-2.5 text-base md:text-sm">{g}</span>
        {!isOther && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground md:size-8"
                  disabled={busy}
                  aria-label={`Actions for ${g}`}
                  title="Group actions"
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-48">
              <DropdownMenuItem
                disabled={busy || movableIndex <= 0}
                onClick={() => move(type, g, -1)}
              >
                <ArrowUp className="size-4" aria-hidden />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy || movableIndex < 0 || movableIndex >= movable.length - 1}
                onClick={() => move(type, g, 1)}
              >
                <ArrowDown className="size-4" aria-hidden />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => startRename(type, g)}>
                <Pencil className="size-4" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onClick={() => setMergeTarget({ type, name: g })}
              >
                <Merge className="size-4" aria-hidden />
                Merge into Other
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    );
  }

  function renderType(type: AccountGroupType) {
    const list = ordered[type];
    const movable = list.filter((g) => g.toLowerCase() !== OTHER_GROUP.toLowerCase());
    return (
      <SectionCard label={TYPE_LABELS[type]} padded={false} data-slot={`manage-groups-${type}`}>
        {list.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No groups in use yet.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {list.map((g) => renderRow(type, g, movable))}
          </ul>
        )}
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {renderType("A")}
      {renderType("L")}
      <p className="px-1 text-sm text-muted-foreground">
        Rename a group across all its accounts, reorder how groups appear, or merge a group into
        &quot;Other&quot;. Groups are kept separate for assets and liabilities.
      </p>
      {error && (
        <p role="alert" className="px-1 text-sm text-destructive">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={mergeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setMergeTarget(null);
        }}
        title="Merge into Other"
        description={
          mergeTarget
            ? `Move every account in "${mergeTarget.name}" into "Other"? This can't be undone automatically, but you can rename the accounts back later.`
            : ""
        }
        confirmLabel="Merge"
        busyLabel="Merging…"
        busy={busy}
        onConfirm={() => {
          if (mergeTarget) void mergeIntoOther(mergeTarget.type, mergeTarget.name);
        }}
      />
    </div>
  );
}
