"use client";

import * as React from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";

import { cn } from "@/lib/utils";
import { occurrenceAt } from "@/lib/subscriptions/schedule";
import {
  installmentPreview,
  MAX_INSTALLMENTS,
  MAX_REPEAT_COUNT,
  MIN_INSTALLMENTS,
  MIN_REPEAT_COUNT,
  DEFAULT_INTERVAL_DAYS,
  isValidInterval,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  REPEAT_OPTIONS,
  seriesSummary,
  type InstallmentMode,
  type RepeatEnd,
  type Series,
} from "@/lib/transactions/series";
import type { SubscriptionFrequency } from "@/lib/subscriptions/schedule";
import { Field, FieldGroup } from "@/components/ui/field";

/** Why the Repeat toggle is disabled while splits are on (phase 1 does not combine them). */
export const REPEAT_SPLIT_DISABLED_TITLE =
  "Repeat and installments cannot be combined with splits yet. Remove the splits to repeat this transaction.";

const PILL =
  "inline-flex min-h-11 min-w-0 max-w-44 shrink items-center gap-1.5 rounded-full border border-border glass-capsule px-3 text-sm font-medium text-foreground transition-colors active:bg-muted disabled:opacity-50";

/** Edit mode: read-only membership pill. An installment row is plain text, a repeating row links to Subscriptions. */
export function SeriesBadge({
  installmentSeq,
  installmentCount,
  hasInstallment,
  hasSubscription,
}: {
  installmentSeq?: number | null;
  installmentCount?: number | null;
  hasInstallment: boolean;
  hasSubscription: boolean;
}) {
  if (hasInstallment) {
    const text =
      installmentSeq != null && installmentCount
        ? `Installment ${installmentSeq}/${installmentCount}`
        : installmentSeq != null
          ? `Installment ${installmentSeq}`
          : "Installment";
    return (
      <span data-testid="txnew-series-badge" className={cn(PILL, "pointer-events-none")}>
        <Repeat aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{text}</span>
      </span>
    );
  }
  if (hasSubscription) {
    return (
      <Link
        href="/subscriptions"
        data-testid="txnew-series-badge"
        aria-label="Repeating: open subscriptions"
        className={PILL}
      >
        <Repeat aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">Repeating</span>
      </Link>
    );
  }
  return null;
}

type Tab = "repeat" | "installment";
type EndType = RepeatEnd["type"];

const TAB_OPTIONS = [
  { value: "repeat" as Tab, label: "Repeat" },
  { value: "installment" as Tab, label: "Installment" },
];
const END_OPTIONS = [
  { value: "forever" as EndType, label: "Never" },
  { value: "count" as EndType, label: "After N times" },
  { value: "until" as EndType, label: "On date" },
];
const MODE_OPTIONS = [
  { value: "split" as InstallmentMode, label: "Split total ÷ N" },
  { value: "each" as InstallmentMode, label: "Each payment = amount" },
];

const DEFAULT_REPEAT_COUNT = 12;
const DEFAULT_INSTALLMENTS = 6;

export interface RepeatSectionProps {
  /** The entry's date (first payment) as ISO. */
  startDate: string;
  /** Typed amount, unsigned major units (0 when empty). */
  amount: number;
  /** Entered currency code. */
  currency: string;
  /** Splits are on: the toggle cannot be switched on (phase 1 does not combine them). */
  disabled?: boolean;
  disabledTitle?: string;
  /**
   * Called whenever the choice changes. `series` is null while the toggle is off or the inputs are invalid;
   * `invalid` is true when the toggle is on but an input (interval, end date) blocks a valid series.
   */
  onChange: (series: Series | null, invalid: boolean) => void;
}

const FREQUENCY_OPTIONS = REPEAT_OPTIONS.filter((o) => o.value !== "none");

/**
 * Accordion card "Repeat" with a Switch in its header. Off = no series (collapsed). On = expands inline:
 * [Repeat | Installment]. Repeat = flat frequency list (Monthly by default; Custom = every N days) plus End;
 * Installment = months stepper, amount mode and a live preview. Every change is reported through onChange.
 */
export function RepeatSection({ startDate, amount, currency, disabled, disabledTitle, onChange }: RepeatSectionProps) {
  const [enabled, setEnabled] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("repeat");
  const [frequency, setFrequency] = React.useState<SubscriptionFrequency>("monthly");
  const [intervalText, setIntervalText] = React.useState(String(DEFAULT_INTERVAL_DAYS));
  const [endType, setEndType] = React.useState<EndType>("forever");
  const [endDate, setEndDate] = React.useState("");
  const [endCount, setEndCount] = React.useState(DEFAULT_REPEAT_COUNT);
  const [months, setMonths] = React.useState(DEFAULT_INSTALLMENTS);
  const [mode, setMode] = React.useState<InstallmentMode>("split");

  const pickEndType = (next: EndType) => {
    setEndType(next);
    // First time on "On date": suggest a year out so the control is never blank.
    if (next === "until" && !endDate) setEndDate(occurrenceAt(startDate, "annual", 1));
  };

  const intervalNum = /^\d+$/.test(intervalText.trim()) ? Number(intervalText) : NaN;
  const intervalInvalid = frequency === "every_n_days" && !isValidInterval(intervalNum);
  const untilInvalid = endType === "until" && (!endDate || endDate <= startDate);
  const invalid = enabled && tab === "repeat" && (intervalInvalid || untilInvalid);

  const series: Series | null = React.useMemo(() => {
    if (!enabled || invalid) return null;
    if (tab === "installment") return { kind: "installment", count: months, mode };
    const end: RepeatEnd =
      endType === "until"
        ? { type: "until", date: endDate }
        : endType === "count"
          ? { type: "count", count: endCount }
          : { type: "forever" };
    return {
      kind: "repeat",
      frequency,
      ...(frequency === "every_n_days" ? { intervalDays: intervalNum } : {}),
      end,
    };
  }, [enabled, invalid, tab, months, mode, endType, endDate, endCount, frequency, intervalNum]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    onChangeRef.current(series, invalid);
  }, [series, invalid]);

  const preview = installmentPreview({ startDate, count: months, mode, amount, currency });

  return (
    <FieldGroup
      data-testid="txnew-repeat"
      data-state={enabled ? "open" : "closed"}
      className="shrink-0"
      panel={
        enabled ? (
          <div id="txnew-repeat-panel" className="space-y-3 py-3 animate-in fade-in duration-200">
            <Field
              control="segmented"
              fill
              aria-label="Series type"
              data-testid="repeat-tabs"
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
              options={TAB_OPTIONS}
            />
            {tab === "repeat" ? (
              <>
                <Field
                  control="select"
                  label="Frequency"
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as SubscriptionFrequency)}
                  options={FREQUENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                {frequency === "every_n_days" && (
                  <Field
                    label="Every"
                    id="repeat-interval-days"
                    data-testid="repeat-interval-days"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={3}
                    value={intervalText}
                    onChange={(e) => setIntervalText(e.target.value.replace(/\D/g, ""))}
                    suffix={<span className="shrink-0 text-base text-muted-foreground">days</span>}
                    error={intervalInvalid ? `Enter a whole number from ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS}` : undefined}
                    controlClassName="tabular-nums"
                  />
                )}
                <Field
                  control="segmented"
                  fill
                  aria-label="Repeat end"
                  value={endType}
                  onValueChange={(v) => pickEndType(v as EndType)}
                  options={END_OPTIONS}
                />
                {endType === "until" && (
                  <Field
                    control="date"
                    label="End date"
                    id="repeat-end-date"
                    value={endDate}
                    min={startDate}
                    max="9999-12-31"
                    onChange={(e) => setEndDate(e.target.value)}
                    error={untilInvalid && endDate ? "Pick a date after the first payment" : undefined}
                  />
                )}
                {endType === "count" && (
                  <Field
                    control="stepper"
                    label="Times"
                    info="Total payments, including this one"
                    value={endCount}
                    min={MIN_REPEAT_COUNT}
                    max={MAX_REPEAT_COUNT}
                    stepLabel="times"
                    data-testid="repeat-count"
                    onValueChange={(v) => setEndCount(v === "" ? MIN_REPEAT_COUNT : Number(v))}
                  />
                )}
              </>
            ) : (
              <>
                <Field
                  control="stepper"
                  label="Months"
                  value={months}
                  min={MIN_INSTALLMENTS}
                  max={MAX_INSTALLMENTS}
                  stepLabel="months"
                  data-testid="installment-count"
                  onValueChange={(v) => setMonths(v === "" ? MIN_INSTALLMENTS : Number(v))}
                />
                <Field
                  control="segmented"
                  fill
                  aria-label="Amount mode"
                  data-testid="installment-mode"
                  value={mode}
                  onValueChange={(v) => setMode(v as InstallmentMode)}
                  options={MODE_OPTIONS}
                />
                <p
                  data-testid="installment-preview"
                  role="status"
                  data-keep="status"
                  className={cn("px-1 text-sm", preview.ok ? "text-foreground" : "text-muted-foreground")}
                >
                  {preview.text}
                </p>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <Field
        control="switch"
        icon={Repeat}
        label="Repeat"
        hint={series ? seriesSummary(series) : undefined}
        id="txnew-repeat-toggle"
        data-testid="txnew-repeat-toggle"
        aria-controls={enabled ? "txnew-repeat-panel" : undefined}
        title={disabled && !enabled ? disabledTitle : undefined}
        checked={enabled}
        disabled={disabled && !enabled}
        onCheckedChange={(checked) => setEnabled(checked)}
      />
    </FieldGroup>
  );
}
