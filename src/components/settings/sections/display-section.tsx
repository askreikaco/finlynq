"use client";

/**
 * Display section in General settings: "Dropdown ordering" (pin order for category,
 * account, holding and currency pickers) and "Density" (device-level, G2-08).
 * Old /settings/dropdown-order renders General in place with it open; old
 * /settings/display renders General.
 */

import { ListOrdered, Rows3 } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { useOpenSection } from "@/components/settings/use-open-section";
import { DENSITY_OPTIONS, useDensity, type Density } from "@/components/adaptive/density-provider";
import { cn } from "@/lib/utils";
import { DropdownOrderSection } from "./dropdown-order-section";

const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/dropdown-order", section: "dropdown-order" }],
  valid: ["dropdown-order", "density"],
};

const DENSITY_LABEL: Record<Density, string> = { comfortable: "Comfortable", compact: "Compact" };

/** Comfortable (default) | Compact. Same segmented style as the Cards / List toggle. */
function DensityRow() {
  const { density, setDensity } = useDensity();
  return (
    <div
      role="radiogroup"
      aria-label="Density"
      className="inline-grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-card p-0.5"
    >
      {DENSITY_OPTIONS.map((option) => {
        const selected = option === density;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setDensity(option)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              "pointer-coarse:h-11 pointer-coarse:px-4",
              selected ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {DENSITY_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}

export function DisplaySection() {
  const [open, setOpen] = useOpenSection(OPEN_SECTIONS);
  return (
    <Accordion value={open} onValueChange={setOpen}>
      <AccordionItem
        value="dropdown-order"
        icon={<ListOrdered className="h-4 w-4" />}
        title="Dropdown ordering"
        description="Pin frequently-used items to the top of category, account, holding, and currency pickers"
      >
        <div id="dropdown-order">
          <DropdownOrderSection />
        </div>
      </AccordionItem>
      <AccordionItem
        value="density"
        icon={<Rows3 className="h-4 w-4" />}
        title="Density"
        description="Comfortable is the default. Compact shortens list rows on this device only."
      >
        <div id="density">
          <DensityRow />
        </div>
      </AccordionItem>
    </Accordion>
  );
}
