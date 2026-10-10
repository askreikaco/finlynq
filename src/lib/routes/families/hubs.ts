import type { RouteDef } from "../types";

/** Routes of the hubs family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/account",
    family: "hubs",
    kind: "hub",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/account/info",
    family: "hubs",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/account/security",
    family: "hubs",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/more",
    family: "hubs",
    kind: "hub",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings",
    family: "hubs",
    kind: "hub",
    fab: { kind: "fallback" },
  },
];
