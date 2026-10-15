"use client";

import { SectionCard } from "@/components/mobile/section-card";
import { ListRow } from "@/components/mobile/list-row";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { AlertTriangle, RefreshCw, Store, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { motion } from "framer-motion";
import type { MetricTone } from "@/components/mobile/card-label";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import type { InsightsData, RecurringData } from "./types";

const containerVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

function InsightCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  children,
}: {
  icon: typeof AlertTriangle;
  tone: MetricTone;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={itemVariants}>
      <SectionCard label={title} icon={Icon} tone={tone} cardClassName="card-hover">
        <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
        <div>{children}</div>
      </SectionCard>
    </motion.div>
  );
}

export function InsightsSection({ currency }: { currency?: string }) {
  const { displayCurrency: userDisplayCurrency } = useDisplayCurrency();
  const resolvedCurrency = currency?.trim() ? currency : userDisplayCurrency;
  // Cache-first (same SWR keys as everywhere else): painted at once on revisit, revalidated in the background.
  const insights = (useCacheFirstJson<InsightsData>("/api/insights").data ?? null) as InsightsData | null;
  const recurring = (useCacheFirstJson<RecurringData>("/api/recurring").data ?? null) as RecurringData | null;

  return (
    <motion.div
      className="contents"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Spending Alerts */}
      {insights && insights.anomalies.length > 0 && (
        <InsightCard
          icon={AlertTriangle}
          tone="amber"
          title="Spending Alerts"
          subtitle="Categories above average"
        >
          <div className="space-y-1.5">
            {insights.anomalies.slice(0, 5).map((a, i) => (
              <ListRow
                key={i}
                shape="rounded"
                size="dense"
                className="border border-warning/30 bg-warning/10"
                title={a.category}
                subtitle={`${a.percentAbove}% above avg`}
                value={<span className="font-mono text-warning">{formatCurrency(a.currentMonth, resolvedCurrency)}</span>}
                secondary={`avg ${formatCurrency(a.average, resolvedCurrency)}`}
              />
            ))}
          </div>
        </InsightCard>
      )}

      {/* Recurring */}
      {recurring && recurring.count > 0 && (
        <InsightCard
          icon={RefreshCw}
          tone="cyan"
          title={`Recurring (${recurring.count})`}
          subtitle={`${formatCurrency(recurring.monthlyRecurringTotal, recurring.displayCurrency || resolvedCurrency)}/month`}
        >
          <div className="-mx-3 @[11rem]:-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {recurring.recurring.slice(0, 8).map((r, i) => (
              <ListRow
                key={i}
                title={r.payee}
                subtitle={`${r.frequency} · next: ${r.nextDate}`}
                value={<span className={`font-mono ${r.avgAmount < 0 ? "text-destructive" : "text-pos"}`}>{formatCurrency(r.avgAmount, r.currency || resolvedCurrency)}</span>}
              />
            ))}
          </div>
        </InsightCard>
      )}

      {/* Top Merchants */}
      {insights && insights.topMerchants.length > 0 && (
        <InsightCard
          icon={Store}
          tone="violet"
          title="Top Merchants"
          subtitle="Last 6 months spending"
        >
          <div className="-mx-3 @[11rem]:-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {insights.topMerchants.slice(0, 8).map((m, i) => (
              <ListRow
                key={i}
                title={m.payee}
                subtitle={`${m.count} transactions`}
                value={<span className="font-mono text-destructive">{formatCurrency(m.totalSpent, resolvedCurrency)}</span>}
              />
            ))}
          </div>
        </InsightCard>
      )}

      {/* Category Trends */}
      {insights && insights.trends.length > 0 && (
        <InsightCard
          icon={TrendingUp}
          tone="indigo"
          title="Category Trends"
          subtitle="Spending direction by category"
        >
          <div className="-mx-3 @[11rem]:-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {insights.trends.slice(0, 8).map((t, i) => (
              <ListRow
                key={i}
                title={t.category}
                value={
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    t.trend === "rising"
                      ? "bg-destructive/10 text-destructive"
                      : t.trend === "declining"
                        ? "bg-pos/10 text-pos"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {t.trend === "rising" ? <ArrowUpRight className="h-3 w-3" /> : t.trend === "declining" ? <ArrowDownRight className="h-3 w-3" /> : null}
                    {t.trend === "rising" ? "+" : ""}{t.changePercent}%
                  </span>
                }
              />
            ))}
          </div>
        </InsightCard>
      )}
    </motion.div>
  );
}
