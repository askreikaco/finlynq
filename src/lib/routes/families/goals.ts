import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the goals family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/goals",
    family: "goals",
    kind: "list",
    fab: { kind: "route", label: "Add goal", icon: Plus, href: "/goals/new" },
  },
  {
    pattern: "/goals/[id]/edit",
    family: "goals",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
  {
    pattern: "/goals/new",
    family: "goals",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
];
