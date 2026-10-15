"use client";

/**
 * Subscriptions — ONE page for recurring payments (2026-10).
 *
 * Merges the old dev-mode-only Subscriptions list and Bill Calendar pages:
 *   - List view: tracked subscriptions grouped by frequency, plus recurring
 *     payments detected in the user's transactions that aren't tracked yet
 *     (one-click "Track").
 *   - Calendar view: every projected payment for a month — tracked
 *     subscriptions, untracked detected bills and expected income.
 * Both views read the same pure builders (lib/subscriptions/calendar-events.ts)
 * and schedule math (lib/subscriptions/schedule.ts), so a total in one view
 * can't disagree with the other. `/calendar` redirects to `?view=calendar`.
 *
 * One layout at every size: the list is inset ListRows in SectionCards (no table);
 * a row opens /subscriptions/[id] on phones and selects into the split pane on wide screens.
 */

import type { MetricCardProps } from "@/components/metric-card";
import { Suspense, useMemo, useState, type MouseEvent } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { SUBSCRIPTION_FILTER_KEYS, SUBSCRIPTION_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { ListRow, MetricGrid, SectionCard, TxRow, ListDetailLayout, useListDetail } from "@/components/mobile";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, seriesWindow, type MonthPoint } from "@/lib/metrics/period";
import { resolveCard, NO_HISTORY_CAPTION } from "@/lib/metrics/delta";
import { SubscriptionFormPanel } from "./_components/subscription-form-panel";
import { DueActions, STATUS_BADGE, SubscriptionDetail, dueLabel, isDue, relativeDue } from "./_components/subscription-detail";
import { SectionPage } from "@/components/templates/section-page";
import { Notice } from "@/components/notice";
import { Card, CardContent } from "@/components/ui/card";
import { CARD_ROW_GRID } from "@/components/mobile/section-card";
import { useDisplayCurrency } from "@/components/currency-provider";
import { formatCurrency, formatDate } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { localDateISO } from "@/lib/utils/date";
import {
  FREQUENCY_SUFFIX,
  frequencyLabel,
  frequencySuffix,
  addDays,
  frequencyOrMonthly,
  monthlyEquivalent,
  rollForwardNextDate,
  FREQUENCY_GROUPS,
  frequencyGroupKey,
} from "@/lib/subscriptions/schedule";
import {
  detectedSuggestions,
  effectiveNextDate,
  subDisplayAmount,
  subscriptionTotals,
  type RecurringRow,
} from "@/lib/subscriptions/calendar-events";
import { EMPTY_DRAFT, type SubscriptionDraft } from "./_components/subscription-form";
import { postNowHref, skipOccurrence } from "@/lib/subscriptions/due";
import { draftSearchParams } from "./_components/draft-params";
import { SubscriptionsCalendar } from "./_components/subscriptions-calendar";
import type { Subscription } from "./_components/types";
import { Bell, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, CreditCard, List, Plus, Repeat, Search, Sparkles } from "lucide-react";

type View = "list" | "calendar";
type SeriesRow = { month: string; monthly: number; annual: number; active: number; dueSoon: number; dueSoonCount: number };

const SUGGESTIONS_PREVIEW = 3;
const DUE_SOON_DAYS = 30;

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<Notice variant="skeleton" skeleton="list" rows={5} />}>
      <SubscriptionsPageContent />
    </Suspense>
  );
}

function SubscriptionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Wide (split view): a row selects it into the pane (?sel=<id>). Phone: the row link goes to /subscriptions/[id].
  const detail = useListDetail();
  const rowPress = (id: number) => (e?: MouseEvent<HTMLElement>) => {
    if (detail.split) {
      e?.preventDefault();
      detail.select(id);
    }
  };
  const view: View = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const { displayCurrency: ctxCurrency } = useDisplayCurrency();

  // Cache-first (Settings > Data > Offline mode): the list paints from the local cache, then revalidates.
  const { data: subsData, loading, error: loadError, reload: loadSubs } = useCacheFirstJson<Subscription[]>("/api/subscriptions");
  const subs = useMemo(() => (Array.isArray(subsData) ? subsData : []), [subsData]);
  // Detection is a nice-to-have on top of the tracked list: a failure here
  // just means no suggestions / no projected income, never a page error.
  const recurringRes = useCacheFirstJson<{ recurring?: RecurringRow[] }>("/api/recurring");
  const recurring = useMemo<RecurringRow[]>(
    () => (Array.isArray(recurringRes.data?.recurring) ? recurringRes.data.recurring : []),
    [recurringRes.data],
  );

  // Toolbar: search, filter page (status) and sort (next payment, name, monthly cost).
  const tb = useListToolbar({ filterPath: "/filter/subscriptions", sorts: SUBSCRIPTION_SORTS, filterKeys: SUBSCRIPTION_FILTER_KEYS });
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const today = localDateISO();

  const loadRecurring = recurringRes.reload;

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

  // Metric cards: each has a month-by-month history (GET /api/subscriptions/series: booked transactions, end dates and
  // status now; lib/subscriptions/history.ts) so it shows the shared sparkline, % badge and "+$X vs last month".
  const { selection, explicit, period, setSelection } = useMetricRange();
  const win = seriesWindow(period);
  const seriesRes = useCacheFirstJson<{ series: SeriesRow[] | null }>(
    `/api/subscriptions/series?from=${win.from}&to=${win.to}&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  const seriesRows = useMemo(() => {
    const rows = seriesRes.data && !Array.isArray(seriesRes.data) ? seriesRes.data.series : null;
    return Array.isArray(rows) ? rows : null;
  }, [seriesRes.data]);
  const summaryMetrics = useMemo<MetricCardProps[]>(() => {
    const caption = compareCaption(selection);
    const pts = (pick: (r: SeriesRow) => number): MonthPoint[] | null => (seriesRows ? seriesRows.map((r) => ({ month: r.month, value: pick(r) })) : null);
    const card = (pick: (r: SeriesRow) => number, pageValue: number, kind: "money" | "count") =>
      resolveCard({ points: pts(pick), period, mode: "last", isDefault: !explicit, pageValue, kind, currency: displayCurrency, caption });
    const monthly = card((r) => r.monthly, totals.monthly, "money");
    const annual = card((r) => r.annual, totals.annual, "money");
    const due = card((r) => r.dueSoon, totals.dueSoonAmount, "money");
    const active = card((r) => r.active, totals.activeCount, "count");
    const shared = (c: ReturnType<typeof card>, invert = false) => ({
      delta: { pct: c.badgePct, text: c.delta ?? NO_HISTORY_CAPTION, ...(invert ? { invert } : {}) },
      sparkData: c.sparkData, sparkLabels: c.sparkLabels,
    });
    return [
      { id: "monthly", icon: CalendarClock, tone: "indigo", label: "Per month", value: monthly.value ?? totals.monthly, currency: displayCurrency, ...shared(monthly, true),
        note: `${totals.activeCount} active subscription${totals.activeCount === 1 ? "" : "s"}` },
      { id: "yearly", icon: CalendarRange, tone: "violet", label: "Per year", value: annual.value ?? totals.annual, currency: displayCurrency, sparkColor: "#8b5cf6", ...shared(annual, true),
        note: "Annualised" },
      { id: "due-soon", icon: CalendarClock, tone: "amber", label: `Due in next ${DUE_SOON_DAYS} days`, value: due.value ?? totals.dueSoonAmount, currency: displayCurrency, sparkColor: "#f59e0b", ...shared(due, true),
        note: `${totals.dueSoonCount} payment${totals.dueSoonCount === 1 ? "" : "s"}` },
      { id: "active", icon: CheckCircle2, tone: "emerald", label: "Active", value: <span>{Math.round(active.value ?? totals.activeCount)}</span>, sparkColor: "#10b981", ...shared(active),
        note: `of ${subs.length} tracked` },
    ];
  }, [seriesRows, period, explicit, selection, totals, displayCurrency, subs.length]);

  const sorted = useMemo(() => {
    const monthlyCost = (s: Subscription) => monthlyEquivalent(Math.abs(subDisplayAmount(s)), s.frequency, s.intervalDays);
    const needle = tb.q.trim().toLowerCase();
    return sortRecords(
      subs.filter((s) => (!tb.filters.status || s.status === tb.filters.status) && (!needle || (s.name ?? "").toLowerCase().includes(needle))),
      tb.sort,
      { date: (s) => effectiveNextDate(s, today) ?? "9999-12-31", name: (s) => s.name, amount: monthlyCost },
    );
  }, [subs, tb.q, tb.filters, tb.sort, today]);

  // Grouped by cadence (fixed order); paused / cancelled / ended rows stay in their cadence group with a status badge.
  const groups = FREQUENCY_GROUPS.map((g) => {
    const rows = sorted.filter((s) => frequencyGroupKey(s.frequency) === g.key);
    const monthly = rows
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + monthlyEquivalent(Math.abs(subDisplayAmount(s)), s.frequency, s.intervalDays), 0);
    return { key: g.key, title: g.title, rows, monthly };
  });

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
      loadSubs();
      return true;
    } catch {
      setActionError("Network error. Please try again.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

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

  if (loading) return <Notice variant="skeleton" skeleton="list" rows={5} />;
  if (loadError) {
    return (
      <Notice
        variant="error"
        title="Couldn't load subscriptions"
        retry={() => { loadSubs(); loadRecurring(); }}
      >
        {"We couldn't load your subscriptions. Please try again."}
      </Notice>
    );
  }

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, SUGGESTIONS_PREVIEW);

  return (
    <SectionPage
      id="subscriptions"
      title="Subscriptions"
      info="Recurring bills and subscriptions: what they cost and when they're due."
      width="report"
      center
      header={{
        filter: view === "list" ? { href: tb.filterHref, activeCount: tb.activeCount } : undefined,
        primary: { kind: "add", label: "Add subscription", href: "/subscriptions/new", onSelect: detail.split ? detail.selectNew : undefined },
      }}
    >
      <ListDetailLayout
        entity="subscription"
        newLabel="Add subscription"
        detailTitle="Subscription"
        detailHref={(id) => `/subscriptions/${id}`}
        renderDetail={(id) => <SubscriptionDetail id={id} onChanged={loadSubs} />}
        renderForm={(api) => (
          <SubscriptionFormPanel
            embedded
            mode={api.isNew ? "create" : "edit"}
            id={api.selectedId ?? undefined}
            onSaved={() => { loadSubs(); api.afterSaved(); }}
            onCancel={api.cancel}
            onDeleted={() => { loadSubs(); api.afterDeleted(); }}
          />
        )}
      >
      <MetricGrid metrics={summaryMetrics} />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {/* View switch + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView((v as View) ?? "list")}>
          <TabsList variant="segmented">
            <TabsTrigger value="list" className="px-3"><List className="h-4 w-4" /> List</TabsTrigger>
            <TabsTrigger value="calendar" className="px-3"><CalendarDays className="h-4 w-4" /> Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
        <PageToolbar
          refresh
          className="w-auto flex-1 justify-end"
          range={{ selection, onChange: setSelection }}
          search={view === "list" && subs.length > 1 ? { value: tb.q, onChange: tb.setQ, placeholder: "Search subscriptions" } : undefined}
        />
      </div>

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
                    <SectionCard label="Found in your transactions" icon={Search} tone="cyan" padded={false} className="col-span-full">
                      <p className="px-4 pt-3 pb-1 text-sm text-muted-foreground">
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
                              <div className="flex items-center gap-1.5 pb-3 pl-16">
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
                        <Button variant="link" size="sm" className="px-4 pb-3" onClick={() => setShowAllSuggestions((v) => !v)}>
                          {showAllSuggestions ? "Show fewer" : `Show all ${suggestions.length}`}
                        </Button>
                      )}
                    </SectionCard>
                  )}

                  {subs.length === 0 && (
                    <Card className="col-span-full"><CardContent className="p-0"><Notice
                      variant="empty"
                      icon={CreditCard}
                      title="No subscriptions tracked yet"
                      action={{ label: "Add subscription", onClick: openAdd }}
                    >
                      Add streaming, insurance, memberships and other repeating bills.
                    </Notice></CardContent></Card>
                  )}

                  {/* One inset list per cadence group, rows in the sort order chosen above. */}
                  {groups.map((g) =>
                    g.rows.length === 0 ? null : (
                      <SectionCard key={g.key} labelPlacement="outside" label={`${g.title} (${g.rows.length}) · ${formatCurrency(g.monthly, displayCurrency)} / mo`} list className={`col-span-full ${CARD_ROW_GRID}`}>
                        {g.rows.map((sub) => (
                          <SubscriptionRow
                            key={sub.id}
                            sub={sub}
                            today={today}
                            displayCurrency={displayCurrency}
                            busy={busyKey !== null}
                            selected={detail.selectedId === String(sub.id)}
                            href={`/subscriptions/${sub.id}`}
                            onPress={rowPress(sub.id)}
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
      </ListDetailLayout>

    </SectionPage>
  );
}

/** One subscription in a status group: tap opens its detail page (wide: the pane); due payments get their actions under the row. */
function SubscriptionRow({
  sub,
  today,
  displayCurrency,
  busy,
  href,
  onPress,
  onPost,
  onSkip,
  selected,
}: {
  selected?: boolean;
  sub: Subscription;
  today: string;
  displayCurrency: string;
  busy: boolean;
  href: string;
  onPress: (e?: MouseEvent<HTMLElement>) => void;
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
      <TxRow
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
        icon={Repeat}
        tile={due ? "warn" : sub.status === "active" ? "neg" : "muted"}
        amount={-Math.abs(sub.amount)}
        currency={sub.currency}
        meta={showMonthly ? `≈ ${formatCurrency(monthly, displayCurrency)} / mo` : `per ${frequencySuffix(sub.frequency, sub.intervalDays)}`}
        selected={selected}
        href={href}
        onPress={onPress}
      />
      {due && (
        <div className="flex items-center gap-1.5 pb-3 pl-16">
          <DueActions sub={sub} busy={busy} onPost={onPost} onSkip={onSkip} />
        </div>
      )}
      {sub.cancelReminderDate && (
        <p className="flex items-center gap-1 pb-2 pl-16 text-xs text-warning">
          <Bell className="h-3 w-3" /> Cancel reminder {formatDate(sub.cancelReminderDate)}
        </p>
      )}
    </div>
  );
}
