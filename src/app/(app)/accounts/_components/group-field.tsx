"use client";

import { Field } from "@/components/ui/field";
import { groupSuggestions } from "@/lib/accounts/groups";

export function GroupField({
  type,
  value,
  existingGroups,
  onChange,
  inputId = "account-group",
}: {
  /** Account type ("A" | "L") — picks the default suggestion set. */
  type: string;
  /** Current group value (free text). */
  value: string;
  /** The user's existing group names (any type) to seed suggestions. */
  existingGroups: ReadonlyArray<string>;
  onChange: (next: string) => void;
  inputId?: string;
}) {
  const suggestions = groupSuggestions(type, existingGroups);
  const current = value.trim().toLowerCase();

  return (
    <div className="space-y-1.5">
      <Field
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Checking or Emergency Fund"
        list={`${inputId}-suggestions`}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((g) => {
            const active = g.toLowerCase() === current;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onChange(g)}
                className={
                  "rounded-full border px-2 py-0.5 text-xs transition-colors " +
                  (active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted")
                }
              >
                {g}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
