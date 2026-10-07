"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import type { HealthData } from "./types";
import { HealthInfoDialog } from "./health-info-dialog";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function ScoreBar({ label, score, detail }: { label: string; score: number; detail: string }) {
  const color = score > 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="group/bar">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted-foreground group-hover/bar:text-foreground transition-colors">
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums">{score}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-0.5 opacity-0 group-hover/bar:opacity-100 transition-opacity">
        {detail}
      </p>
    </div>
  );
}

/**
 * When `health` is supplied (dashboard page lifts the `/api/health-score` fetch
 * so it can also feed the KeyMetrics strip), the card renders it directly and
 * skips its own request. When the prop is omitted the card self-fetches, keeping
 * it usable standalone.
 */
export function HealthScoreCard({ health: healthProp }: { health?: HealthData | null } = {}) {
  const [healthState, setHealthState] = useState<HealthData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const health = healthProp !== undefined ? healthProp : healthState;

  useEffect(() => {
    if (healthProp !== undefined) return; // parent supplies the data
    fetch("/api/health-score")
      .then((r) => { if (r.ok) return r.json(); })
      .then((d) => { if (d) setHealthState(d); });
  }, [healthProp]);

  return (
    <motion.div variants={itemVariants} className="h-full relative">
      <MetricCard
        label="Financial Health"
        icon={Activity}
        tone={health ? (health.score > 70 ? "emerald" : health.score >= 40 ? "amber" : "rose") : "muted"}
        value={health ? <span>{Math.round(health.score)}</span> : <span className="inline-block h-7 w-24 animate-shimmer rounded-md align-middle" />}
        valueClassName={health ? (health.score > 70 ? "text-emerald-500" : health.score >= 40 ? "text-amber-500" : "text-rose-500") : ""}
        sub={
          health ? (
            <span className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors" onClick={() => setDialogOpen(true)}>
              {health.grade} ⓘ
            </span>
          ) : (
            <span className="inline-block h-4 w-16 animate-shimmer rounded-md" />
          )
        }
      >
        {health ? (
          <div className="mt-4 space-y-2.5">
            {health.components.map((c) => (
              <ScoreBar key={c.name} label={c.name} score={c.score} detail={c.detail} />
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-shimmer rounded-md" />
            ))}
          </div>
        )}
      </MetricCard>
      
      {health ? (
        <HealthInfoDialog data={health} open={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </motion.div>
  );
}

