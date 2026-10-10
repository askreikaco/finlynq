import type { RouteDef } from "../types";

/** Routes of the aliases family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/admin/env",
    family: "aliases",
    kind: "alias",
    fab: { kind: "redirect" },
  },
  {
    pattern: "/connect",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/bank-feeds",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/data",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/display",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/dropdown-order",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/holding-accounts",
    family: "aliases",
    kind: "alias",
    fab: { kind: "redirect" },
  },
  {
    pattern: "/settings/import",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/securities",
    family: "aliases",
    kind: "alias",
    fab: { kind: "redirect" },
  },
];
