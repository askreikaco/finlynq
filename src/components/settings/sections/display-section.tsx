"use client";

/**
 * Display section in General settings — "Dropdown ordering" accordion section
 * (pin order for category, account, holding and currency pickers). Old
 * /settings/dropdown-order renders General in place with it open; old
 * /settings/display renders General.
 */

import { ListOrdered } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { useOpenSection } from "@/components/settings/use-open-section";
import { DropdownOrderSection } from "./dropdown-order-section";

const OPEN_SECTIONS = {
  byPath: [{ prefix: "/settings/dropdown-order", section: "dropdown-order" }],
  valid: ["dropdown-order"],
};

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
    </Accordion>
  );
}
