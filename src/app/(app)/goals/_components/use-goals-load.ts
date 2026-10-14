"use client";

import { useMemo } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import type { Goal } from "./goal-form";
import { usePendingEntity } from "@/lib/data/local-write-queue";
import { overlayRows } from "@/lib/data/local-write-queue";

/** Queued goal edits over the server rows (fields the offline queue writes). */
function goalPatch(f: Record<string, string | number | null>): Partial<Goal> {
  const p: Record<string, unknown> = {};
  if (f.name !== undefined && f.name !== null) p.name = String(f.name);
  if (f.type !== undefined && f.type !== null) p.type = String(f.type);
  if (f.targetAmount !== undefined && f.targetAmount !== null) p.targetAmount = Number(f.targetAmount);
  if (f.currency !== undefined && f.currency !== null) p.currency = String(f.currency);
  if (f.deadline !== undefined) p.deadline = f.deadline === null || f.deadline === "" ? null : String(f.deadline);
  if (f.priority !== undefined && f.priority !== null) p.priority = Number(f.priority);
  if (f.note !== undefined) p.note = f.note === null ? "" : String(f.note);
  return p as Partial<Goal>;
}

/** A goal created on this device and not yet synced, as a list row. */
function goalOfCreate(c: { fields: Record<string, string | number | null> }, id: number): Goal {
  const f = c.fields;
  return {
    id,
    name: String(f.name ?? ""),
    type: String(f.type ?? ""),
    targetAmount: Number(f.targetAmount ?? 0),
    currentAmount: 0,
    currency: String(f.currency ?? ""),
    deadline: f.deadline ? String(f.deadline) : null,
    accountIds: [],
    accounts: [],
    accountName: null,
    priority: Number(f.priority ?? 1),
    status: String(f.status ?? "active"),
    progress: 0,
    remaining: Number(f.targetAmount ?? 0),
    monthlyNeeded: 0,
    note: f.note ? String(f.note) : "",
  };
}

/** Goals list data, cache-first. A reload (retry, status toggle, delete) refetches in place. */
export function useGoalsLoad(): LoadState<Goal[]> {
  // Cache-first: a revisit paints the last goals at once and revalidates in the background.
  const res = useCacheFirstJson<Goal[]>("/api/goals");
  const goals = useMemo<Goal[]>(() => (Array.isArray(res.data) ? res.data : []), [res.data]);
  const load = res.reload;

  // Offline queue (local-first L3): queued goal changes over the server rows. Flag off = the rows as they are.
  const pending = usePendingEntity("goal", load);
  const record = useMemo(() => overlayRows(goals, pending, { patchOf: goalPatch, rowOfCreate: goalOfCreate }), [goals, pending]);

  const status: LoadStatus = res.loading ? "loading" : res.error ? "error" : "ready";
  return { status, record, retry: load };
}
