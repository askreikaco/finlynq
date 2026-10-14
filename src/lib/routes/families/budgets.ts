import type { RouteDef } from "../types";

/** Routes of the budgets family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/budgets/move-money",
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
