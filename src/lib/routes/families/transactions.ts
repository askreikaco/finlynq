import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the transactions family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/transactions",
    family: "transactions",
    kind: "list",
    fab: { kind: "route", label: "Add transaction", icon: Plus, href: "/transactions/new" },
  },
  {
    pattern: "/transactions/new",
    family: "transactions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/transactions/[id]/edit",
    family: "transactions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
  {
    pattern: "/transactions/transfer/[linkId]/edit",
    family: "transactions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
  {
    pattern: "/transactions/[id]/split",
    family: "transactions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the split flow" },
    fullScreen: true,
  },
  {
    pattern: "/transactions/search",
    family: "transactions",
    kind: "form",
    fab: { kind: "hidden", reason: "sticky bottom Reset/Search bar" },
  },
];
