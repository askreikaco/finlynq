"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Bell, CheckCircle2, X, ChevronRight, Shield } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { motion, AnimatePresence } from "framer-motion";
import type { SpotlightItem } from "./types";
import { useSessionUserId, readUserItem, writeUserItem } from "@/lib/client/user-storage";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const SEVERITY_ICON = {
  critical: { icon: AlertTriangle, color: "text-destructive", dot: "bg-destructive" },
  warning: { icon: AlertTriangle, color: "text-warning", dot: "bg-warning" },
  info: { icon: Bell, color: "text-info", dot: "bg-info" },
};

const MAX_VISIBLE = 3;
const DISMISSED_KEY_BASE = "pf-spotlight-dismissed";

export function ActionCenter() {
  const [items, setItems] = useState<SpotlightItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { userId, ready } = useSessionUserId();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  // Dismissed ids are per-user (`pf-spotlight-dismissed:<userId>`); nothing is
  // read until the active userId is known.
  useEffect(() => {
    if (!ready) return;
    try {
      const raw = readUserItem(DISMISSED_KEY_BASE, userId);
      setDismissed(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch {
      setDismissed(new Set());
    }
  }, [ready, userId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/spotlight")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setItems(d && Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeUserItem(DISMISSED_KEY_BASE, userId, JSON.stringify([...next]));
  };

  if (!items || !ready) return null;

  const visible = items.filter((i) => !dismissed.has(i.id));
  const displayItems = showAll ? visible : visible.slice(0, MAX_VISIBLE);
  const hasMore = visible.length > MAX_VISIBLE;

  return (
    <motion.div variants={itemVariants}>
      <Card className="card-hover">
        <CardHeader className="pb-2 px-5 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Shield className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-sm font-semibold">Action Center</CardTitle>
              <p className="text-xs text-muted-foreground">
                {visible.length === 0 ? "All clear" : `${visible.length} item${visible.length !== 1 ? "s" : ""} need attention`}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-4">
          {visible.length === 0 ? (
            <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-pos/10 border border-pos/30">
              <CheckCircle2 className="h-4.5 w-4.5 text-pos shrink-0" />
              <div>
                <p className="text-sm font-medium text-pos">All good!</p>
                <p className="text-xs text-muted-foreground">No items need your attention right now.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <AnimatePresence mode="popLayout">
                {displayItems.map((item, i) => {
                  const config = SEVERITY_ICON[item.severity];
                  const Icon = config.icon;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -80 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="group flex items-center gap-3 py-3 first:pt-1"
                    >
                      {/* Severity dot */}
                      <div className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {item.amount !== undefined && (
                            <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                              {/* The server converts every figure and stamps the
                                  currency on the item. Omitting it falls through
                                  to formatCurrency's own USD default (FINLYNQ-183),
                                  never the CAD this used to hardcode — which
                                  rendered C$304.47 beside a $704.47 from the
                                  SAME row on a USD account. Do NOT import
                                  DEFAULT_DISPLAY_CURRENCY here: it lives in a
                                  server-only module that pulls in `pg`. */}
                              {formatCurrency(item.amount, item.currency)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Link
                          href={item.actionUrl}
                          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/5"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => dismiss(item.id)}
                          className="p-1 rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-regular:opacity-100 max-regular:p-3 max-regular:-m-3 hover:bg-muted/80 transition-all"
                          title="Dismiss"
                          aria-label="Dismiss alert"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* View All button */}
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg transition-colors"
            >
              View all {visible.length} alerts
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
