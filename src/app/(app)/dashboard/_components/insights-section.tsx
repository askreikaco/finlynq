"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/mobile/section-card";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { AlertTriangle, RefreshCw, Store, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { motion } from "framer-motion";
import type { MetricTone } from "@/components/mobile/card-label";
import type { InsightsData, RecurringData } from "./types";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
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
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [recurring, setRecurring] = useState<RecurringData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d === "object") setInsights(d as InsightsData);
      })
      .catch(() => {
        /* cards self-hide when data is absent */
      });
    fetch("/api/recurring")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d === "object") setRecurring(d as RecurringData);
      })
      .catch(() => {
        /* cards self-hide when data is absent */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-xl bg-warning/10 border border-warning/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.category}</p>
                  <p className="text-xs text-muted-foreground">{a.percentAbove}% above avg</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-sm font-mono font-semibold text-warning tabular-nums">
                    {formatCurrency(a.currentMonth, resolvedCurrency)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    avg {formatCurrency(a.average, resolvedCurrency)}
                  </p>
                </div>
              </div>
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
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {recurring.recurring.slice(0, 8).map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.payee}</p>
                  <p className="text-xs text-muted-foreground">{r.frequency} &middot; next: {r.nextDate}</p>
                </div>
                <p className={`text-sm font-mono font-semibold tabular-nums shrink-0 ml-2 ${r.avgAmount < 0 ? "text-destructive" : "text-pos"}`}>
                  {formatCurrency(r.avgAmount, r.currency || resolvedCurrency)}
                </p>
              </div>
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
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {insights.topMerchants.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.payee}</p>
                  <p className="text-xs text-muted-foreground">{m.count} transactions</p>
                </div>
                <p className="text-sm font-mono font-semibold text-destructive tabular-nums shrink-0 ml-2">
                  {formatCurrency(m.totalSpent, resolvedCurrency)}
                </p>
              </div>
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
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {insights.trends.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <p className="text-sm">{t.category}</p>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  t.trend === "rising"
                    ? "bg-destructive/10 text-destructive"
                    : t.trend === "declining"
                      ? "bg-pos/10 text-pos"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {t.trend === "rising" ? <ArrowUpRight className="h-3 w-3" /> : t.trend === "declining" ? <ArrowDownRight className="h-3 w-3" /> : null}
                  {t.trend === "rising" ? "+" : ""}{t.changePercent}%
                </span>
              </div>
            ))}
          </div>
        </InsightCard>
      )}
    </motion.div>
  );
}
