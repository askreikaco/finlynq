"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListRow } from "@/components/mobile/list-row";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, ListChecks, Shield, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { motion, AnimatePresence } from "framer-motion";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import type { SpotlightItem } from "./types";
import { useSessionUserId, readUserItem, writeUserItem } from "@/lib/client/user-storage";
import { Card } from "@/components/ui/card";

const itemVariants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0, transition: { duration: 0 } },
};

const SEVERITY_ICON = {
  critical: { icon: AlertTriangle, color: "text-destructive", dot: "var(--destructive)" },
  warning: { icon: AlertTriangle, color: "text-warning", dot: "var(--warning)" },
  info: { icon: Bell, color: "text-info", dot: "var(--info)" },
};

const MAX_VISIBLE = 3;
const DISMISSED_KEY_BASE = "pf-spotlight-dismissed";

export function ActionCenter() {
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

  const spotlight = useCacheFirstJson<{ items?: SpotlightItem[] }>("/api/spotlight");
  const items = spotlight.data ? (Array.isArray(spotlight.data.items) ? spotlight.data.items : []) : spotlight.error ? [] : null;

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
      <Card title="Action Center" icon={ListChecks} tone="indigo" frameClassName="card-hover">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Shield className="h-4 w-4" />
          </div>
          <p className="flex-1 text-xs text-muted-foreground">
            {visible.length === 0 ? "All clear" : `${visible.length} item${visible.length !== 1 ? "s" : ""} need attention`}
          </p>
        </div>

        <div>
          {visible.length === 0 ? (
            <div className="flex items-center gap-3 py-3 px-3 rounded-xl bg-pos/10 border border-pos/30">
              <CheckCircle2 className="h-4.5 w-4.5 text-pos shrink-0" />
              <div>
                <p className="text-sm font-medium text-pos">All good!</p>
                <p className="text-xs text-muted-foreground">No items need your attention right now.</p>
              </div>
            </div>
          ) : (
            <div className="-mx-3 @[11rem]:-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
              <AnimatePresence mode="popLayout">
                {displayItems.map((item) => {
                  const config = SEVERITY_ICON[item.severity];
                  return (
                    <motion.div
                      key={item.id}
                      initial={false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -80 }}
                      transition={{ duration: 0.15 }}
                      className="group"
                    >
                      <ListRow
                        dot={config.dot}
                        title={item.title}
                        subtitle={item.description}
                        value={
                          item.amount !== undefined ? (
                            <span className="font-mono text-xs text-muted-foreground">
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
                          ) : undefined
                        }
                        trailing={
                          <span className="flex shrink-0 items-center gap-1">
                            <Link
                              href={item.actionUrl}
                              className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
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
                          </span>
                        }
                      />
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
        </div>
      </Card>
    </motion.div>
  );
}
