"use client";

/**
 * Reports statement rows: the one mobile row layout for every report table (income / expense breakdowns,
 * balance sheet, unrealized G/L, year-over-year). Each table is a list of ListRows; a row tap opens a
 * DetailSheet with the fields the row leaves out (per-period amounts, cost basis, the drill links).
 * No <table> at any width. Charts stay on the page.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { Amount, DetailSheet, ListRow, type DetailItem } from "@/components/mobile";
import { cn } from "@/lib/utils";

export type StatementTimeseriesPoint = { period: string; label: string };

export type StatementBreakdownItem = {
  name: string;
  group: string;
  categoryId?: number | null;
  total: number;
  count: number;
  periods: Record<string, number>;
};

export type StatementGroup = { name: string; items: StatementBreakdownItem[]; total: number };

/** Most recent periods shown as per-period columns in the sheets (older ones are cut; totals cover the full range). */
export const MAX_PERIOD_COLUMNS = 30;

function visiblePeriods(timeseries: StatementTimeseriesPoint[]): { visibleTs: StatementTimeseriesPoint[]; truncated: boolean; total: number } {
  const truncated = timeseries.length > MAX_PERIOD_COLUMNS;
  return { visibleTs: truncated ? timeseries.slice(-MAX_PERIOD_COLUMNS) : timeseries, truncated, total: timeseries.length };
}

function TruncationNotice({ truncated, total }: { truncated: boolean; total: number }) {
  if (!truncated) return null;
  return (
    <p className="text-xs text-warning mb-2">
      Showing the most recent {MAX_PERIOD_COLUMNS} of {total} periods &mdash; Total reflects the full range.
    </p>
  );
}

const linkButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted";

function pctOf(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
}

/** Per-period amounts for the sheet: one line per visible period, "--" for zero or missing. */
function periodItems(items: StatementBreakdownItem[], visibleTs: StatementTimeseriesPoint[], currency: string, sumOf?: (pt: StatementTimeseriesPoint) => number): DetailItem[] {
  return visibleTs.map((pt) => {
    const v = sumOf ? sumOf(pt) : (items[0]?.periods[pt.period] ?? 0);
    return { label: pt.label, value: v == null || v === 0 ? "--" : formatCurrency(v, currency) };
  });
}

/** Detail sheet for one category / item: periods, total and share, plus the drill-through actions. */
function ItemSheet({
  item,
  total,
  currency,
  visibleTs,
  startDate,
  endDate,
  onClose,
}: {
  item: StatementBreakdownItem;
  total: number;
  currency: string;
  visibleTs: StatementTimeseriesPoint[];
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const items: DetailItem[] = [
    ...periodItems([item], visibleTs, currency),
    { label: "Total", value: formatCurrency(item.total, currency) },
    { label: "Share of total", value: pctOf(item.total, total) },
    { label: "Transactions", value: String(item.count) },
  ];
  return (
    <DetailSheet
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={item.name}
      description={item.group ? `${item.group}` : undefined}
      items={items}
    >
      {item.categoryId != null && (
        <>
          <Link href={buildTxDrillUrl({ categoryId: String(item.categoryId), startDate, endDate })} className={linkButtonClass}>
            View transactions
          </Link>
          <Link href={`/categories/${item.categoryId}`} className={linkButtonClass}>
            Category insights
          </Link>
        </>
      )}
    </DetailSheet>
  );
}

/** Totals row: tap for the per-period sums and the grand total. */
function TotalRow({
  label,
  total,
  currency,
  tone,
  visibleTs,
  items,
}: {
  label: string;
  total: number;
  currency: string;
  tone: "pos" | "neg";
  visibleTs: StatementTimeseriesPoint[];
  items: StatementBreakdownItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={<span className="font-bold">{label}</span>}
        value={<Amount value={total} currency={currency} size="md" tone={tone} />}
        secondary="100%"
        secondaryTone="muted"
        onPress={() => setOpen(true)}
        chevron={false}
        className="border-t border-border/60 pt-3"
      />
      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setOpen(false); }}
          title={label}
          description="All categories in this range"
          items={[
            ...periodItems(items, visibleTs, currency, (pt) => items.reduce((s, i) => s + (i.periods[pt.period] ?? 0), 0)),
            { label: "Total", value: formatCurrency(total, currency) },
          ]}
        />
      )}
    </>
  );
}

/** Category groups (group-by = category): tap a group to expand its categories; tap a category for its sheet. */
export function GroupedStatementRows({
  groups,
  total,
  currency,
  tone,
  timeseries,
  expanded,
  onToggle,
  startDate,
  endDate,
  totalLabel,
}: {
  groups: StatementGroup[];
  total: number;
  currency: string;
  tone: "pos" | "neg";
  timeseries: StatementTimeseriesPoint[];
  expanded: Set<string>;
  onToggle: (group: string) => void;
  startDate: string;
  endDate: string;
  totalLabel: string;
}) {
  const [openItem, setOpenItem] = useState<StatementBreakdownItem | null>(null);
  const { visibleTs, truncated, total: periodCount } = visiblePeriods(timeseries);
  const allItems = groups.flatMap((g) => g.items);
  return (
    <>
    <TruncationNotice truncated={truncated} total={periodCount} />
    <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
      {groups.map((group) => {
        const isOpen = expanded.has(group.name);
        return (
          <div key={group.name}>
            <ListRow
              title={group.name}
              subtitle={`${group.items.length} ${group.items.length === 1 ? "category" : "categories"}`}
              value={<Amount value={group.total} currency={currency} size="md" tone={tone} />}
              secondary={pctOf(group.total, total)}
              secondaryTone="muted"
              leading={isOpen ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
              onPress={() => onToggle(group.name)}
              chevron={false}
              aria-expanded={isOpen}
            />
            {isOpen && (
              <div className="bg-muted/20 pl-6">
                {[...group.items].sort((a, b) => b.total - a.total).map((item, i) => (
                  <ListRow
                    key={`${item.name}-${i}`}
                    title={item.name}
                    value={<Amount value={item.total} currency={currency} size="md" tone={tone} />}
                    secondary={pctOf(item.total, total)}
                    onPress={() => setOpenItem(item)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <TotalRow label={totalLabel} total={total} currency={currency} tone={tone} visibleTs={visibleTs} items={allItems} />
      {openItem && (
        <ItemSheet item={openItem} total={total} currency={currency} visibleTs={visibleTs} startDate={startDate} endDate={endDate} onClose={() => setOpenItem(null)} />
      )}
    </div>
    </>
  );
}

/** Flat items (group-by = category group): one row per item, tap for its sheet. */
export function FlatStatementRows({
  items,
  currency,
  tone,
  timeseries,
  startDate,
  endDate,
  totalLabel,
}: {
  items: StatementBreakdownItem[];
  currency: string;
  tone: "pos" | "neg";
  timeseries: StatementTimeseriesPoint[];
  startDate: string;
  endDate: string;
  totalLabel: string;
}) {
  const [openItem, setOpenItem] = useState<StatementBreakdownItem | null>(null);
  const total = items.reduce((s, i) => s + i.total, 0);
  const { visibleTs, truncated, total: periodCount } = visiblePeriods(timeseries);
  return (
    <>
    <TruncationNotice truncated={truncated} total={periodCount} />
    <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
      {items.map((item, i) => (
        <ListRow
          key={`${item.name}-${i}`}
          title={item.name}
          value={<Amount value={item.total} currency={currency} size="md" tone={tone} />}
          secondary={pctOf(item.total, total)}
          onPress={() => setOpenItem(item)}
        />
      ))}
      <TotalRow
        label={totalLabel}
        total={total}
        currency={currency}
        tone={tone}
        visibleTs={visibleTs}
        items={items}
      />
      {openItem && (
        <ItemSheet item={openItem} total={total} currency={currency} visibleTs={visibleTs} startDate={startDate} endDate={endDate} onClose={() => setOpenItem(null)} />
      )}
    </div>
    </>
  );
}

/** Balance sheet side (assets or liabilities): one ListRow per account, then the side total. */
export function BalanceStatementRows({
  rows,
  totalLabel,
  total,
  displayCurrency,
  tone,
}: {
  rows: { accountGroup: string; accountName: string; currency: string; balance: number }[];
  totalLabel: string;
  total: number;
  displayCurrency: string;
  tone: "pos" | "neg";
}) {
  return (
    <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
      {rows.map((r, i) => (
        <ListRow
          key={`${r.accountName}-${i}`}
          title={r.accountName}
          subtitle={[r.accountGroup, r.currency].filter(Boolean).join(" · ")}
          value={<Amount value={r.balance} currency={r.currency} size="md" tone="none" />}
        />
      ))}
      <ListRow
        title={<span className="font-bold">{totalLabel}</span>}
        value={<Amount value={total} currency={displayCurrency} size="md" tone={tone} />}
        className="border-t border-border/60 pt-3"
      />
    </div>
  );
}

export interface UnrealizedRowData {
  accountId: number;
  accountName: string;
  accountCurrency: string;
  costBasis: number;
  marketValue: number;
  valuationGL: number;
  fxGL: number;
  totalGL: number;
  costBasisMissing: boolean;
}

/** Unrealized G/L per account: tap a row for the cost basis, market value and the G/L split. */
export function UnrealizedStatementRows({ rows, displayCurrency }: { rows: UnrealizedRowData[]; displayCurrency: string }) {
  const [open, setOpen] = useState<UnrealizedRowData | null>(null);
  return (
    <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
      {rows.map((a) => (
        <ListRow
          key={a.accountId}
          title={a.accountName}
          subtitle={a.costBasisMissing ? "no cost basis" : a.accountCurrency}
          value={<Amount value={a.totalGL} currency={displayCurrency} size="md" tone="auto" showSign />}
          secondary={formatCurrency(a.marketValue, displayCurrency)}
          onPress={() => setOpen(a)}
        />
      ))}
      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setOpen(null); }}
          title={open.accountName}
          description={`${open.accountCurrency} account`}
          items={[
            { label: "Cost basis", value: formatCurrency(open.costBasis, displayCurrency) },
            { label: "Market value", value: formatCurrency(open.marketValue, displayCurrency) },
            { label: "Valuation G/L", value: formatCurrency(open.valuationGL, displayCurrency) },
            { label: "FX G/L", value: formatCurrency(open.fxGL, displayCurrency) },
            { label: "Total", value: formatCurrency(open.totalGL, displayCurrency) },
            ...(open.costBasisMissing ? [{ label: "Note", value: "Cost basis defaulted to market value (no buy transactions)" }] : []),
          ]}
        />
      )}
    </div>
  );
}

/** Year-over-year category comparison: the two years and the % change as the row's value. */
export function YoYStatementRows({
  rows,
  year1,
  year2,
  currency,
}: {
  rows: { name: string; year1Amount: number; year2Amount: number; change: number }[];
  year1: number;
  year2: number;
  currency: string;
}) {
  return (
    <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
      {rows.map((cat, i) => (
        <ListRow
          key={`${cat.name}-${i}`}
          title={cat.name}
          subtitle={`${year1} ${formatCurrency(cat.year1Amount, currency)} · ${year2} ${formatCurrency(cat.year2Amount, currency)}`}
          value={
            <span
              className={cn(
                "tabular-nums text-sm font-semibold",
                cat.change > 5 ? "text-destructive" : cat.change < -5 ? "text-pos" : "text-muted-foreground",
              )}
            >
              {cat.change > 0 ? "+" : ""}
              {cat.change}%
            </span>
          }
        />
      ))}
    </div>
  );
}
