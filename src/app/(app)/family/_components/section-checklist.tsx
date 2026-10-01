"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FAMILY_SECTIONS_V1, type FamilySection } from "@/lib/family/sections";
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

/** Accessible sections checklist: fieldset/legend, one labelled checkbox per registry section. */
export function SectionChecklist({ legend, selected, onChange, locked, disabled }: Props) {
  const uid = useId();
  const isLocked = (s: FamilySection) => locked?.has(s) ?? false;
  const allSelected = FAMILY_SECTIONS_V1.every((s) => selected.has(s));

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
            onChange(checked ? new Set(FAMILY_SECTIONS_V1) : new Set(FAMILY_SECTIONS_V1.filter(isLocked)))
          }
        />
        <Label htmlFor={`${uid}-all`} className="font-medium cursor-pointer">
          {FAMILY_STRINGS.invite_dialog_all_sections}
        </Label>
      </div>
      <div className="space-y-2 pl-4 sm:pl-6 border-l-2 border-muted">
        {FAMILY_SECTIONS_V1.map((s) => (
          <div key={s} className="flex items-start gap-2">
            <Checkbox
              id={`${uid}-${s}`}
              checked={selected.has(s) || isLocked(s)}
              disabled={disabled || isLocked(s)}
              onCheckedChange={(checked) => toggle(s, checked)}
              className="mt-0.5"
            />
            <Label htmlFor={`${uid}-${s}`} className="font-normal cursor-pointer flex-col items-start gap-0">
              <span className="font-medium">{getSectionLabel(s)}</span>
              <span className="text-xs text-muted-foreground">
                {getSectionDescription(s)}
                {isLocked(s) ? ` — ${FAMILY_STRINGS.update_sections_locked}` : ""}
              </span>
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
