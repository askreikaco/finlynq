"use client";

import * as React from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldLabelProps {
  /** 1-3 words. */
  label: React.ReactNode;
  htmlFor?: string;
  /** Help text for the (i) tip beside the label (descriptions, rules, "optional", examples). */
  info?: React.ReactNode;
  /** Accessible name of the (i) button. Default "About <label>" when `label` is a string. */
  infoLabel?: string;
  className?: string;
  /** Extra classes for the label text (the default is the muted small form-label look). */
  labelClassName?: string;
}

/** A form label with its (i) InfoTip: the one place field help lives (never a paragraph under the input). */
export function FieldLabel({ label, htmlFor, info, infoLabel, className, labelClassName }: FieldLabelProps) {
  return (
    <span data-slot="field-label" className={cn("flex min-w-0 items-center gap-0.5", className)}>
      <Label htmlFor={htmlFor} className={cn("min-w-0 text-sm text-muted-foreground", labelClassName)}>
        <span className="truncate">{label}</span>
      </Label>
      {info ? (
        <InfoTip text={info} label={infoLabel ?? (typeof label === "string" ? `About ${label}` : undefined)} />
      ) : null}
    </span>
  );
}

export interface FormFieldProps extends FieldLabelProps {
  /** Validation error: stays visible, keep it short. */
  error?: string;
  /** Short warning that must be read: stays visible. */
  warning?: string;
  children: React.ReactNode;
}

/**
 * One form field: label (+ (i) tip) on top, the control below, then at most a short error / warning.
 * Same layout at 250px (split-view pane) and full width.
 */
export function FormField({ error, warning, children, className, ...label }: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("min-w-0 space-y-1", className)}>
      <FieldLabel {...label} />
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {warning ? <p className="text-xs text-warning">{warning}</p> : null}
    </div>
  );
}
