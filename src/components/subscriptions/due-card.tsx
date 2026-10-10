"use client";

/**
 * "Due" card (Repeat + Installment phase 2a): subscriptions with an occurrence
 * due today or earlier, each with one-tap [Post now] / [Skip]. Shown at the top
 * of /transactions; renders nothing when nothing is due. Nothing is posted by a
 * server job (payee/note are encrypted with a per-user key), so the user posts
 * while unlocked: Post now opens the entry screen prefilled from the
 * subscription, Skip advances the schedule without a transaction.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/lib/data/use-api";
import { formatCurrency, formatDate } from "@/lib/currency";
import { parseSaveError } from "@/lib/save-error";
import { dueSubscriptions, dueSummary, postNowHref, skipOccurrence } from "@/lib/subscriptions/due";
import type { SubscriptionRow } from "@/lib/subscriptions/calendar-events";

export const DUE_CARD_LIMIT = 3;

export function DueCard({ limit = DUE_CARD_LIMIT, returnTo = "/transactions" }: { limit?: number; returnTo?: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useApi<SubscriptionRow[]>("/api/subscriptions", { soft: [] });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const due = dueSubscriptions(Array.isArray(data) ? data : []);
  if (due.length === 0) return null;
  const shown = due.slice(0, limit);

  async function skip(sub: SubscriptionRow) {
    if (busyId !== null || !sub.nextDate) return;
    setBusyId(sub.id);
    setError("");
    try {
      const res = await skipOccurrence(sub.id, sub.nextDate);
      if (!res.ok) setError(await parseSaveError(res, "Couldn't skip this payment"));
      await mutate((k) => typeof k === "string" && k.startsWith("/api/subscriptions"));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card data-testid="due-card" className="border-warning/30 bg-warning/[0.04]">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-warning" aria-hidden="true" />
            Due ({due.length})
          </h2>
          {due.length > limit && (
            <Link href="/subscriptions" data-testid="due-see-all" className="text-xs font-medium text-primary hover:underline">
              See all
            </Link>
          )}
        </div>
        <ul className="divide-y rounded-lg border bg-background">
          {shown.map((sub) => {
            const more = dueSummary(sub);
            return (
              <li key={sub.id} data-testid={`due-row-${sub.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{sub.name ?? "Subscription"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(sub.amount, sub.currency)} · Due {formatDate(sub.nextDate as string)}
                    {more ? ` · ${more}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    data-testid={`due-post-${sub.id}`}
                    disabled={busyId !== null}
                    onClick={() => router.push(postNowHref(sub.id, sub.nextDate as string, returnTo))}
                  >
                    Post now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`due-skip-${sub.id}`}
                    disabled={busyId !== null}
                    onClick={() => void skip(sub)}
                  >
                    {busyId === sub.id ? "Skipping…" : "Skip"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
