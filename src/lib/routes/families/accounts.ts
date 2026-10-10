import { Plus, Receipt } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the accounts family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/accounts",
    family: "accounts",
    kind: "list",
    fab: { kind: "route", label: "Add account", icon: Plus, href: "/accounts/new" },
  },
  {
    pattern: "/accounts/new",
    family: "accounts",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/accounts/[id]/edit",
    family: "accounts",
    kind: "form",
    fab: { kind: "hidden", reason: "is the edit flow" },
    fullScreen: true,
  },
  {
    pattern: "/accounts/[id]",
    family: "accounts",
    kind: "detail",
    fab: { kind: "handler", label: "New transaction", icon: Receipt, handlerKey: "accounts.detail.add", fallbackHref: "/transactions/new", },
  },
  {
    pattern: "/accounts/groups",
    family: "accounts",
    kind: "form",
    fab: { kind: "hidden", reason: "manage list; no create action" },
  },
];
