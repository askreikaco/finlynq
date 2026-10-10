import { Coins, Plus, TrendingDown } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the portfolio family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/portfolio",
    family: "portfolio",
    kind: "list",
    fab: { kind: "route", label: "Add holding", icon: Plus, href: "/settings/investments" },
  },
  {
    pattern: "/portfolio/dividends",
    family: "portfolio",
    kind: "list",
    fab: { kind: "route", label: "Record dividend", icon: Coins, href: "/portfolio/new/income-expense", },
  },
  {
    pattern: "/portfolio/new",
    family: "portfolio",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
  },
  {
    pattern: "/portfolio/new/[op]",
    family: "portfolio",
    kind: "form",
    fab: { kind: "hidden", reason: "is the create flow" },
    fullScreen: true,
  },
  {
    pattern: "/portfolio/realized-gains",
    family: "portfolio",
    kind: "list",
    fab: { kind: "route", label: "Record sale", icon: TrendingDown, href: "/portfolio/new/sell", },
  },
];
