"use client";

import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { groupSuggestions } from "@/lib/accounts/groups";

/** The account Group field: free text with the type's suggested groups and the user's existing groups as options. */
export function GroupField({
  type,
  value,
  existingGroups,
  onChange,
  id = "account-group",
  info,
  error,
}: {
  /** Account type ("A" | "L") — picks the default suggestion set. */
  type: string;
  /** Current group value (free text). */
  value: string;
  /** The user's existing group names (any type) to seed suggestions. */
  existingGroups: ReadonlyArray<string>;
  onChange: (next: string) => void;
  id?: string;
  info?: ReactNode;
  error?: string;
}) {
  return (
    <Field
      control="group-combobox"
      label="Group"
      info={info}
      error={error}
      id={id}
      value={value}
      onValueChange={onChange}
      options={groupSuggestions(type, existingGroups)}
      placeholder="e.g. Checking or Emergency Fund"
    />
  );
}
