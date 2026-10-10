import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the budgets family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/budgets",
    family: "budgets",
    kind: "list",
    fab: { kind: "route", label: "Add budget", icon: Plus, href: "/budgets/new" },
  },
  {
    pattern: "/budgets/move-money",
    family: "budgets",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/budgets/new",
    family: "budgets",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/budgets/templates/apply",
    family: "budgets",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
  },
  {
    pattern: "/budgets/templates/new",
    family: "budgets",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
];
