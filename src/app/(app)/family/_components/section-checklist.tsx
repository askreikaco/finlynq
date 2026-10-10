"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FAMILY_OVERVIEW_SECTIONS, type FamilySection } from "@/lib/family/sections";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { getSectionDescription, getSectionLabel } from "./section-labels";

interface Props {
  legend: string;
  selected: ReadonlySet<FamilySection>;
  onChange: (next: Set<FamilySection>) => void;
  /** checked + disabled (must-share-back minimum) */
  locked?: ReadonlySet<FamilySection>;
  disabled?: boolean;
}

/**
 * Accessible sections checklist: fieldset/legend, one labelled checkbox per OVERVIEW section.
 * Retired sections (accounts/goals/budgets) are never offered; if an existing share or a
 * must-share-back minimum already contains one, it is carried through `selected` untouched.
 */
export function SectionChecklist({ legend, selected, onChange, locked, disabled }: Props) {
  const uid = useId();
  const isLocked = (s: FamilySection) => locked?.has(s) ?? false;
  const allSelected = FAMILY_OVERVIEW_SECTIONS.every((s) => selected.has(s) || isLocked(s));

  const toggle = (s: FamilySection, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(s);
    else if (!isLocked(s)) next.delete(s);
    onChange(next);
  };

  return (
    <fieldset className="space-y-3 min-w-0">
      <legend className="text-base font-semibold mb-2">{legend}</legend>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${uid}-all`}
          checked={allSelected}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? new Set([...selected, ...FAMILY_OVERVIEW_SECTIONS])
                : new Set([...selected].filter((s) => !FAMILY_OVERVIEW_SECTIONS.includes(s) || isLocked(s))),
            )
          }
        />
        <Label htmlFor={`${uid}-all`} className="font-medium cursor-pointer">
          {FAMILY_STRINGS.invite_dialog_all_sections}
        </Label>
      </div>
      <div className="space-y-2 pl-4 regular:pl-6 border-l-2 border-muted">
        {FAMILY_OVERVIEW_SECTIONS.map((s) => (
          <div key={s} className="flex items-center justify-between gap-3 min-h-row">
            <Label htmlFor={`${uid}-${s}`} className="font-normal cursor-pointer flex-1 min-w-0 flex-col items-start gap-0">
              <span className="font-medium">{getSectionLabel(s)}</span>
              <span className="text-xs text-muted-foreground">
                {getSectionDescription(s)}
                {isLocked(s) ? ` — ${FAMILY_STRINGS.update_sections_locked}` : ""}
              </span>
            </Label>
            <Switch
              id={`${uid}-${s}`}
              checked={selected.has(s) || isLocked(s)}
              disabled={disabled || isLocked(s)}
              onCheckedChange={(v) => toggle(s, v)}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
