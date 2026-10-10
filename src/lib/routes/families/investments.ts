import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the investments family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/settings/investments",
    family: "investments",
    kind: "list",
    fab: { kind: "route", label: "Add security", icon: Plus, href: "/settings/investments/securities/new", },
  },
  {
    pattern: "/settings/investments/accounts/[id]/link",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/investments/cash-sleeves/new",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/investments/securities/new",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/investments/securities/[id]/edit",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/investments/securities/[id]/link",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/settings/investments/securities/[id]/prices",
    family: "investments",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
];
