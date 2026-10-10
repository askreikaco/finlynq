import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the loans family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/loans",
    family: "loans",
    kind: "list",
    fab: { kind: "route", label: "Add loan", icon: Plus, href: "/loans/new" },
  },
  {
    pattern: "/loans/new",
    family: "loans",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/loans/[id]/edit",
    family: "loans",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
];
