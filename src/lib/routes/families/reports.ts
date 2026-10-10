import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the reports family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/dashboard",
    family: "reports",
    kind: "report",
    fab: { kind: "route", label: "New transaction", icon: Plus, href: "/transactions/new" },
  },
  {
    pattern: "/fire",
    family: "reports",
    kind: "report",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/reports",
    family: "reports",
    kind: "report",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/scenarios",
    family: "reports",
    kind: "report",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/tax",
    family: "reports",
    kind: "report",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/transactions/audit",
    family: "reports",
    kind: "report",
    fab: { kind: "fallback" },
  },
];
