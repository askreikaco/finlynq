"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const ROW_BASE = "flex w-full min-h-12 items-center gap-3 px-4 text-left";
const LABEL = "w-24 shrink-0 text-sm text-muted-foreground";

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
}

export type FormRowProps = FormRowButtonProps | FormRowInputProps;

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
 * One row of the New Transaction field list: label on the left (96px), value on the right.
 * variant "button": the whole row is a <button>; its accessible name is label + value.
 * variant "input": the row renders a <label htmlFor> and a text <input>.
 */
export function FormRow(props: FormRowProps) {
  const generatedId = React.useId();
  const { label, invalid, testId, right, className } = props;
  const labelClass = cn(LABEL, invalid && "text-neg");

  if (props.variant === "button") {
    return (
      <button
        type="button"
        data-testid={testId}
        disabled={props.disabled}
        onClick={props.onClick}
        className={cn(ROW_BASE, "transition-colors active:bg-muted disabled:opacity-50", className)}
      >
        <span className={labelClass}>{label}</span>{" "}
        <ValueText value={props.value} placeholder={props.placeholder} invalid={invalid} />
        {right}
      </button>
    );
  }

  const inputId = props.id ?? generatedId;
  return (
    <div data-testid={testId} className={cn(ROW_BASE, className)}>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      <input
        id={inputId}
        value={props.inputValue}
        onChange={(e) => props.onInputChange(e.target.value)}
        onFocus={props.onInputFocus}
        onBlur={props.onInputBlur}
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
  );
}
