import { Compass, LayoutGrid, Link2, Palette, ShieldCheck, SlidersHorizontal, User, Wrench, type LucideIcon } from "lucide-react";
import type { MetricTone } from "./card-label";

const GROUP_ICONS = (): Array<[RegExp, LucideIcon, MetricTone]> => [
  [/account/i, User, "indigo"],
  [/appearance/i, Palette, "violet"],
  [/explore/i, Compass, "cyan"],
  [/tools/i, Wrench, "amber"],
  [/admin/i, ShieldCheck, "rose"],
  [/preferences/i, SlidersHorizontal, "indigo"],
  [/connection|integration/i, Link2, "cyan"],
];

/** Icon + tone for a hub / menu group title (More, Settings): known titles get their own, others a neutral grid icon. */
export function groupLabelIcon(title: unknown): { icon: LucideIcon; tone: MetricTone } {
  if (typeof title === "string") {
    for (const [rx, icon, tone] of GROUP_ICONS()) if (rx.test(title)) return { icon, tone };
  }
  return { icon: LayoutGrid, tone: "muted" };
}
