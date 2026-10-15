"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import type { HealthData } from "./types";
import { HealthInfoDialog } from "./health-info-dialog";
import type { MetricTrend } from "./key-metrics";
import { Card } from "@/components/ui/card";

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/**
 * When `health` is supplied (dashboard page lifts the `/api/health-score` fetch
 * so it can also feed the KeyMetrics strip), the card renders it directly and
 * skips its own request. When the prop is omitted the card self-fetches, keeping
 * it usable standalone.
 */

export function HealthScoreCard({ health: healthProp, trend }: { health?: HealthData | null; trend?: MetricTrend } = {}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Standalone use: cache-first (painted from the on-device copy, revalidated in the background). Skipped when the parent supplies data.
  const standalone = useCacheFirstJson<HealthData>(healthProp !== undefined ? null : "/api/health-score");
  const health = healthProp !== undefined ? healthProp : standalone.data ?? null;

  const toneName = health ? (health.score > 70 ? "emerald" : health.score >= 40 ? "amber" : "rose") : "muted";
  const open = () => setDialogOpen(true);

  // Small tile (2-up on a phone): score + grade. Tap anywhere opens the details dialog, which
  // carries the per-component breakdown the old tall card showed inline.
  return (
    <motion.div variants={itemVariants} className="h-full relative">
      <div
        role="button"
        tabIndex={health ? 0 : -1}
        aria-label="Financial health details"
        className="h-full cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
        onClick={health ? open : undefined}
        onKeyDown={(e) => {
          if (health && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            open();
          }
        }}
      >
        <Card
          title="Financial Health"
          icon={Activity}
          tone={toneName}
          value={health ? <span>{Math.round(health.score)}</span> : <span className="inline-block h-7 w-24 animate-shimmer rounded-md align-middle" />}
          valueClassName={health ? (health.score > 70 ? "text-pos" : health.score >= 40 ? "text-warning" : "text-destructive") : ""}
          sub={
            health
              ? trend?.delta
                ? <span>{trend.delta}</span>
                : <span>{health.grade} ⓘ</span>
              : <span className="inline-block h-4 w-16 animate-shimmer rounded-md" />
          }
          note={health && trend?.delta ? <span>{health.grade} ⓘ</span> : undefined}
          delta={health ? { pct: trend?.badgePct } : undefined}
          spark={{ data: health ? trend?.sparkData : undefined, color: "#6366f1", labels: health ? trend?.sparkLabels : undefined }}
        />
      </div>
      {health ? (
        <HealthInfoDialog data={health} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </motion.div>
  );
}
