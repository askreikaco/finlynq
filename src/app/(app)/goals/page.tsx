"use client";

import type { MetricCardProps } from "@/components/metric-card";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_DOT, goalStatus } from "@/lib/status-colour";
import { localDateISO } from "@/lib/utils/date";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { CheckCircle2, PiggyBank, Plus, Target } from "lucide-react";
import { MetricGrid, SectionCard, ListRow, type ProgressTone, useCardLayout, usePageCustomize, ListDetailLayout, useListDetail, CardLayoutEditor } from "@/components/mobile";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar, type ListToolbarState } from "@/lib/toolbar/use-list-toolbar";
import { GOAL_FILTER_KEYS, GOAL_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { GoalFormPanel } from "./_components/goal-form-panel";
import { GoalDetail } from "./_components/goal-detail";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { compareCaption, seriesWindow, type MonthPoint } from "@/lib/metrics/period";
import { NO_HISTORY_CAPTION, resolveCard } from "@/lib/metrics/delta";
import type { PageCard } from "@/lib/card-layout";
import { ListPage, type ListPageContext } from "@/components/templates";
import type { Goal } from "./_components/goal-form";
import { useGoalsLoad } from "./_components/use-goals-load";
import { SyncMarkBadge } from "@/components/offline/sync-mark-badge";

/** Cards of the goals page, default order (Customize). */
const GOAL_CARDS: readonly PageCard[] = [
  { id: "summary", title: "Summary" },
  { id: "active", title: "Active goals" },
  { id: "completed", title: "Completed goals" },
];

function progressTone(progress: number): ProgressTone {
  return progress < 33 ? "destructive" : progress <= 66 ? "warning" : "pos";
}

/** One goal row: status dot, name + deadline, saved / target progress. No per-goal history exists, so no chart. */
function GoalRow({ g, displayCurrency, today, selected, href, onPress }: { g: Goal; displayCurrency: string; today: string; selected: boolean; href: string; onPress: (e: MouseEvent<HTMLElement>) => void }) {
  const currency = g.currency || displayCurrency;
  const status = goalStatus(g, today);
  const done = status === "completed";
  return (
    <ListRow
      slot="goal"
      title={g.name}
      subtitle={g.deadline ? `Due ${g.deadline}` : "No deadline"}
      dot={STATUS_DOT[status]}
      value={formatCurrency(g.currentAmount, currency)}
      delta={`of ${formatCurrency(g.targetAmount, currency)}`}
      deltaTitle="Saved of target"
      trend={null}
      currency={currency}
      progress={{ pct: g.progress, tone: done ? "pos" : progressTone(g.progress), label: `${Math.max(0, g.progress)}%`, aria: `Goal ${g.name} saved` }}
      badge={g.pendingSync ? <SyncMarkBadge mark={g.pendingSync} /> : undefined}
      strike={done}
      chevron={false}
      selected={selected}
      href={href}
      onPress={onPress}
    />
  );
}

/** Prefilled create links for the empty-state chips (name + type go in the query, read by /goals/new). */
const EMPTY_STATE_CHIPS = [
  { label: "Emergency Fund", type: "emergency_fund" },
  { label: "Pay off debt", type: "debt_payoff" },
  { label: "Save for vacation", type: "savings" },
  { label: "Build investments", type: "investment" },
];

type GoalCtx = ListPageContext<Goal>;

/** Empty state: no goals at all. */
const emptyGoals = (
  <Card className="border-dashed">
    <CardContent className="py-16 flex flex-col items-center text-center">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 mb-4">
        <Target className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Set your first financial goal</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Start with an emergency fund, debt payoff or savings goal.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {EMPTY_STATE_CHIPS.map(({ label, type }) => (
          <Link
            key={label}
            href={`/goals/new?name=${encodeURIComponent(label)}&type=${type}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border/60 bg-muted/40 hover:bg-muted transition-colors"
          >
            <Plus className="h-3 w-3" />{label}
          </Link>
        ))}
      </div>
    </CardContent>
  </Card>
);

/**
 * The centred body under the ListPage header: summary tiles and the active and completed goals as ListRows. A row
 * navigates to /goals/[id] on phones and selects into the split pane on wide screens. Mounted only when goals exist
 * (ListPage renders the empty state otherwise), so the Customize registration lives here.
 */
function GoalsBody({ ctx, displayCurrency, tb }: { ctx: GoalCtx; displayCurrency: string; tb: ListToolbarState }) {
  const { records: goals, reload } = ctx;
  const cardLayout = useCardLayout("goals", GOAL_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  // Wide (split view): a row selects it into the pane (?sel=<id>) instead of navigating. Phone: the row link goes to /goals/[id].
  const detailApi = useListDetail();
  const rowPress = (id: number) => (e: MouseEvent<HTMLElement>) => {
    if (detailApi.split) {
      e.preventDefault();
      detailApi.select(id);
    }
  };
  usePageCustomize({ onOpen: () => setCustomizeOpen(true) });

  const today = localDateISO();
  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");
  // Toolbar: search, filter page (status, type) and sort apply to the lists only; the cards cover every goal.
  const needle = tb.q.trim().toLowerCase();
  const shownGoals = sortRecords(
    goals.filter(
      (g) =>
        (!tb.filters.status || g.status === tb.filters.status) &&
        (!tb.filters.type || g.type === tb.filters.type) &&
        (!needle || (g.name ?? "").toLowerCase().includes(needle)),
    ),
    tb.sort,
    { date: (g) => g.deadline, name: (g) => g.name, amount: (g) => g.targetAmountDisplay ?? g.targetAmount },
  );
  const activeList = shownGoals.filter((g) => g.status === "active");
  const completedList = shownGoals.filter((g) => g.status === "completed");
  const totalTarget = active.reduce((s, g) => s + (g.targetAmountDisplay ?? g.targetAmount), 0);
  const totalCurrent = active.reduce((s, g) => s + (g.currentAmountDisplay ?? g.currentAmount), 0);
  const hasForeignGoal = active.some((g) => g.currency && g.currency !== displayCurrency);
  const caveat = hasForeignGoal ? "converted at today's rates" : undefined;

  // Metric cards. Goals keep no contribution history: Current Progress is the linked accounts' month-end balance
  // (served by /api/goals/series, null when it cannot be derived honestly); Total Target and Completed have no
  // history at all, so they show the value only (no badge, no sparkline, no delta).
  const { selection, explicit, period, setSelection } = useMetricRange();
  const win = seriesWindow(period);
  const seriesRes = useCacheFirstJson<{ series: Array<{ month: string; current: number }> | null }>(
    `/api/goals/series?from=${win.from}&to=${win.to}&currency=${encodeURIComponent(displayCurrency)}`,
    { keepPrevious: true },
  );
  const progressPoints = useMemo<MonthPoint[] | null>(() => {
    const rows = seriesRes.data && !Array.isArray(seriesRes.data) ? seriesRes.data.series : null;
    return Array.isArray(rows) ? rows.map((r) => ({ month: r.month, value: r.current })) : null;
  }, [seriesRes.data]);
  const progressCard = resolveCard({
    points: progressPoints, period, mode: "last", isDefault: !explicit, pageValue: totalCurrent,
    kind: "money", currency: displayCurrency, caption: compareCaption(selection),
  });
  const summaryMetrics: MetricCardProps[] = [
    { id: "total-target", label: "Total Target", icon: Target, tone: "indigo", value: totalTarget, currency: displayCurrency, sub: `Across ${goals.length} goal${goals.length === 1 ? "" : "s"}`, note: caveat },
    {
      id: "current-progress", label: "Current Progress", icon: PiggyBank, tone: "emerald", value: progressCard.value ?? totalCurrent, currency: displayCurrency,
      valueClassName: "text-pos", delta: { pct: progressCard.badgePct, text: progressCard.delta ?? NO_HISTORY_CAPTION }, note: caveat,
      sparkData: progressCard.sparkData, sparkLabels: progressCard.sparkLabels, sparkColor: "#10b981",
    },
    { id: "completed", label: "Completed", icon: CheckCircle2, tone: "violet", value: <span>{`${completed.length} / ${goals.length}`}</span>, sub: `${active.length} still active` },
  ];

  const nodes: Record<string, ReactNode> = {
    summary: <MetricGrid metrics={summaryMetrics} />,
    active: activeList.length > 0 ? (
      <SectionCard label="Active" icon={Target} tone="indigo" list className="[&>*]:min-w-0">
        {activeList.map((g) => (
          <GoalRow key={g.id} g={g} displayCurrency={displayCurrency} today={today} selected={detailApi.selectedId === String(g.id)} href={`/goals/${g.id}`} onPress={rowPress(g.id)} />
        ))}
      </SectionCard>
    ) : tb.activeCount > 0 || needle ? (
      <p className="py-6 text-center text-sm text-muted-foreground">No active goals match.</p>
    ) : (
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center">
          <CheckCircle2 className="h-10 w-10 text-pos mb-3" />
          <h3 className="text-base font-semibold mb-1">All goals completed!</h3>
          <p className="text-sm text-muted-foreground">Add a new goal.</p>
        </CardContent>
      </Card>
    ),
    completed: completedList.length > 0 ? (
      <SectionCard label="Completed" icon={CheckCircle2} tone="emerald" list className="[&>*]:min-w-0">
        {completedList.map((g) => (
          <GoalRow key={g.id} g={g} displayCurrency={displayCurrency} today={today} selected={detailApi.selectedId === String(g.id)} href={`/goals/${g.id}`} onPress={rowPress(g.id)} />
        ))}
      </SectionCard>
    ) : null,
  };

  const shown = cardLayout.layout.order.filter((id) => !cardLayout.layout.hidden.includes(id));

  return (
    <div className="space-y-6">
      <ListDetailLayout
        entity="goal"
        newLabel="Add Goal"
        detailTitle="Goal"
        detailHref={(id) => `/goals/${id}`}
        renderDetail={(id) => <GoalDetail id={id} onChanged={reload} />}
        renderForm={(api) => (
          <GoalFormPanel
            embedded
            mode={api.isNew ? "create" : "edit"}
            id={api.selectedId ?? undefined}
            onSaved={() => { reload(); api.afterSaved(); }}
            onCancel={api.cancel}
            onDeleted={() => { reload(); api.afterDeleted(); }}
          />
        )}
      >
      <PageToolbar refresh
        range={{ selection, onChange: setSelection }}
        search={{ value: tb.q, onChange: tb.setQ, placeholder: "Search goals" }}
      />
      {shown.map((id) => (nodes[id] ? <div key={id}>{nodes[id]}</div> : null))}
      </ListDetailLayout>

      <CardLayoutEditor
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize goals"
        info="Show, hide and reorder the cards on your goals page."
        cards={GOAL_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { displayCurrency } = useDisplayCurrency();
  const detailApi = useListDetail();
  // One body for every view: the ListPage has no Cards / List toggle any more (ListRows at every width).
  const tb = useListToolbar({ filterPath: "/filter/goals", sorts: GOAL_SORTS, filterKeys: GOAL_FILTER_KEYS });
  const goalsBody = (ctx: GoalCtx) => <GoalsBody ctx={ctx} displayCurrency={displayCurrency} tb={tb} />;
  return (
    // The whole page (header and body) is full width on desktop.
    <div className="w-full">
      <ListPage<Goal>
        id="goals"
        title="Goals"
        info="Track your savings targets and measure progress over time"
        viewKey="goals"
        useLoad={useGoalsLoad}
        empty={{
          title: "Set your first financial goal",
          body: "Start with an emergency fund, debt payoff or savings goal.",
        }}
        toolbarPlacement="none"
        cards={goalsBody}
        list={goalsBody}
        body={goalsBody}
        emptySlot={() => emptyGoals}
        states={{ loading: { chrome: false }, error: { chrome: false } }}
        error={{ title: "Couldn't load goals", message: "We couldn't load your goals. Please try again." }}
        header={{
          filter: { href: tb.filterHref, activeCount: tb.activeCount },
          primary: { kind: "add", label: "Add Goal", href: "/goals/new", onSelect: detailApi.split ? detailApi.selectNew : undefined },
        }}
      />
    </div>
  );
}
