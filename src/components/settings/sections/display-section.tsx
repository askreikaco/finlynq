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
import { Field } from "@/components/ui/field";
import { DropdownOrderSection } from "./dropdown-order-section";

const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/dropdown-order", section: "dropdown-order" }],
  valid: ["dropdown-order", "density"],
};

const DENSITY_LABEL: Record<Density, string> = { comfortable: "Comfortable", compact: "Compact" };

/** Comfortable (default) | Compact. */
function DensityRow() {
  const { density, setDensity } = useDensity();
  return (
    <Field
      control="segmented"
      aria-label="Density"
      value={density}
      onValueChange={(v) => setDensity(v as Density)}
      options={DENSITY_OPTIONS.map((option) => ({ value: option, label: DENSITY_LABEL[option] }))}
    />
  );
}

export function DisplaySection() {
  const [open, setOpen] = useOpenSection(OPEN_SECTIONS);
  return (
    <Accordion value={open} onValueChange={setOpen}>
      <AccordionItem
        value="dropdown-order"
        icon={<ListOrdered className="h-4 w-4" />}
        title="Dropdown order"
        info="Pin frequent items to the top of pickers."
      >
        <div id="dropdown-order">
          <DropdownOrderSection />
        </div>
      </AccordionItem>
      <AccordionItem
        value="density"
        icon={<Rows3 className="h-4 w-4" />}
        title="Density"
        info="Compact shortens list rows. This device only."
      >
        <div id="density">
          <DensityRow />
        </div>
      </AccordionItem>
    </Accordion>
  );
}
