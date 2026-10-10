import { Zap } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the rules family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/settings/rules",
    family: "rules",
    kind: "list",
    fab: { kind: "route", label: "Add rule", icon: Zap, href: "/settings/rules/new" },
  },
  {
    pattern: "/settings/rules/new",
    family: "rules",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/rules/[id]/edit",
    family: "rules",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
];
