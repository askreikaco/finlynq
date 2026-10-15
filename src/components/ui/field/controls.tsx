"use client";

/**
 * Internal to Field: one renderer per `control`. Pages never import this file; they render <Field control="..." />.
 * Every renderer receives the same shared state (id, invalid, row, adornments) so the surface, focus ring, 44px
 * height and aria wiring are identical across controls.
 */

import * as React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { parseAmountInput } from "@/lib/parse-amount";
import { getSeparators } from "@/lib/locale";
import {
  CONTROL_BOX,
  CONTROL_BOX_COMPACT,
  CONTROL_FOCUS_VISIBLE,
  CONTROL_STATE,
  CONTROL_SURFACE,
} from "../control-surface";
import { Switch } from "../switch";
import { Combobox } from "./combobox-base";
import { GroupCombobox } from "./group-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select-base";
import { BARE_INPUT, Surface } from "./surface";

export interface FieldOption {
  value: string;
  /** Text shown in the list and in the closed control. Combobox options filter on it, so keep it a string there. */
  label: React.ReactNode;
  disabled?: boolean;
  /** Segmented only: icon before the label. */
  icon?: LucideIcon;
  /** Segmented only: extra classes while this option is selected (a tone). */
  selectedClassName?: string;
}

/** State every control renderer shares; built once in Field. */
export interface ControlState {
  id: string;
  describedBy?: string;
  labelId?: string;
  invalid: boolean;
  disabled?: boolean;
  required?: boolean;
  compact: boolean;
  row: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  /** Accessible name when the label is hidden or not text. */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// text | number | date

export function TextControl({
  state,
  type,
  inputRef,
  ...rest
}: { state: ControlState; type: string; inputRef?: React.Ref<HTMLInputElement> } & Omit<
  React.ComponentProps<"input">,
  "prefix" | "type" | "className" | "ref"
>) {
  const { id, describedBy, invalid, disabled, required, row, compact, prefix, suffix, className, ariaLabel } = state;
  return (
    <Surface row={row} compact={compact} invalid={invalid} disabled={disabled}>
      {prefix}
      <input
        ref={inputRef}
        id={id}
        type={type}
        disabled={disabled}
        required={required}
        aria-label={rest["aria-label"] ?? ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-slot="input"
        {...rest}
        className={cn(BARE_INPUT, type === "date" && "text-left [&::-webkit-date-and-time-value]:text-left", className)}
      />
      {suffix}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// textarea (auto-grow)

// SSR-safe: useLayoutEffect on the client (no measurement needed on the server).
const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Sets the height to fit the content, capped at the computed max-height (then the
 * textarea scrolls inside). Reads scrollHeight after resetting height to auto.
 * Border is added back because height is border-box and scrollHeight is not.
 */
export function fitTextareaToContent(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  const border = Math.max(0, el.offsetHeight - el.clientHeight);
  const content = el.scrollHeight + border;
  const max = parseFloat(getComputedStyle(el).maxHeight);
  const capped = Number.isFinite(max) && content > max;
  el.style.height = `${capped ? max : content}px`;
  el.style.overflowY = capped ? "auto" : "hidden";
}

/**
 * Multi-line text that grows with its content. Starts at 2 rows, capped at max-h-48 (then scrolls inside).
 * Wraps long words, keeps newlines, never scrolls horizontally. Enter inserts a newline (no submit).
 */
export function TextareaControl({
  state,
  inputRef,
  value,
  rows = 2,
  ...rest
}: { state: ControlState; inputRef?: React.Ref<HTMLTextAreaElement> } & Omit<
  React.ComponentProps<"textarea">,
  "prefix" | "className" | "ref"
>) {
  const { id, describedBy, invalid, disabled, required, row, compact, prefix, suffix, className, ariaLabel } = state;
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) (inputRef as React.RefObject<HTMLTextAreaElement | null>).current = node;
    },
    [inputRef],
  );

  // Re-fit when the value changes (typing, prefill, programmatic reset).
  useIsoLayoutEffect(() => {
    if (innerRef.current) fitTextareaToContent(innerRef.current);
  }, [value]);

  // Width changes re-wrap the text, so re-fit on resize. Window listener only (no ResizeObserver loop).
  React.useEffect(() => {
    const onResize = () => {
      if (innerRef.current) fitTextareaToContent(innerRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Surface row={row} compact={compact} invalid={invalid} disabled={disabled} multiline>
      {prefix}
      <textarea
        ref={setRef}
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        required={required}
        aria-label={rest["aria-label"] ?? ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-slot="textarea"
        {...rest}
        className={cn(BARE_INPUT, "block w-full resize-none overflow-y-auto whitespace-pre-wrap break-words max-h-48", className)}
      />
      {suffix}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// amount (follows the Language preference)

/**
 * Locales whose decimal separator is "." (en, ja): a native `type="number"` input.
 * Others (vi): a text input accepting "1.234.567" / "1,5" (parse-amount.ts:parseAmountInput); the parent state
 * always holds the canonical dot-decimal string ("1234567", "1.5") so existing parseFloat/submit code is unaffected.
 */
export function AmountControl({
  state,
  inputRef,
  value: rawValue,
  onValueChange,
  hero,
  ...rest
}: {
  state: ControlState;
  inputRef?: React.Ref<HTMLInputElement>;
  value: string | number | null | undefined;
  onValueChange: (canonical: string) => void;
  hero?: boolean;
} & Omit<React.ComponentProps<"input">, "prefix" | "type" | "className" | "ref" | "value" | "onChange">) {
  const value = rawValue == null ? "" : String(rawValue);
  const { locale } = useLanguage();
  const sep = getSeparators(locale).decimal;
  const vi = sep !== ".";
  const [draft, setDraft] = React.useState(() => value.replace(".", sep));

  React.useEffect(() => {
    if (!vi) return;
    const fromDraft = parseAmountInput(draft, locale);
    const fromValue = parseFloat(value);
    const same = (Number.isNaN(fromDraft) && Number.isNaN(fromValue)) || fromDraft === fromValue;
    if (!same) setDraft(value.replace(".", sep));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, vi, locale]);

  const cls = cn(state.className, hero && "text-2xl font-semibold tabular-nums", state.invalid && hero && "text-neg");
  const heroState = { ...state, className: cls };
  if (!vi) {
    return (
      <TextControl
        state={heroState}
        type="number"
        inputRef={inputRef}
        {...rest}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  }
  // step/min/max are native-number attributes; drop them for the text input.
  const { step: _s, min: _mi, max: _ma, ...textProps } = rest;
  void _s;
  void _mi;
  void _ma;
  return (
    <TextControl
      state={heroState}
      type="text"
      inputRef={inputRef}
      inputMode="decimal"
      {...textProps}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseAmountInput(raw, locale);
        onValueChange(Number.isNaN(n) ? "" : String(n));
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// select

export function SelectControl({
  state,
  options,
  value,
  onValueChange,
  placeholder,
  name,
  testId,
  triggerRef,
}: {
  state: ControlState;
  options: readonly FieldOption[];
  value?: string | null;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  testId?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const { id, describedBy, invalid, disabled, required, compact, row, prefix, suffix, className, ariaLabel } = state;
  const items = React.useMemo(() => Object.fromEntries(options.map((o) => [o.value, o.label])), [options]);
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange?.(v == null ? "" : String(v))}
      items={items}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        compact={compact}
        invalid={invalid}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        className={cn(row && "border-0 bg-transparent px-0 shadow-none dark:bg-transparent min-h-11 focus-visible:ring-0", className)}
      >
        {prefix}
        <SelectValue placeholder={placeholder} />
        {suffix}
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// combobox

export function ComboboxControl({
  state,
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  testId,
}: {
  state: ControlState;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  testId?: string;
}) {
  const { id, describedBy, invalid, disabled, required, compact, row, prefix, suffix, className, ariaLabel } = state;
  return (
    <Combobox
      id={id}
      items={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      disabled={disabled}
      required={required}
      invalid={invalid}
      compact={compact}
      prefix={prefix}
      suffix={suffix}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      data-testid={testId}
      className={cn(row && "border-0 bg-transparent px-0 shadow-none dark:bg-transparent min-h-11 focus-visible:ring-0", className)}
    />
  );
}

// ---------------------------------------------------------------------------
// group combobox

export function GroupComboboxControl({
  state,
  options,
  value,
  onValueChange,
  placeholder,
  noneLabel,
  testId,
}: {
  state: ControlState;
  options: ReadonlyArray<string>;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  noneLabel?: string;
  testId?: string;
}) {
  return (
    <GroupCombobox
      id={state.id}
      value={value}
      onChange={onValueChange}
      options={options}
      placeholder={placeholder}
      ariaLabel={state.ariaLabel}
      noneLabel={noneLabel}
      invalid={state.invalid}
      compact={state.compact}
      disabled={state.disabled}
      prefix={state.prefix}
      suffix={state.suffix}
      className={state.className}
      aria-describedby={state.describedBy}
      data-testid={testId}
    />
  );
}

// ---------------------------------------------------------------------------
// switch | checkbox

export function SwitchControl({
  state,
  ...rest
}: { state: ControlState } & Omit<React.ComponentProps<typeof Switch>, "id" | "className" | "disabled">) {
  const { id, describedBy, disabled, className, ariaLabel } = state;
  return (
    <Switch
      id={id}
      disabled={disabled}
      aria-label={(rest as { "aria-label"?: string })["aria-label"] ?? ariaLabel}
      aria-describedby={describedBy}
      className={cn("shrink-0", className)}
      {...rest}
    />
  );
}

export function CheckboxControl({
  state,
  inputRef,
  onCheckedChange,
  onChange,
  ...rest
}: {
  state: ControlState;
  inputRef?: React.Ref<HTMLInputElement>;
  onCheckedChange?: (checked: boolean) => void;
} & Omit<React.ComponentProps<"input">, "prefix" | "type" | "className" | "ref">) {
  const { id, describedBy, invalid, disabled, className, ariaLabel } = state;
  return (
    <input
      ref={inputRef}
      id={id}
      type="checkbox"
      disabled={disabled}
      aria-label={rest["aria-label"] ?? ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-slot="checkbox"
      {...rest}
      onChange={(e) => {
        onCheckedChange?.(e.currentTarget.checked);
        onChange?.(e);
      }}
      className={cn(
        "size-4 shrink-0 rounded border border-primary ring-offset-background cursor-pointer accent-primary active:ring-3 active:ring-primary/20 pointer-coarse:size-5 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// segmented (radiogroup with roving focus)

export function SegmentedControl({
  state,
  options,
  value,
  onValueChange,
  fill,
  testId,
}: {
  state: ControlState;
  options: readonly FieldOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Equal-width columns across the whole row (default: as wide as the options). */
  fill?: boolean;
  testId?: string;
}) {
  const { labelId, disabled, invalid, compact, className, ariaLabel, describedBy } = state;
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const isOff = (o: FieldOption) => !!o.disabled || !!disabled;

  const move = (from: number, delta: number) => {
    const n = options.length;
    let next = (from + delta + n) % n;
    // Skip options that cannot be picked; stop after one lap so an all-disabled group cannot loop.
    for (let step = 0; step < n && isOff(options[next]); step++) next = (next + delta + n) % n;
    if (isOff(options[next])) return;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      data-slot="field-segmented"
      data-testid={testId}
      data-invalid={invalid || undefined}
      aria-label={labelId ? undefined : ariaLabel}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className={cn(
        CONTROL_SURFACE,
        "inline-flex max-w-full items-stretch overflow-hidden rounded-lg p-0.5",
        compact ? "h-8 pointer-coarse:h-11 dense:pointer-fine:h-7" : "h-11 dense:pointer-fine:h-9",
        fill && "grid w-full",
        invalid && "border-destructive",
        className,
      )}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isOff(o)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(o.value)}
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
              "inline-flex h-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40",
              selected ? (o.selectedClassName ?? "bg-primary/10 text-primary-text") : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {Icon ? <Icon aria-hidden className="size-4" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// picker (a button that opens something else: a sheet, a page)

export function PickerControl({
  state,
  value,
  placeholder,
  onClick,
  testId,
  triggerRef,
  hasLabel,
  valueId,
  ...rest
}: {
  state: ControlState;
  value?: React.ReactNode;
  placeholder?: string;
  onClick?: () => void;
  testId?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
  hasLabel: boolean;
  valueId: string;
} & Omit<React.ComponentProps<"button">, "prefix" | "className" | "ref" | "value" | "onClick" | "type">) {
  const { id, describedBy, labelId, invalid, disabled, compact, row, prefix, suffix, className, ariaLabel } = state;
  const empty = value === undefined || value === null || value === "";
  return (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      data-slot="field-picker"
      data-testid={testId}
      data-invalid={invalid || undefined}
      disabled={disabled}
      onClick={onClick}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-labelledby={hasLabel ? `${labelId} ${valueId}` : undefined}
      aria-label={hasLabel ? undefined : ariaLabel}
      {...rest}
      className={cn(
        "flex items-center gap-2 text-left transition-colors active:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
        row
          ? "min-h-11 dense:pointer-fine:min-h-9 w-full min-w-0 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-md"
          : cn(CONTROL_SURFACE, compact ? CONTROL_BOX_COMPACT : CONTROL_BOX, CONTROL_STATE, CONTROL_FOCUS_VISIBLE),
        className,
      )}
    >
      {prefix}
      <span
        id={valueId}
        className={cn(
          "min-w-0 flex-1 truncate",
          empty && invalid ? "text-neg" : empty ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {empty ? (invalid ? "Required" : placeholder) : value}
      </span>
      {suffix}
      {!row && <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}


