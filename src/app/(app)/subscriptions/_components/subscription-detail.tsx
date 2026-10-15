"use client";

/**
 * SubscriptionDetail: THE subscription detail content (amount, status, next payments, fields, pause / cancel / reminder, post now).
 * The /subscriptions split view renders it in the pane (one narrow column); /subscriptions/[id] renders it inside DetailPage.
 * Editing and deleting live in the subscription form (SubscriptionFormPanel), which the pane header's Edit opens.
 * No chart: /api/subscriptions/series is the TOTAL of all subscriptions, and no per-subscription history exists.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/error-state";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useDisplayCurrency } from "@/components/currency-provider";
import { formatCurrency, formatDate } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { localDateISO } from "@/lib/utils/date";
import { DetailList, usePaneTitle, type DetailItem } from "@/components/mobile";
import { addDays, daysBetween, frequencyLabel, frequencyOrMonthly, frequencySuffix, monthlyEquivalent } from "@/lib/subscriptions/schedule";
import { buildScheduleEvents, effectiveNextDate, subDisplayAmount } from "@/lib/subscriptions/calendar-events";
import { dueSubscriptions, postNowHref, skipOccurrence } from "@/lib/subscriptions/due";
import type { Subscription } from "./types";

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paused: { label: "Paused", className: "bg-warning/10 text-warning border-warning/30" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/30" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground border-border" },
};

/** An active subscription with an occurrence on/before today (server-computed). */
export function isDue(sub: Subscription): boolean {
  return dueSubscriptions([sub]).length > 0;
}

export function dueLabel(sub: Subscription): string {
  const n = sub.dueCount ?? 0;
  return n > 1 ? `${n} due` : "Due";
}

/** "today" / "tomorrow" / "in 5 days" for near dates, else null. */
export function relativeDue(date: string, today: string): string | null {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1 && d <= 14) return `in ${d} days`;
  return null;
}

/** Post now / Skip for a due subscription (Repeat + Installment phase 2a). */
export function DueActions({ sub, busy, onPost, onSkip }: { sub: Subscription; busy: boolean; onPost: () => void; onSkip: () => void }) {
  return (
    <>
      <Button size="sm" data-testid={`sub-post-${sub.id}`} disabled={busy} onClick={onPost}>
        Post now
      </Button>
      <Button size="sm" variant="ghost" data-testid={`sub-skip-${sub.id}`} disabled={busy} onClick={onSkip}>
        Skip
      </Button>
    </>
  );
}

/** Fields a list row leaves out. Money is in the subscription's own currency; the monthly figure in the display one. */
export function subDetailItems(sub: Subscription, today: string, displayCurrency: string): DetailItem[] {
  const freq = frequencyOrMonthly(sub.frequency);
  const next = effectiveNextDate(sub, today);
  const rel = next && sub.status === "active" ? relativeDue(next, today) : null;
  const monthly = monthlyEquivalent(Math.abs(subDisplayAmount(sub)), freq, sub.intervalDays);
  const showMonthly = freq !== "monthly" || sub.currency !== displayCurrency;
  const items: DetailItem[] = [
    { label: "Amount", value: `${formatCurrency(sub.amount, sub.currency)} / ${frequencySuffix(sub.frequency, sub.intervalDays)}` },
    { label: "Frequency", value: frequencyLabel(sub.frequency, sub.intervalDays) },
  ];
  if (showMonthly) items.push({ label: "Monthly equivalent", value: `≈ ${formatCurrency(monthly, displayCurrency)}` });
  items.push({
    label: "Next payment",
    value: sub.status === "active" && next ? `${formatDate(next)}${rel ? ` (${rel})` : ""}` : "—",
  });
  if (sub.cancelReminderDate) items.push({ label: "Cancel reminder", value: formatDate(sub.cancelReminderDate) });
  items.push({ label: "Account", value: sub.accountName ?? "—" });
  items.push({ label: "Category", value: sub.categoryName ?? "—" });
  return items;
}

/**
 * Reminder / pause / cancel / resume buttons of one subscription (PUT /api/subscriptions). The phone sheet and the detail share
 * them; `before` runs first (the sheet closes itself), `onChanged` after a successful change.
 */
export function SubscriptionStatusActions({ sub, today, before, onChanged }: { sub: Subscription; today: string; before?: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function put(body: Record<string, unknown>, fallback: string) {
    before?.();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sub.id, ...body }) });
      if (!res.ok) setError(await parseSaveError(res, fallback));
      else onChanged();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const toggleReminder = () => {
    let cancelReminderDate: string | null = null;
    if (!sub.cancelReminderDate) {
      // Default: a week before the next payment (or a week from today).
      const next = effectiveNextDate(sub, today);
      const candidate = next ? addDays(next, -7) : addDays(today, 7);
      cancelReminderDate = candidate < today ? today : candidate;
    }
    return put({ cancelReminderDate }, "Couldn't update the reminder");
  };
  const setStatus = (status: string) => put({ status }, "Couldn't update the subscription");
  return (
    <>
      {sub.status === "active" && (
        <>
          <Button variant="outline" disabled={busy} onClick={toggleReminder}>
            {sub.cancelReminderDate ? <><BellOff className="h-4 w-4" /> Remove cancel reminder</> : <><Bell className="h-4 w-4" /> Remind me to cancel</>}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setStatus("paused")}>
            <Pause className="h-4 w-4" /> Pause
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setStatus("cancelled")}>
            <XCircle className="h-4 w-4" /> Mark cancelled
          </Button>
        </>
      )}
      {sub.status === "paused" && (
        <Button variant="outline" disabled={busy} onClick={() => setStatus("active")}>
          <Play className="h-4 w-4" /> Resume
        </Button>
      )}
      {(sub.status === "cancelled" || sub.status === "ended") && (
        <Button variant="outline" disabled={busy} onClick={() => setStatus("active")}>
          <RotateCcw className="h-4 w-4" /> Reactivate
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}

const UPCOMING = 5;

/**
 * The detail content of one subscription (the pane renders it directly; /subscriptions/[id] wraps it in DetailPage, which owns
 * the header). `onChanged` reloads the host list after a status change.
 */
export function SubscriptionDetail({ id: idProp, onChanged }: { id: string | number; onChanged?: () => void }) {
  const id = Number(idProp);
  const router = useRouter();
  const { displayCurrency: ctxCurrency } = useDisplayCurrency();
  const { data, loading, error, reload } = useCacheFirstJson<Subscription[]>("/api/subscriptions");
  const sub = useMemo(() => (Array.isArray(data) ? data.find((s) => s.id === id) ?? null : null), [data, id]);
  const today = localDateISO();
  const [skipping, setSkipping] = useState(false);
  usePaneTitle(sub?.name);

  const upcoming = useMemo(
    () => (sub && sub.status === "active" ? buildScheduleEvents([sub], [], today, addDays(today, 800)).slice(0, UPCOMING) : []),
    [sub, today],
  );

  if (!sub) {
    return loading
      ? <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-shimmer rounded-xl" />)}</div>
      : (
        <ErrorState
          title={error ? "Couldn't load subscription" : "Subscription not found"}
          message={error ? "We couldn't load this subscription. Please try again." : "This subscription doesn't exist, or it isn't one of yours."}
        />
      );
  }

  const displayCurrency = sub.displayCurrency ?? ctxCurrency;
  const statusBadge = STATUS_BADGE[sub.status];
  const due = isDue(sub);
  const changed = () => { reload(); onChanged?.(); };
  const returnTo = `/subscriptions?sel=${sub.id}`;

  return (
    <div className="w-full space-y-4" data-testid="subscription-detail-root">
      <div className="flex max-w-full flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">{frequencyLabel(sub.frequency, sub.intervalDays)}</Badge>
        {statusBadge ? <Badge className={statusBadge.className}>{statusBadge.label}</Badge> : null}
        {due ? <Badge className="bg-warning/10 text-warning border-warning/30">{dueLabel(sub)}</Badge> : null}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Per {frequencySuffix(sub.frequency, sub.intervalDays)}</p>
        <p className="text-xl font-semibold tabular-nums">{formatCurrency(Math.abs(sub.amount), sub.currency)}</p>
      </div>
      {due && sub.nextDate ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <DueActions
            sub={sub}
            busy={skipping}
            onPost={() => router.push(postNowHref(sub.id, sub.nextDate as string, returnTo))}
            onSkip={async () => {
              setSkipping(true);
              try { if ((await skipOccurrence(sub.id, sub.nextDate as string)).ok) changed(); } finally { setSkipping(false); }
            }}
          />
        </div>
      ) : null}
      <DetailList items={subDetailItems(sub, today, displayCurrency)} />
      {upcoming.length > 0 && (
        <section className="space-y-1" data-testid="subscription-upcoming">
          <h3 className="text-sm font-medium text-muted-foreground">Next payments</h3>
          <DetailList items={upcoming.map((e) => ({ label: formatDate(e.date), value: formatCurrency(e.amount, e.currency) }))} />
        </section>
      )}
      <div className="flex flex-col gap-2">
        <SubscriptionStatusActions sub={sub} today={today} onChanged={changed} />
      </div>
    </div>
  );
}
