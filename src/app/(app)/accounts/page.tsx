"use client";


import { Fragment, Suspense, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { SectionCard } from "@/components/mobile/section-card";
import { Badge } from "@/components/ui/badge";
import { InvisibleMark } from "@/components/invisible-mark";
import { Button } from "@/components/ui/button";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { OnboardingTips } from "@/components/onboarding-tips";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import {
  orderGroups,
  parseGroupOrder,
  type AccountGroupOrder,
  type AccountGroupType,
} from "@/lib/accounts/groups";
import { sumAssetsLiabilities } from "@/lib/account-visibility";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  FolderCog,
} from "lucide-react";
import { HEADER_DESKTOP_ONLY, CardLayoutEditor, Amount, ListRow, ListDetailLayout, ListDetailNewButton, useListDetail, metricGridClass, useCardLayout, usePageCustomize } from "@/components/mobile";
import { AccountFormPanel } from "./_components/account-form-panel";
import { AccountDetail } from "./_components/account-detail";
import { SectionPage } from "@/components/templates/section-page";
import type { PageCard } from "@/lib/card-layout";
import { MetricCard } from "@/components/metric-card";
import { NetWorthHeroCard } from "@/app/(app)/dashboard/_components/net-worth-hero-card";
import type { SeriesPoint } from "@/lib/dashboard/series-change";
import { PageToolbar } from "@/components/page-toolbar";
import { useListToolbar } from "@/lib/toolbar/use-list-toolbar";
import { ACCOUNT_FILTER_KEYS, ACCOUNT_SORTS } from "@/lib/toolbar/list-configs";
import { sortRecords } from "@/lib/toolbar/sort";
import { useMetricRange } from "@/lib/metrics/use-metric-range";
import { cardProps, makeCardResolver, runningTotal } from "@/lib/metrics/series";
import { localDateISO } from "@/lib/utils/date";

type AccountBalance = {
  accountId: number;
  accountName: string;
  accountType: string;
  accountGroup: string;
  currency: string;
  balance: number;
  convertedBalance?: number;
  archived?: boolean;
  isInvestment?: boolean;
  /** Hidden from net worth/totals/metrics; still listed here with a badge. */
  invisible?: boolean;
  alias?: string | null;
};

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-40 animate-shimmer rounded-lg" />
        <div className="h-4 w-64 animate-shimmer rounded-lg mt-2" />
      </div>
      <div className="grid grid-cols-1 gap-3 regular:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl animate-shimmer" />
                <div className="h-4 w-24 animate-shimmer rounded" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-7 w-32 animate-shimmer rounded mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 regular:grid-cols-2 gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <div className="h-6 w-28 animate-shimmer rounded" />
            <Card>
              <CardHeader className="pb-2">
                <div className="h-4 w-20 animate-shimmer rounded" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center justify-between py-2.5 px-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg animate-shimmer" />
                      <div className="h-4 w-32 animate-shimmer rounded" />
                    </div>
                    <div className="h-4 w-20 animate-shimmer rounded" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cards of the accounts page, default order. Assets and liabilities share a 2-up row from wide up. */
const ACCOUNT_CARDS: readonly PageCard[] = [
  { id: "net-worth", title: "Net worth" },
  { id: "summary", title: "Assets and liabilities" },
  { id: "assets", title: "Assets" },
  { id: "liabilities", title: "Liabilities" },
];
const METRIC_CARD_IDS = new Set(["net-worth", "summary"]);
const LIST_CARD_IDS = new Set(["assets", "liabilities"]);

function AccountsPage() {
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // Split view (regular+): a row selects the account into the edit pane (?sel=<id>); phones keep the link to the account page.
  const detail = useListDetail();

  // Toolbar: search, and the filter page (type, archived) + sort. Archived accounts stay in the list with a badge.
  const tb = useListToolbar({ filterPath: "/filter/accounts", sorts: ACCOUNT_SORTS, filterKeys: ACCOUNT_FILTER_KEYS });
  const showArchived = tb.filters.archived === "1";
  // FINLYNQ-148: the Settings → Dropdown Ordering "account" list is the user's
  // configured account sort order. The /accounts list must honour it (it was
  // ignoring the setting and rendering in raw API order). Pinned accounts lead
  // in the saved order; the rest fall back to a null-safe name sort (account
  // names are decrypted display values — defend against null per the safeName
  // invariant).
  const sortAccountOrder = useDropdownOrder("account");

  // FINLYNQ-179: user-customizable account groups. The saved per-type display
  // order is a settings key/value (no migration); the management surface
  // (rename / reorder / merge-into-Other) is the /accounts/groups page.
  const groupOrderRes = useCacheFirstJson<{ order?: unknown }>("/api/settings/account-group-order");
  const groupOrder = useMemo<AccountGroupOrder>(
    () => (groupOrderRes.data?.order ? parseGroupOrder(JSON.stringify(groupOrderRes.data.order)) : { A: [], L: [] }),
    [groupOrderRes.data],
  );

  // Always fetch EVERY account, archived included — /api/dashboard returns them
  // unconditionally now, and the totals below need them to match the dashboard
  // hero and the net-worth chart. "Show archived" is a pure list filter.
  // Cache-first when the local read cache is on (Settings > Data > Offline mode); a plain fetch otherwise.
  const dashboardUrl = `/api/dashboard?${new URLSearchParams({ currency: displayCurrency }).toString()}`;
  const { data: dashboard, loading, error, reload: loadAccounts } = useCacheFirstJson<{
    balances?: AccountBalance[];
    netWorthOverTime?: SeriesPoint[];
    assetsOverTime?: SeriesPoint[];
    liabilitiesOverTime?: SeriesPoint[];
  }>(currencyLoading ? null : dashboardUrl);
  const metricRange = useMetricRange();
  const accounts = useMemo(() => dashboard?.balances ?? [], [dashboard]);
  const series = useMemo(
    () => ({
      nw: dashboard?.netWorthOverTime ?? [],
      assets: dashboard?.assetsOverTime ?? [],
      liabilities: dashboard?.liabilitiesOverTime ?? [],
    }),
    [dashboard],
  );

  // The toggle hides archived rows from the LIST only.
  const needle = tb.q.trim().toLowerCase();
  const visible = accounts.filter(
    (a) =>
      (showArchived || !a.archived) &&
      (!tb.filters.type || a.accountType === tb.filters.type) &&
      (!needle || `${a.accountName ?? ""} ${a.alias ?? ""} ${a.accountGroup ?? ""}`.toLowerCase().includes(needle)),
  );
  const assets = visible.filter((a) => a.accountType === "A");
  const liabilities = visible.filter((a) => a.accountType === "L");
  // Totals INCLUDE archived regardless of the toggle — an archived account's
  // balance is still the user's money, and excluding it here made this page's
  // Total Assets / Total Liabilities disagree with both the dashboard hero and
  // the net-worth chart. Read off the unfiltered `accounts`, not `visible`.
  // Invisible accounts are the exception: they stay LISTED (with a badge) but
  // never count toward any total.

  const groups = (list: AccountBalance[]) => {
    const map = new Map<string, AccountBalance[]>();
    list.forEach((a) => {
      const group = a.accountGroup || "Other";
      map.set(group, [...(map.get(group) ?? []), a]);
    });
    // FINLYNQ-179: order the GROUP SECTIONS by the user's saved per-type order
    // (settings key/value), with "Other" always last and the rest alphabetical.
    const type: AccountGroupType = list[0]?.accountType === "L" ? "L" : "A";
    const orderedGroupNames = orderGroups(
      Array.from(map.keys()),
      groupOrder[type] ?? [],
    );
    // Within each group, honour the user's configured account order (Settings →
    // Dropdown Ordering). Pinned accounts lead in saved order; the rest fall
    // back to a null-safe name sort.
    return orderedGroupNames.map(
      (group) =>
        [
          group,
          // An explicit ?sort= from the filter page wins; otherwise the configured account order.
          tb.sortExplicit
            ? sortRecords(map.get(group) ?? [], tb.sort, {
                name: (a) => a.accountName,
                amount: (a) => a.convertedBalance ?? a.balance,
              })
            : sortAccountOrder(
                map.get(group) ?? [],
                (a) => a.accountId,
                (a, b) => (a.accountName ?? "").localeCompare(b.accountName ?? ""),
              ),
        ] as const,
    );
  };

  // Group header total, in the display currency (converted balance when the
  // account is in another currency). Invisible accounts never count.
  const groupTotal = (accts: AccountBalance[]) =>
    accts.filter((a) => !a.invisible).reduce((s, a) => s + (a.convertedBalance ?? a.balance), 0);
  // Accordion header: group name + account count on the left, group total right.
  const groupTitle = (group: string, accts: AccountBalance[]) => (
    <span className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-sans text-xs font-bold uppercase tracking-normal text-muted-foreground" data-testid="group-name">{group}</span>
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground"
          aria-label={`${accts.length} accounts`}
          data-testid="group-count"
        >
          {accts.length}
        </span>
      </span>
      <span className="shrink-0 font-sans text-sm font-semibold tabular-nums" data-testid="group-total">
        {formatCurrency(groupTotal(accts), displayCurrency)}
      </span>
    </span>
  );

  const renderSection = (
    title: string,
    list: AccountBalance[],
    tone: "emerald" | "rose",
    SectionIcon: typeof TrendingUp,
  ) => (
    <SectionCard
      label={title}
      icon={SectionIcon}
      tone={tone}
      labelPlacement="outside"
      bare
      labelClassName="px-1"
    >
      {/* Each group is its own accordion, expanded by default (toggled independently): header = name, count, total. */}
      <div className="flex flex-col gap-2">
        {groups(list).map(([group, accts]) => (
          <Accordion key={group} defaultValue={group}>
          <AccordionItem
            value={group}
            title={groupTitle(group, accts)}
            className="bg-transparent"
            headerClassName="has-[[data-panel-open]]:shadow-none"
            triggerClassName="rounded-md px-1 min-h-9"
            panelClassName="surface-card overflow-hidden rounded-xl border border-border/50 p-0"
          >
            <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {accts.map((a) => (
              <ListRow
                key={a.accountId}
                {...(detail.split ? { onPress: () => detail.select(a.accountId) } : { href: `/accounts/${a.accountId}` })}
                selected={detail.selectedId === String(a.accountId)}
                className={a.archived ? "px-4 opacity-60" : "px-4"}
                title={
                  <span className="inline-flex max-w-full items-center gap-2 align-middle">
                    <span className="truncate">
                      {a.accountName}
                      {a.alias && <span className="ml-1.5 text-xs text-muted-foreground font-normal">({a.alias})</span>}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{a.currency}</Badge>
                    {a.archived && <Badge variant="secondary" className="text-xs shrink-0">Archived</Badge>}
                    {a.invisible && <InvisibleMark />}
                  </span>
                }
                value={<Amount value={a.balance} currency={a.currency} size="md" tone={a.balance < 0 ? "neg" : "none"} />}
                secondary={
                  a.convertedBalance != null && a.currency.toUpperCase() !== displayCurrency.toUpperCase()
                    ? formatCurrency(a.convertedBalance, displayCurrency)
                    : undefined
                }
              />
            ))}
            </div>
          </AccordionItem>
          </Accordion>
        ))}
      </div>
    </SectionCard>
  );

  // Totals are aggregations across all currencies — sum the API-provided
  // convertedBalance (in displayCurrency) when present, fall back to raw balance.
  const { totalAssets: totalAssetsConverted, totalLiabilities: totalLiabilitiesConverted, netWorth: netWorthConverted } =
    sumAssetsLiabilities(accounts, (a) => a.convertedBalance ?? a.balance);
  // Same derivation as Home: monthly deltas -> running total per month, compared with the previous month by default
  // (or the previous period of the selected range). From the same cached /api/dashboard payload, so offline works too.
  const thisMonth = localDateISO().slice(0, 7);
  const card = makeCardResolver(metricRange, displayCurrency);
  const nwCard = card(runningTotal(series.nw, thisMonth), "last", netWorthConverted);
  const assetsCard = card(runningTotal(series.assets, thisMonth), "last", totalAssetsConverted);
  const liabilitiesCard = card(runningTotal(series.liabilities, thisMonth), "last", totalLiabilitiesConverted);

  // Create account is its own page (/accounts/new), not a dialog.
  const createAccountLink = (
    <ListDetailNewButton
      href="/accounts/new"
      label="Create Account"
      size="sm"
      className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm"
    >
      <Plus className="h-4 w-4 mr-1.5" /> Add<span className="max-regular:sr-only"> account</span>
    </ListDetailNewButton>
  );

  const cardLayout = useCardLayout("accounts", ACCOUNT_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(accounts.length > 0 && !loading && !error ? { onOpen: () => setCustomizeOpen(true) } : null);

  if (loading) return <div className="w-full"><SummarySkeleton /></div>;

  if (error) {
    return (
      <div className="w-full">
        <ErrorState title="Couldn't load accounts" message="We had trouble loading your account data." onRetry={loadAccounts} />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <SectionPage
        id="accounts"
        title="Accounts"
        info="Overview of your assets, liabilities, and net worth"
        width="report"
        header={{ actions: createAccountLink }}
      >
        <OnboardingTips page="accounts" />
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to track net worth."
          action={{ label: "Import data", href: "/import" }}
        />
      </SectionPage>
    );
  }

  return (
    <SectionPage
      id="accounts"
      title="Accounts"
      info="Overview of your assets, liabilities, and net worth"
      width="report"
      header={{
        className: "flex items-center justify-between",
        overflow: [{ label: "Manage groups", icon: FolderCog, href: "/accounts/groups" }],
        filter: { href: tb.filterHref, activeCount: tb.activeCount },
        actions: (
          <>
            <Button
              variant="outline"
              size="sm"
              className={HEADER_DESKTOP_ONLY}
              render={<Link href="/accounts/groups" />}
              title="Rename, reorder, or merge account groups"
            >
              <FolderCog className="h-4 w-4 mr-1.5" />
              Manage groups
            </Button>
            {createAccountLink}
          </>
        ),
      }}
    >
      <ListDetailLayout
        entity="account"
        newLabel="Create Account"
        detailTitle="Account"
        detailHref={(id) => `/accounts/${id}`}
        renderDetail={(id, api) => (
          <AccountDetail
            id={id}
            embedded={{ onEdit: api.edit, onDeleted: () => { loadAccounts(); api.afterDeleted(); }, onChanged: loadAccounts }}
          />
        )}
        renderForm={(api) => (
                <AccountFormPanel
                  embedded
                  mode={api.isNew ? "create" : "edit"}
                  id={api.selectedId ?? undefined}
                  onSaved={(id) => { loadAccounts(); api.afterSaved(id); }}
                  onCancel={api.cancel}
                  onDeleted={() => { loadAccounts(); api.afterDeleted(); }}
                />
              )}
      >
      <OnboardingTips page="accounts" />

      <PageToolbar refresh
        range={{ selection: metricRange.selection, onChange: metricRange.setSelection }}
        search={{ value: tb.q, onChange: tb.setQ, placeholder: "Search accounts" }}
      />

      {(() => {
        const shown = cardLayout.layout.order.filter((id) => !cardLayout.layout.hidden.includes(id));
        // Net worth, summary and the Assets / Liabilities section cards, in the user's saved order.
        const nodes: Record<string, ReactNode> = {
          "net-worth": (
            <NetWorthHeroCard
              value={nwCard.value ?? netWorthConverted}
              currency={displayCurrency}
              change={null}
              changePct={0}
              changeCaption=""
              comparison={{ delta: nwCard.delta, pct: nwCard.badgePct }}
              sparkData={nwCard.sparkData ?? []}
              sparkLabels={nwCard.sparkLabels}
            />
          ),
          summary: (
            <div data-slot="accounts-summary" className={`${metricGridClass(2)} regular:contents`}>
              <MetricCard
                label="Total Assets"
                value={assetsCard.value ?? totalAssetsConverted}
                currency={displayCurrency}
                icon={TrendingUp}
                tone="bg-pos/10 text-pos"
                sparkColor="#10b981"
                {...cardProps(assetsCard)}
              />
              <MetricCard
                label="Total Liabilities"
                value={liabilitiesCard.value ?? totalLiabilitiesConverted}
                currency={displayCurrency}
                icon={TrendingDown}
                tone="bg-destructive/10 text-destructive"
                sparkColor="#f43f5e"
                {...cardProps(liabilitiesCard)}
              />
            </div>
          ),
          assets: renderSection("Assets", assets, "emerald", ArrowUpRight),
          liabilities: renderSection("Liabilities", liabilities, "rose", ArrowDownRight),
        };
        const blocks: ReactNode[] = [];
        for (let i = 0; i < shown.length; ) {
          const id = shown[i];
          if (METRIC_CARD_IDS.has(id)) {
            // Net worth + assets + liabilities tiles: stacked on phone, ONE row of 3 at regular+.
            const run: string[] = [];
            while (i < shown.length && METRIC_CARD_IDS.has(shown[i])) run.push(shown[i++]);
            blocks.push(
              <div key={run.join("+")} data-slot="accounts-metrics" className="flex flex-col gap-6 regular:grid regular:grid-cols-3 regular:gap-3">
                {run.map((r) => (
                  <Fragment key={r}>{nodes[r]}</Fragment>
                ))}
              </div>,
            );
            continue;
          }
          if (!LIST_CARD_IDS.has(id)) {
            blocks.push(<Fragment key={id}>{nodes[id]}</Fragment>);
            i++;
            continue;
          }
          const run: string[] = [];
          while (i < shown.length && LIST_CARD_IDS.has(shown[i])) run.push(shown[i++]);
          blocks.push(
            // Assets / Liabilities: one column on phone, side by side (2 independent stacks) at regular+. In the split
            // view the list column is 2/3 wide, so the stacks drop a step (data-split-grid: 1 column at regular, 2 at wide).
            <div key={run.join("+")} data-slot="accounts-list" data-split-grid className="flex flex-col gap-6 regular:grid regular:grid-cols-2 regular:items-start">
                  {run.map((r) => (
                    <Fragment key={r}>{nodes[r]}</Fragment>
                  ))}
                </div>,
          );
        }
        return blocks;
      })()}
      </ListDetailLayout>

      <CardLayoutEditor
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize accounts"
        info="Show, hide and reorder the cards on your accounts page."
        cards={ACCOUNT_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />
    </SectionPage>
  );
}

export default function AccountsRoute() {
  return (
    <Suspense fallback={<div className="w-full"><SummarySkeleton /></div>}>
      <AccountsPage />
    </Suspense>
  );
}
