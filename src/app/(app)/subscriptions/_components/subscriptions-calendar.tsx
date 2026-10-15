"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { localDateISO } from "@/lib/utils/date";
import { frequencyLabel } from "@/lib/subscriptions/schedule";
import { formatDateNames, weekdayShortNames } from "@/lib/locale";
import {
  buildScheduleEvents,
  type RecurringRow,
  type ScheduleEvent,
} from "@/lib/subscriptions/calendar-events";
import { useAppSizeClass } from "@/components/adaptive";
import type { Subscription } from "./types";
import { ListRow } from "@/components/mobile/list-row";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, TrendingDown, TrendingUp, Scale } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";

const pad = (n: number) => String(n).padStart(2, "0");

/** Chip / dot styling per event kind. Legend reads the same map. */
function eventTone(ev: Pick<ScheduleEvent, "type" | "source">) {
  if (ev.type === "income") {
    return { dot: "var(--pos)", chip: "bg-pos/10 text-pos", text: "text-pos" };
  }
  if (ev.source === "subscription") {
    return { dot: "var(--primary)", chip: "bg-primary/15 text-foreground", text: "text-destructive" };
  }
  return { dot: "var(--destructive)", chip: "bg-destructive/10 text-destructive", text: "text-destructive" };
}

/**
 * Calendar view of the Subscriptions page: every active subscription's
 * projected payments plus detected recurring bills/income that aren't tracked
 * yet. Event math lives in lib/subscriptions/calendar-events.ts, shared with
 * the list view's totals.
 */
export function SubscriptionsCalendar({
  subs,
  recurring,
  displayCurrency,
  onEdit,
  onTrack,
}: {
  subs: Subscription[];
  recurring: RecurringRow[];
  displayCurrency: string;
  onEdit: (id: number) => void;
  onTrack: (r: RecurringRow) => void;
}) {
  const today = localDateISO();
  const regular = useAppSizeClass() !== "compact";
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => Number(today.slice(8, 10)));

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const monthStart = `${year}-${pad(month + 1)}-01`;
  const monthEnd = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

  const events = useMemo(
    () => buildScheduleEvents(subs, recurring, monthStart, monthEnd),
    [subs, recurring, monthStart, monthEnd],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<number, ScheduleEvent[]>();
    for (const ev of events) {
      const day = Number(ev.date.slice(8, 10));
      map.set(day, [...(map.get(day) ?? []), ev]);
    }
    return map;
  }, [events]);

  // FINLYNQ-123 — month totals sum the display-currency amounts, never the
  // native ones (mixed currencies under one label was feedback #7).
  const totalBills = events.filter((e) => e.type === "bill").reduce((s, e) => s + e.displayAmount, 0);
  const totalIncome = events.filter((e) => e.type === "income").reduce((s, e) => s + e.displayAmount, 0);
  const net = totalIncome - totalBills;

  function shiftMonth(delta: number) {
    const total = year * 12 + month + delta;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
    setSelectedDay(null);
  }

  function goToday() {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)) - 1);
    setSelectedDay(Number(today.slice(8, 10)));
  }

  const monthLabel = formatDateNames(new Date(Date.UTC(year, month, 1)), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const isCurrentMonth = today.slice(0, 7) === monthStart.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];
  const dayNames = weekdayShortNames();

  return (
    <div className="space-y-4">
      <Card className="pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button variant="outline" iconOnly onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{monthLabel}</h2>
            {!isCurrentMonth && (
              <Button variant="ghost" size="sm" onClick={goToday}>Today</Button>
            )}
          </div>
          <Button variant="outline" iconOnly onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px mb-1">
          {dayNames.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }, (_, i) => (
            <div key={`pad-${i}`} className="min-h-[56px] regular:min-h-[88px]" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayEvents = eventsByDay.get(day) ?? [];
            const isSelected = selectedDay === day;
            const isToday = isCurrentMonth && day === todayDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                aria-label={`${monthLabel} ${day}${dayEvents.length ? `, ${dayEvents.length} payment${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                aria-pressed={isSelected}
                className={`min-h-[56px] regular:min-h-[88px] min-w-0 p-1 regular:p-1.5 rounded-lg text-left align-top transition-colors border flex flex-col ${
                  isSelected ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`text-xs regular:text-sm font-medium inline-flex h-6 w-6 items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {day}
                </span>
                {/* Phone width: dots. Wider: named chips. One of the two renders. */}
                {dayEvents.length > 0 && !regular && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {dayEvents.slice(0, 3).map((ev, idx) => (
                      <span key={idx} className={`h-1.5 w-1.5 rounded-full ${eventTone(ev).dot}`} />
                    ))}
                  </div>
                )}
                {regular && (
                <div className="flex flex-col gap-0.5 mt-1 w-full min-w-0">
                  {dayEvents.slice(0, 2).map((ev, idx) => (
                    <span
                      key={idx}
                      className={`truncate rounded px-1 text-xs leading-4 ${eventTone(ev).chip}`}
                      title={`${ev.name} · ${formatCurrency(ev.amount, ev.currency)}`}
                    >
                      {ev.name}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-xs text-muted-foreground leading-3 px-1">+{dayEvents.length - 2} more</span>
                  )}
                </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="flex h-2 w-2 shrink-0 rounded-full bg-primary" /> Subscription</span>
          <span className="flex items-center gap-1.5"><span className="flex h-2 w-2 shrink-0 rounded-full bg-destructive" /> Detected bill</span>
          <span className="flex items-center gap-1.5"><span className="flex h-2 w-2 shrink-0 rounded-full bg-pos" /> Expected income</span>
        </div>
      </Card>

      {selectedDay !== null && (
        <Card className="pt-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {formatDateNames(new Date(Date.UTC(year, month, selectedDay)), {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing expected on this day.</p>
          ) : (
            <div className="-mx-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
              {selectedEvents.map((ev, idx) => {
                const tone = eventTone(ev);
                return (
                  <ListRow
                    key={`${ev.name}-${idx}`}
                    dot={tone.dot}
                    title={ev.name}
                    subtitle={
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {ev.source === "subscription" ? "Subscription" : ev.type === "income" ? "Expected income" : "Detected"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{frequencyLabel(ev.frequency, ev.intervalDays)}</Badge>
                      </span>
                    }
                    value={
                      <span className={tone.text}>
                        {ev.type === "income" ? "+" : "−"}
                        {formatCurrency(ev.amount, ev.currency)}
                      </span>
                    }
                    actions={
                      ev.source === "subscription" && ev.subscriptionId != null ? (
                        <Button variant="outline" size="sm" onClick={() => onEdit(ev.subscriptionId!)}>Edit</Button>
                      ) : ev.source === "detected" && ev.type === "bill" && ev.detected ? (
                        <Button variant="outline" size="sm" onClick={() => onTrack(ev.detected!)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Track
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 regular:grid-cols-3 gap-3">
        <MonthStat label="Expected bills" value={formatCurrency(totalBills, displayCurrency)} tone="text-destructive" icon={<TrendingDown className="h-4 w-4 text-destructive" />} />
        <MonthStat label="Expected income" value={formatCurrency(totalIncome, displayCurrency)} tone="text-pos" icon={<TrendingUp className="h-4 w-4 text-pos" />} />
        <MonthStat
          label="Net for the month"
          value={`${net >= 0 ? "+" : ""}${formatCurrency(net, displayCurrency)}`}
          tone={net >= 0 ? "text-pos" : "text-destructive"}
          icon={<Scale className="h-4 w-4 text-muted-foreground" />}
        />
      </div>
      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
        Totals in {displayCurrency}
        <InfoTip
          label="About projections"
          text={`Income and untracked bills are projected from repeating transactions in your history. Totals are in ${displayCurrency} at today's rates.`}
        />
      </div>
    </div>
  );
}

function MonthStat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <Card className="pt-4 pb-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <p className={`text-xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
    </Card>
  );
}
