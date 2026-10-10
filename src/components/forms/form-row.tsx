"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type FormLabelWidth = "default" | "narrow";
export type FormRowHeight = "default" | "tall";

// Literal Tailwind sizes: default w-28 / min-h-11, narrow w-24 / tall min-h-12.
// The --spacing-row* token vars (spec 2.1, C-01) are not in globals.css yet, so
// var() classes would drop the sizing. Switch these to TW.* in Wave 2.
const LABEL_WIDTH: Record<FormLabelWidth, string> = { default: "w-28", narrow: "w-24" };
const ROW_HEIGHT: Record<FormRowHeight, string> = { default: "min-h-11", tall: "min-h-12" };

const ROW_BASE = "flex w-full items-center gap-3 px-4 text-left";
const LABEL_BASE = "shrink-0 text-sm text-muted-foreground";

interface FormRowBaseProps {
  label: string;
  /** Picker value (button variant) or nothing (input variant uses `inputValue`). */
  value?: React.ReactNode;
  /** Shown muted when there is no value. */
  placeholder?: string;
  invalid?: boolean;
  testId?: string;
  /** Extra content after the value (chevron, switch, ...). */
  right?: React.ReactNode;
  className?: string;
  labelWidth?: FormLabelWidth;
  height?: FormRowHeight;
  /** Optional lucide icon shown before the label (18px, muted). Label column width is unchanged. */
  icon?: LucideIcon;
  /** Message rendered under the row (text-destructive). */
  error?: string;
  /** Helper text rendered under the row (muted). Ignored when `error` is set. */
  hint?: React.ReactNode;
}

export interface FormRowButtonProps extends FormRowBaseProps {
  variant: "button";
  onClick?: () => void;
  disabled?: boolean;
}

export interface FormRowInputProps extends FormRowBaseProps {
  variant: "input";
  id?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  autoComplete?: string;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface FormRowCustomProps extends FormRowBaseProps {
  variant: "custom";
  /** Id of the control inside `children`; makes the label a <label htmlFor>. */
  htmlFor?: string;
  children: React.ReactNode;
}

export type FormRowProps = FormRowButtonProps | FormRowInputProps | FormRowCustomProps;

function ValueText({
  value,
  placeholder,
  invalid,
}: {
  value?: React.ReactNode;
  placeholder?: string;
  invalid?: boolean;
}) {
  const empty = value === undefined || value === null || value === "";
  if (empty && invalid) {
    return <span className="min-w-0 flex-1 truncate text-base text-neg">Required</span>;
  }
  if (empty && placeholder) {
    return (
      <span className="min-w-0 flex-1 truncate text-base text-muted-foreground">{placeholder}</span>
    );
  }
  return <span className="min-w-0 flex-1 truncate text-base text-foreground">{value}</span>;
}

/**
 * One label-left row of a form. Variants:
 * - "button": the whole row is a <button>; accessible name is label + value.
 * - "input": a <label htmlFor> and a text <input>.
 * - "custom": label plus arbitrary `children` (any control).
 * Defaults: labelWidth "default" (w-28), height "default" (min-h-11).
 */
export function FormRow(props: FormRowProps) {
  const generatedId = React.useId();
  const { label, invalid, testId, right, className, error, hint, icon: Icon } = props;
  const rowClass = cn(ROW_BASE, ROW_HEIGHT[props.height ?? "default"]);
  const labelClass = cn(
    LABEL_BASE,
    LABEL_WIDTH[props.labelWidth ?? "default"],
    invalid && "text-neg",
    Icon && "flex items-center gap-2",
  );
  // Without an icon the label stays a bare string, so existing callers render exactly as before.
  const labelContent = Icon ? (
    <>
      <Icon aria-hidden="true" data-slot="form-row-icon" className="size-[18px] shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </>
  ) : (
    label
  );
  const note = error ? (
    <p className="px-4 pb-2 text-xs text-destructive">{error}</p>
  ) : hint ? (
    <div className="px-4 pb-2 text-xs text-muted-foreground">{hint}</div>
  ) : null;

  if (props.variant === "button") {
    return (
      <>
        <button
          type="button"
          data-testid={testId}
          disabled={props.disabled}
          onClick={props.onClick}
          className={cn(rowClass, "transition-colors active:bg-muted disabled:opacity-50", className)}
        >
          <span className={labelClass}>{labelContent}</span>{" "}
          <ValueText value={props.value} placeholder={props.placeholder} invalid={invalid} />
          {right}
        </button>
        {note}
      </>
    );
  }

  if (props.variant === "custom") {
    const LabelTag = props.htmlFor ? "label" : "span";
    return (
      <>
        <div data-testid={testId} className={cn(rowClass, className)}>
          <LabelTag htmlFor={props.htmlFor} className={labelClass}>
            {labelContent}
          </LabelTag>
          <div className="min-w-0 flex-1">{props.children}</div>
          {right}
        </div>
        {note}
      </>
    );
  }

  const inputId = props.id ?? generatedId;
  return (
    <>
      <div data-testid={testId} className={cn(rowClass, className)}>
        <label htmlFor={inputId} className={labelClass}>
          {labelContent}
        </label>
        <input
          id={inputId}
          value={props.inputValue}
          onChange={(e) => props.onInputChange(e.target.value)}
          onFocus={props.onInputFocus}
          onBlur={props.onInputBlur}
          onKeyDown={props.onInputKeyDown}
          inputMode={props.inputMode}
          enterKeyHint={props.enterKeyHint}
          autoComplete={props.autoComplete}
          aria-invalid={invalid || undefined}
          placeholder={props.placeholder}
          className={cn(
            "min-w-0 flex-1 truncate bg-transparent text-base text-foreground outline-none",
            "placeholder:text-muted-foreground",
            invalid && "placeholder:text-neg",
          )}
        />
        {right}
      </div>
      {note}
    </>
  );
}
