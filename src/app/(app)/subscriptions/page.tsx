"use client";

/**
 * Subscriptions — ONE page for recurring payments (2026-10).
 *
 * Merges the old dev-mode-only Subscriptions list and Bill Calendar pages:
 *   - List view: tracked subscriptions grouped by status, plus recurring
 *     payments detected in the user's transactions that aren't tracked yet
 *     (one-click "Track").
 *   - Calendar view: every projected payment for a month — tracked
 *     subscriptions, untracked detected bills and expected income.
 * Both views read the same pure builders (lib/subscriptions/calendar-events.ts)
 * and schedule math (lib/subscriptions/schedule.ts), so a total in one view
 * can't disagree with the other. `/calendar` redirects to `?view=calendar`.
 *
 * One layout at every size: the list is inset ListRows in SectionCards (no table);
 * a row opens a DetailSheet with the fields and the actions.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { SUBSCRIPTION_FILTER_KEYS, SUBSCRIPTION_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { DetailSheet, ListRow, MetricGrid, SectionCard, ListDetailLayout, useListDetail, type DetailItem } from "@/components/mobile";
import { SubscriptionFormPanel } from "./_components/subscription-form-panel";
import { SectionPage } from "@/components/templates/section-page";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { CARD_ROW_GRID } from "@/components/mobile/section-card";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { useDisplayCurrency } from "@/components/currency-provider";
import { formatCurrency, formatDate } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { localDateISO } from "@/lib/utils/date";
import {
  FREQUENCY_SUFFIX,
  frequencyLabel,
  frequencySuffix,
  addDays,
  daysBetween,
  frequencyOrMonthly,
  monthlyEquivalent,
  rollForwardNextDate,
} from "@/lib/subscriptions/schedule";
import {
  detectedSuggestions,
  effectiveNextDate,
  subDisplayAmount,
  subscriptionTotals,
  type RecurringRow,
} from "@/lib/subscriptions/calendar-events";
import { EMPTY_DRAFT, type SubscriptionDraft } from "./_components/subscription-form";
import { dueSubscriptions, postNowHref, skipOccurrence } from "@/lib/subscriptions/due";
import { draftSearchParams } from "./_components/draft-params";
import { SubscriptionsCalendar } from "./_components/subscriptions-calendar";
import type { Subscription } from "./_components/types";
import { Bell, BellOff, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, CreditCard, List, Pause, Pencil, Play, Plus, Repeat, RotateCcw, Search, Sparkles, Trash2, XCircle } from "lucide-react";

type View = "list" | "calendar";

const SUGGESTIONS_PREVIEW = 3;
const DUE_SOON_DAYS = 30;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paused: {
    label: "Paused",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  ended: {
    label: "Ended",
    className: "bg-muted text-muted-foreground border-border",
  },
};

/** An active subscription with an occurrence on/before today (server-computed). */
function isDue(sub: Subscription): boolean {
  return dueSubscriptions([sub]).length > 0;
}

function dueLabel(sub: Subscription): string {
  const n = sub.dueCount ?? 0;
  return n > 1 ? `${n} due` : "Due";
}

/** Post now / Skip for a due subscription (Repeat + Installment phase 2a). */
function DueActions({ sub, busy, onPost, onSkip }: { sub: Subscription; busy: boolean; onPost: () => void; onSkip: () => void }) {
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

/** "today" / "tomorrow" / "in 5 days" for near dates, else null. */
function relativeDue(date: string, today: string): string | null {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1 && d <= 14) return `in ${d} days`;
  return null;
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" rows={5} />}>
      <SubscriptionsPageContent />
    </Suspense>
  );
}

function SubscriptionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Split view (regular+): a row opens the edit form in the pane (?sel=<id>); phones keep the sheet / edit route.
  const detail = useListDetail();
  const view: View = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const { displayCurrency: ctxCurrency } = useDisplayCurrency();

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Toolbar: search, filter page (status) and sort (next payment, name, monthly cost).
  const tb = useListToolbar({ filterPath: "/filter/subscriptions", sorts: SUBSCRIPTION_SORTS, filterKeys: SUBSCRIPTION_FILTER_KEYS });
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [openSubId, setOpenSubId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const today = localDateISO();

  const loadSubs = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/subscriptions");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setSubs(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Detection is a nice-to-have on top of the tracked list: a failure here
  // just means no suggestions / no projected income, never a page error.
  const loadRecurring = useCallback(async () => {
    try {
      const res = await fetch("/api/recurring");
      if (!res.ok) return;
      const data = await res.json();
      setRecurring(Array.isArray(data?.recurring) ? data.recurring : []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadSubs();
    loadRecurring();
  }, [loadSubs, loadRecurring]);

  function setView(next: View) {
    router.replace(next === "calendar" ? "/subscriptions?view=calendar" : "/subscriptions", { scroll: false });
  }

  // Totals are in the currency the server converted into (FINLYNQ-123).
  const displayCurrency = subs.find((s) => s.displayCurrency)?.displayCurrency ?? ctxCurrency;
  const totals = useMemo(
    () => subscriptionTotals(subs, today, addDays(today, DUE_SOON_DAYS)),
    [subs, today],
  );
  const suggestions = useMemo(() => detectedSuggestions(recurring, subs), [recurring, subs]);

  const sorted = useMemo(() => {
    const monthlyCost = (s: Subscription) => monthlyEquivalent(Math.abs(subDisplayAmount(s)), s.frequency, s.intervalDays);
    const needle = tb.q.trim().toLowerCase();
    return sortRecords(
      subs.filter((s) => (!tb.filters.status || s.status === tb.filters.status) && (!needle || (s.name ?? "").toLowerCase().includes(needle))),
      tb.sort,
      { date: (s) => effectiveNextDate(s, today) ?? "9999-12-31", name: (s) => s.name, amount: monthlyCost },
    );
  }, [subs, tb.q, tb.filters, tb.sort, today]);

  const groups: { key: string; title: string; rows: Subscription[] }[] = [
    { key: "active", title: "Active", rows: sorted.filter((s) => s.status === "active") },
    { key: "paused", title: "Paused", rows: sorted.filter((s) => s.status === "paused") },
    { key: "cancelled", title: "Cancelled", rows: sorted.filter((s) => s.status === "cancelled") },
    { key: "ended", title: "Ended", rows: sorted.filter((s) => s.status === "ended") },
  ];

  // ── navigation (create / edit are full pages, not dialogs) ─────────────────
  const LIST_HREF = "/subscriptions";
  function openAdd() {
    if (detail.split) detail.selectNew();
    else router.push("/subscriptions/new");
  }

  function openEditById(id: number) {
    if (detail.split) {
      detail.select(id);
      return;
    }
    router.push(`/subscriptions/${id}/edit?returnTo=${encodeURIComponent(view === "calendar" ? "/subscriptions?view=calendar" : LIST_HREF)}`);
  }

  function draftFromDetected(r: RecurringRow): SubscriptionDraft {
    const frequency = frequencyOrMonthly(r.frequency);
    return {
      ...EMPTY_DRAFT,
      name: r.payee,
      amount: String(Math.abs(r.avgAmount)),
      currency: r.currency,
      frequency,
      nextDate: rollForwardNextDate(r.nextDate, frequency, today) ?? "",
      accountId: r.accountId ? String(r.accountId) : "",
      categoryId: r.categoryId ? String(r.categoryId) : "",
    };
  }

  function reviewDetected(r: RecurringRow) {
    router.push(draftSearchParams(draftFromDetected(r), LIST_HREF));
  }

  // ── mutations (each: in-flight guard, try/catch, res.ok) ───────────────────
  async function mutate(key: string, run: () => Promise<Response>, fallback: string): Promise<boolean> {
    if (busyKey) return false;
    setBusyKey(key);
    setActionError("");
    try {
      const res = await run();
      if (!res.ok) {
        setActionError(await parseSaveError(res, fallback));
        return false;
      }
      await loadSubs();
      return true;
    } catch {
      setActionError("Network error. Please try again.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  const putSub = (body: Record<string, unknown>) =>
    fetch("/api/subscriptions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function trackDetected(r: RecurringRow) {
    const d = draftFromDetected(r);
    return mutate(
      `track:${r.payee}|${r.currency}`,
      () =>
        fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: d.name,
            amount: Math.abs(r.avgAmount),
            // Carry the detected native currency (feedback #7).
            currency: r.currency,
            frequency: d.frequency,
            nextDate: d.nextDate || null,
            accountId: r.accountId || null,
            categoryId: r.categoryId || null,
          }),
        }),
      `Couldn't add ${r.payee}`,
    );
  }

  // Post now: the entry screen prefilled from the subscription (date = the due date).
  function postNow(sub: Subscription) {
    if (!sub.nextDate) return;
    router.push(postNowHref(sub.id, sub.nextDate, LIST_HREF));
  }

  // Skip: advance one occurrence without booking a transaction.
  function skipDue(sub: Subscription) {
    if (!sub.nextDate) return Promise.resolve(false);
    const occurrence = sub.nextDate;
    return mutate(`skip:${sub.id}`, () => skipOccurrence(sub.id, occurrence), "Couldn't skip this payment");
  }

  function changeStatus(sub: Subscription, status: string) {
    return mutate(`status:${sub.id}`, () => putSub({ id: sub.id, status }), "Couldn't update the subscription");
  }

  function toggleReminder(sub: Subscription) {
    let cancelReminderDate: string | null = null;
    if (!sub.cancelReminderDate) {
      // Default: a week before the next payment (or a week from today).
      const next = effectiveNextDate(sub, today);
      const candidate = next ? addDays(next, -7) : addDays(today, 7);
      cancelReminderDate = candidate < today ? today : candidate;
    }
    return mutate(`reminder:${sub.id}`, () => putSub({ id: sub.id, cancelReminderDate }), "Couldn't update the reminder");
  }

  async function handleDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    const ok = await mutate(`delete:${deleteId}`, () => fetch(`/api/subscriptions?id=${deleteId}`, { method: "DELETE" }), "Couldn't delete the subscription");
    setDeleting(false);
    if (ok) setDeleteId(null);
  }

  const deletingSub = subs.find((s) => s.id === deleteId) ?? null;

  if (loading) return <PageSkeleton variant="list" rows={5} />;
  if (loadError) {
    return (
      <ErrorState
        title="Couldn't load subscriptions"
        message="We couldn't load your subscriptions. Please try again."
        onRetry={() => { setLoading(true); loadSubs(); loadRecurring(); }}
      />
    );
  }

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, SUGGESTIONS_PREVIEW);
  const openSub = subs.find((s) => s.id === openSubId) ?? null;
  const closeSheet = () => setOpenSubId(null);

  /** Reminder / pause / cancel / resume buttons for one subscription (the phone sheet and the split pane share them). */
  function statusActions(sub: Subscription, before: () => void) {
    const openSub = sub;
    const closeSheet = before;
    return (
      <>
        {openSub.status === "active" && (
            <>
              <Button variant="outline" disabled={busyKey !== null} onClick={() => { closeSheet(); toggleReminder(openSub); }}>
              {openSub.cancelReminderDate ? <><BellOff className="h-4 w-4" /> Remove cancel reminder</> : <><Bell className="h-4 w-4" /> Remind me to cancel</>}
              </Button>
              <Button variant="outline" disabled={busyKey !== null} onClick={() => { closeSheet(); changeStatus(openSub, "paused"); }}>
                <Pause className="h-4 w-4" /> Pause
              </Button>
              <Button variant="outline" disabled={busyKey !== null} onClick={() => { closeSheet(); changeStatus(openSub, "cancelled"); }}>
                <XCircle className="h-4 w-4" /> Mark cancelled
              </Button>
            </>
          )}
        {openSub.status === "paused" && (
            <Button variant="outline" disabled={busyKey !== null} onClick={() => { closeSheet(); changeStatus(openSub, "active"); }}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {(openSub.status === "cancelled" || openSub.status === "ended") && (
            <Button variant="outline" disabled={busyKey !== null} onClick={() => { closeSheet(); changeStatus(openSub, "active"); }}>
              <RotateCcw className="h-4 w-4" /> Reactivate
            </Button>
          )}
      </>
    );
  }


  return (
    <SectionPage
      id="subscriptions"
      title="Subscriptions"
      subtitle="Recurring bills and subscriptions: what they cost and when they're due."
      width="report"
      center
      header={{
        filter: view === "list" ? { href: tb.filterHref, activeCount: tb.activeCount } : undefined,
        actions: (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add subscription
          </Button>
        ),
      }}
    >
      <MetricGrid
        metrics={[
          { icon: CalendarClock, label: "Per month", value: totals.monthly, currency: displayCurrency, sub: `${totals.activeCount} active subscription${totals.activeCount === 1 ? "" : "s"}` },
          { icon: CalendarRange, label: "Per year", value: totals.annual, currency: displayCurrency, sub: "Annualised" },
          { icon: CalendarClock,
            label: `Due in next ${DUE_SOON_DAYS} days`,
            value: totals.dueSoonAmount,
            currency: displayCurrency,
            sub: `${totals.dueSoonCount} payment${totals.dueSoonCount === 1 ? "" : "s"}`,
          },
          { icon: CheckCircle2, label: "Active", value: String(totals.activeCount), sub: `of ${subs.length} tracked` },
        ]}
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {/* View switch + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView((v as View) ?? "list")}>
          <TabsList>
            <TabsTrigger value="list" className="px-3"><List className="h-4 w-4" /> List</TabsTrigger>
            <TabsTrigger value="calendar" className="px-3"><CalendarDays className="h-4 w-4" /> Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "list" && subs.length > 1 && (
          <PageToolbar
            className="w-auto flex-1 justify-end"
            search={{ value: tb.q, onChange: tb.setQ, placeholder: "Search subscriptions" }}
          />
        )}
      </div>

      <ListDetailLayout
        entity="subscription"
        newLabel="Add subscription"
        list={
          <>
              {view === "calendar" ? (
                <SubscriptionsCalendar
                  subs={subs}
                  recurring={recurring}
                  displayCurrency={displayCurrency}
                  onEdit={openEditById}
                  onTrack={trackDetected}
                />
              ) : (
                <div data-slot="subscription-groups" className="grid grid-cols-1 gap-6">
                  {/* Detected from transactions */}
                  {suggestions.length > 0 && (
                    <SectionCard label="Found in your transactions" icon={Search} tone="cyan" padded={false} className="col-span-full px-3">
                      <p className="px-1 pt-3 pb-1 text-sm text-muted-foreground">
                        {suggestions.length === 1
                          ? "1 payment repeats on a schedule but isn't tracked yet."
                          : `${suggestions.length} payments repeat on a schedule but aren't tracked yet.`}
                      </p>
                      <div className={`[&>*:not(:last-child)]:shadow-[var(--list-divider)] ${CARD_ROW_GRID}`}>
                        {visibleSuggestions.map((r) => {
                          const key = `track:${r.payee}|${r.currency}`;
                          const freq = frequencyOrMonthly(r.frequency);
                          return (
                            <div key={`${r.payee}|${r.currency}`}>
                              <ListRow
                                icon={Sparkles}
                                title={r.payee}
                                subtitle={`${formatCurrency(Math.abs(r.avgAmount), r.currency)} / ${FREQUENCY_SUFFIX[freq]} · seen ${r.count}× · last ${formatDate(r.lastDate)}`}
                                chevron={false}
                              />
                              <div className="flex items-center gap-1.5 pb-3 pl-12">
                                <Button variant="ghost" size="sm" onClick={() => reviewDetected(r)}>Review</Button>
                                <Button size="sm" onClick={() => trackDetected(r)} disabled={busyKey !== null}>
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  {busyKey === key ? "Adding…" : "Track"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {suggestions.length > SUGGESTIONS_PREVIEW && (
                        <Button variant="link" size="sm" className="px-1 pb-3" onClick={() => setShowAllSuggestions((v) => !v)}>
                          {showAllSuggestions ? "Show fewer" : `Show all ${suggestions.length}`}
                        </Button>
                      )}
                    </SectionCard>
                  )}

                  {subs.length === 0 && (
                    <Card className="col-span-full"><CardContent className="p-0"><EmptyState
                      icon={CreditCard}
                      title="No subscriptions tracked yet"
                      description="Add streaming services, insurance, memberships and other repeating bills (weekly to annual) to see what they cost you and when each one is due."
                      action={{ label: "Add subscription", onClick: openAdd }}
                    /></CardContent></Card>
                  )}

                  {/* One inset list per status group, in the sort order chosen above. */}
                  {groups.map((g) =>
                    g.rows.length === 0 ? null : (
                      <SectionCard key={g.key} label={`${g.title} (${g.rows.length})`} icon={Repeat} tone="indigo" padded={false} className={`col-span-full [&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3 ${CARD_ROW_GRID}`}>
                        {g.rows.map((sub) => (
                          <SubscriptionRow
                            key={sub.id}
                            sub={sub}
                            today={today}
                            displayCurrency={displayCurrency}
                            busy={busyKey !== null}
                            selected={detail.selectedId === String(sub.id)}
                            onOpen={() => (detail.split ? detail.select(sub.id) : setOpenSubId(sub.id))}
                            onPost={() => postNow(sub)}
                            onSkip={() => skipDue(sub)}
                          />
                        ))}
                      </SectionCard>
                    ),
                  )}
                </div>
              )}
          </>
        }
        pane={(api) => {
          const open = subs.find((x) => String(x.id) === api.selectedId) ?? null;
          return (
            <div className="space-y-3">
              {open && (
                <div className="flex flex-wrap gap-2" data-slot="subscription-status-actions">
                  {statusActions(open, () => undefined)}
                </div>
              )}
              <SubscriptionFormPanel
                embedded
                mode={api.isNew ? "create" : "edit"}
                id={api.selectedId ?? undefined}
                onSaved={() => { loadSubs(); api.afterSaved(); }}
                onCancel={api.clear}
                onDeleted={() => { loadSubs(); api.afterDeleted(); }}
              />
            </div>
          );
        }}
      />

      {openSub && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) closeSheet(); }}
          title={openSub.name ?? "Subscription"}
          description={STATUS_BADGE[openSub.status]?.label ?? "Active"}
          items={subDetailItems(openSub, today, displayCurrency)}
        >
          <Button variant="outline" onClick={() => { closeSheet(); openEditById(openSub.id); }}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {statusActions(openSub, closeSheet)}
          <Button variant="outline" className="text-destructive" onClick={() => { closeSheet(); setDeleteId(openSub.id); }}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DetailSheet>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}
        title="Delete subscription"
        description={<>Delete <strong>{deletingSub?.name ?? "this subscription"}</strong>? Your transactions are not affected. This cannot be undone.</>}
        confirmLabel="Delete subscription"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </SectionPage>
  );
}

/** Fields a list row leaves out. Money is in the subscription's own currency; the monthly figure in the display one. */
function subDetailItems(sub: Subscription, today: string, displayCurrency: string): DetailItem[] {
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

/** One subscription in a status group: tap opens the detail sheet; due payments get their actions under the row. */
function SubscriptionRow({
  sub,
  today,
  displayCurrency,
  busy,
  onOpen,
  onPost,
  onSkip,
  selected,
}: {
  selected?: boolean;
  sub: Subscription;
  today: string;
  displayCurrency: string;
  busy: boolean;
  onOpen: () => void;
  onPost: () => void;
  onSkip: () => void;
}) {
  const freq = frequencyOrMonthly(sub.frequency);
  const next = effectiveNextDate(sub, today);
  const rel = next && sub.status === "active" ? relativeDue(next, today) : null;
  const monthly = monthlyEquivalent(Math.abs(subDisplayAmount(sub)), freq, sub.intervalDays);
  const showMonthly = freq !== "monthly" || sub.currency !== displayCurrency;
  const statusBadge = STATUS_BADGE[sub.status];
  const due = isDue(sub);

  const meta = [
    frequencyLabel(sub.frequency, sub.intervalDays),
    sub.status === "active" ? (next ? `next ${formatDate(next)}${rel ? ` (${rel})` : ""}` : "no date set") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={sub.status !== "active" ? "opacity-75" : undefined}>
      <ListRow
        title={sub.name ?? "Subscription"}
        subtitle={
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <span className="truncate">{meta}</span>
            {due ? (
              <Badge className="bg-warning/10 text-warning border-warning/30" data-testid={`sub-due-badge-${sub.id}`}>
                {dueLabel(sub)}
              </Badge>
            ) : rel === "today" || rel === "tomorrow" ? (
              <Badge className="bg-warning/10 text-warning border-warning/30">Due {rel}</Badge>
            ) : null}
            {statusBadge && sub.status !== "active" && <Badge className={statusBadge.className}>{statusBadge.label}</Badge>}
          </span>
        }
        value={
          <span className="tabular-nums text-sm font-semibold">
            {formatCurrency(sub.amount, sub.currency)}
            <span className="text-xs font-normal text-muted-foreground"> / {frequencySuffix(sub.frequency, sub.intervalDays)}</span>
          </span>
        }
        secondary={showMonthly ? `≈ ${formatCurrency(monthly, displayCurrency)} / mo` : undefined}
        selected={selected}
        onPress={onOpen}
      />
      {due && (
        <div className="flex items-center gap-1.5 pb-3 pl-12">
          <DueActions sub={sub} busy={busy} onPost={onPost} onSkip={onSkip} />
        </div>
      )}
      {sub.cancelReminderDate && (
        <p className="flex items-center gap-1 pb-2 pl-12 text-xs text-warning">
          <Bell className="h-3 w-3" /> Cancel reminder {formatDate(sub.cancelReminderDate)}
        </p>
      )}
    </div>
  );
}
