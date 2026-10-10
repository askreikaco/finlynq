import type { RouteDef } from "../types";

/** Routes of the aliases family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
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
    pattern: "/settings/import",
    family: "aliases",
    kind: "tool",
    fab: { kind: "fallback" },
  },
];
