"use client";

import * as React from "react";
import Link from "next/link";
import { Minus, Plus, Repeat } from "lucide-react";

import { FormRow } from "@/components/forms";
import { Switch } from "@/components/ui/switch";
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
import { PickerCard, PickerRow } from "./grouped-picker";
import { ToggleCard } from "./toggle-card";

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

const STEP_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors active:bg-muted disabled:opacity-50";

/** −/N/+ stepper, same look as the Splits count. */
function Stepper({
  value,
  min,
  max,
  label,
  testId,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  /** Noun for the button names: "Decrease {label}" / "Increase {label}". */
  label: string;
  testId: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        data-testid={`${testId}-decrease`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={STEP_BUTTON}
      >
        <Minus aria-hidden="true" className="size-[18px]" />
      </button>
      <span
        data-testid={`${testId}-value`}
        role="status"
        aria-label={`${label}: ${value}`}
        className="w-12 text-center text-base tabular-nums text-foreground"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        data-testid={`${testId}-increase`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={STEP_BUTTON}
      >
        <Plus aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}

/** Two-to-three way segmented control (radio group), TypeSegmented's look. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  testId?: string;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, delta: number) => {
    const n = options.length;
    const next = (from + delta + n) % n;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="grid h-11 overflow-hidden rounded-xl border border-border bg-card"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "h-11 min-w-0 truncate px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
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
    <ToggleCard
      id="txnew-repeat"
      testId="txnew-repeat"
      icon={Repeat}
      title="Repeat"
      description={series ? seriesSummary(series) : undefined}
      open={enabled}
      control={
        <Switch
          id="txnew-repeat-toggle"
          data-testid="txnew-repeat-toggle"
          aria-label="Repeat"
          aria-controls={enabled ? "txnew-repeat-panel" : undefined}
          title={disabled && !enabled ? disabledTitle : undefined}
          checked={enabled}
          disabled={disabled && !enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
        />
      }
    >
      <Segmented label="Series type" value={tab} options={TAB_OPTIONS} onChange={setTab} testId="repeat-tabs" />
      {tab === "repeat" ? (
        <>
          <PickerCard>
            {FREQUENCY_OPTIONS.map((o) => (
              <PickerRow
                key={o.value}
                label={o.label}
                selected={frequency === o.value}
                onSelect={() => setFrequency(o.value as SubscriptionFrequency)}
              />
            ))}
          </PickerCard>
          {frequency === "every_n_days" && (
            <PickerCard>
              <FormRow
                variant="custom"
                label="Every"
                htmlFor="repeat-interval-days"
                labelWidth="narrow"
                height="tall"
                error={intervalInvalid ? `Enter a whole number from ${MIN_INTERVAL_DAYS} to ${MAX_INTERVAL_DAYS}` : undefined}
              >
                <div className="flex items-center gap-2">
                  <input
                    id="repeat-interval-days"
                    data-testid="repeat-interval-days"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={3}
                    value={intervalText}
                    aria-invalid={intervalInvalid || undefined}
                    onChange={(e) => setIntervalText(e.target.value.replace(/\D/g, ""))}
                    className="block min-h-row w-full min-w-0 bg-transparent text-left text-base tabular-nums text-foreground outline-none"
                  />
                  <span className="shrink-0 text-base text-muted-foreground">days</span>
                </div>
              </FormRow>
            </PickerCard>
          )}
          <div className="space-y-2">
            <Segmented label="Repeat end" value={endType} options={END_OPTIONS} onChange={pickEndType} />
            {endType === "until" && (
              <PickerCard>
                <FormRow
                  variant="custom"
                  label="End date"
                  htmlFor="repeat-end-date"
                  labelWidth="narrow"
                  height="tall"
                  error={untilInvalid && endDate ? "Pick a date after the first payment" : undefined}
                >
                  <input
                    id="repeat-end-date"
                    type="date"
                    value={endDate}
                    min={startDate}
                    max="9999-12-31"
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block min-h-row w-full min-w-0 bg-transparent text-left text-base text-foreground outline-none"
                  />
                </FormRow>
              </PickerCard>
            )}
            {endType === "count" && (
              <PickerCard>
                <FormRow
                  variant="custom"
                  label="Times"
                  labelWidth="narrow"
                  height="tall"
                  info="Total payments, including this one"
                >
                  <Stepper
                    value={endCount}
                    min={MIN_REPEAT_COUNT}
                    max={MAX_REPEAT_COUNT}
                    label="times"
                    testId="repeat-count"
                    onChange={setEndCount}
                  />
                </FormRow>
              </PickerCard>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <PickerCard>
            <FormRow variant="custom" label="Months" labelWidth="narrow" height="tall">
              <Stepper
                value={months}
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                label="months"
                testId="installment-count"
                onChange={setMonths}
              />
            </FormRow>
          </PickerCard>
          <Segmented label="Amount mode" value={mode} options={MODE_OPTIONS} onChange={setMode} testId="installment-mode" />
          <p
            data-testid="installment-preview"
            role="status"
            className={cn("px-1 text-sm", preview.ok ? "text-foreground" : "text-muted-foreground")}
          >
            {preview.text}
          </p>
        </div>
      )}
    </ToggleCard>
  );
}
