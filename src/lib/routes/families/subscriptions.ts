import { Plus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the subscriptions family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/subscriptions",
    family: "subscriptions",
    kind: "list",
    fab: { kind: "route", label: "Add subscription", icon: Plus, href: "/subscriptions/new" },
  },
  {
    pattern: "/subscriptions/new",
    family: "subscriptions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/subscriptions/[id]/edit",
    family: "subscriptions",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
];
