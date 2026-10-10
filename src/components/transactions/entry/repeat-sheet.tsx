"use client";

import * as React from "react";
import Link from "next/link";
import { Minus, Plus, Repeat } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormRow } from "@/components/forms";
import { cn } from "@/lib/utils";
import { occurrenceAt } from "@/lib/subscriptions/schedule";
import {
  installmentPreview,
  MAX_INSTALLMENTS,
  MAX_REPEAT_COUNT,
  MIN_INSTALLMENTS,
  MIN_REPEAT_COUNT,
  REPEAT_GROUPS,
  seriesSummary,
  type InstallmentMode,
  type RepeatEnd,
  type Series,
} from "@/lib/transactions/series";
import type { SubscriptionFrequency } from "@/lib/subscriptions/schedule";
import { PICKER_SHEET_CLASS, PickerCard, PickerRow, PickerSection } from "./grouped-picker";

/** Why the Repeat pill is disabled while splits are on (phase 1 does not combine them). */
export const REPEAT_SPLIT_DISABLED_TITLE =
  "Repeat and installments cannot be combined with splits yet. Remove the splits to repeat this transaction.";

const PILL =
  "inline-flex min-h-11 min-w-0 max-w-44 shrink items-center gap-1.5 rounded-full border border-border glass-capsule px-3 text-sm font-medium text-foreground transition-colors active:bg-muted disabled:opacity-50";

/** Glass-capsule pill on the Date row (create mode). Opens the sheet; shows the summary once a series is set. */
export function RepeatPill({
  series,
  disabled,
  disabledTitle,
  onClick,
}: {
  series: Series | null;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
}) {
  const summary = series ? seriesSummary(series) : null;
  return (
    <button
      type="button"
      data-testid="txnew-repeat-pill"
      aria-label={summary ? `Repeat: ${summary}` : "Repeat"}
      title={disabled ? disabledTitle : summary ?? undefined}
      disabled={disabled}
      onClick={onClick}
      className={PILL}
    >
      <Repeat aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{summary ?? "Repeat"}</span>
    </button>
  );
}

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
  { value: "forever" as EndType, label: "Forever" },
  { value: "until" as EndType, label: "Until date" },
  { value: "count" as EndType, label: "After N times" },
];
const MODE_OPTIONS = [
  { value: "split" as InstallmentMode, label: "Split total ÷ N" },
  { value: "each" as InstallmentMode, label: "Each payment = amount" },
];

const DEFAULT_REPEAT_COUNT = 12;
const DEFAULT_INSTALLMENTS = 6;

export interface RepeatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The screen's current choice (null = Never). */
  value: Series | null;
  /** Applies the choice: a series, or null for Never. */
  onApply: (series: Series | null) => void;
  /** The entry's date (first payment) as ISO. */
  startDate: string;
  /** Typed amount, unsigned major units (0 when empty). */
  amount: number;
  /** Entered currency code. */
  currency: string;
}

/**
 * Bottom sheet: segmented [Repeat | Installment]. Repeat = frequency list (Never first) plus End;
 * Installment = months stepper, amount mode and a live preview. Done applies, Never clears.
 */
export function RepeatSheet(props: RepeatSheetProps) {
  const { open, onOpenChange } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={PICKER_SHEET_CLASS}>
        <RepeatPanel {...props} />
      </SheetContent>
    </Sheet>
  );
}

/** Mounted inside SheetContent, so every open starts from the screen's current choice. */
function RepeatPanel({ onOpenChange, value, onApply, startDate, amount, currency }: RepeatSheetProps) {
  const [tab, setTab] = React.useState<Tab>(value?.kind === "installment" ? "installment" : "repeat");
  const [frequency, setFrequency] = React.useState<SubscriptionFrequency | null>(
    value?.kind === "repeat" ? value.frequency : null,
  );
  const [endType, setEndType] = React.useState<EndType>(value?.kind === "repeat" ? value.end.type : "forever");
  const [endDate, setEndDate] = React.useState(
    value?.kind === "repeat" && value.end.type === "until" ? value.end.date : "",
  );
  const [endCount, setEndCount] = React.useState(
    value?.kind === "repeat" && value.end.type === "count" ? value.end.count : DEFAULT_REPEAT_COUNT,
  );
  const [months, setMonths] = React.useState(value?.kind === "installment" ? value.count : DEFAULT_INSTALLMENTS);
  const [mode, setMode] = React.useState<InstallmentMode>(value?.kind === "installment" ? value.mode : "split");

  const never = () => {
    onApply(null);
    onOpenChange(false);
  };

  const pickEndType = (next: EndType) => {
    setEndType(next);
    // First time on "Until date": suggest a year out so the control is never blank.
    if (next === "until" && !endDate) setEndDate(occurrenceAt(startDate, "annual", 1));
  };

  const untilInvalid = endType === "until" && (!endDate || endDate <= startDate);

  const preview = installmentPreview({ startDate, count: months, mode, amount, currency });

  const done = () => {
    if (tab === "installment") {
      onApply({ kind: "installment", count: months, mode });
    } else if (frequency === null) {
      onApply(null);
    } else {
      const end: RepeatEnd =
        endType === "until"
          ? { type: "until", date: endDate }
          : endType === "count"
            ? { type: "count", count: endCount }
            : { type: "forever" };
      onApply({ kind: "repeat", frequency, end });
    }
    onOpenChange(false);
  };

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border px-5 py-4">
        <SheetTitle className="text-lg font-semibold text-foreground">Repeat</SheetTitle>
        <div className="mt-3">
          <Segmented label="Series type" value={tab} options={TAB_OPTIONS} onChange={setTab} testId="repeat-tabs" />
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        {tab === "repeat" ? (
          <>
            <PickerCard>
              <PickerRow label="Never" selected={frequency === null} onSelect={never} />
            </PickerCard>
            {REPEAT_GROUPS.map((group) => (
              <PickerSection key={group.title} title={group.title}>
                <PickerCard>
                  {group.options.map((o) => (
                    <PickerRow
                      key={o.frequency}
                      label={o.label}
                      selected={frequency === o.frequency}
                      onSelect={() => setFrequency(o.frequency)}
                    />
                  ))}
                </PickerCard>
              </PickerSection>
            ))}
            {frequency !== null && (
              <PickerSection title="End">
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
                        hint="Total payments, including this one"
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
              </PickerSection>
            )}
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
      </div>

      <div className={cn("shrink-0 gap-3 border-t border-border p-4", tab === "installment" ? "grid grid-cols-[auto_1fr]" : "flex")}>
        {tab === "installment" && (
          <Button type="button" variant="outline" data-testid="repeat-never" className="h-12 rounded-2xl px-5 text-base font-semibold" onClick={never}>
            Never
          </Button>
        )}
        <Button
          type="button"
          data-testid="repeat-done"
          disabled={tab === "repeat" && frequency !== null && untilInvalid}
          onClick={done}
          className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Done
        </Button>
      </div>
    </>
  );
}
