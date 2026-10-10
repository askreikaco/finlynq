"use client";

import * as React from "react";

import { FormRow as SharedFormRow, type FormRowProps } from "@/components/forms";

export type {
  FormRowButtonProps,
  FormRowInputProps,
  FormRowProps,
} from "@/components/forms";

/**
 * Shim over the shared FormRow (src/components/forms). New Transaction rows keep
 * the old sizing: narrow label (w-24) and tall row (min-h-12).
 */
export function FormRow(props: FormRowProps) {
  return <SharedFormRow labelWidth="narrow" height="tall" {...props} />;
}
