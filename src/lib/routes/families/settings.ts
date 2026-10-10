import { RefreshCw, Tag } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the settings family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/settings/about",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/account",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/backfill",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/backfill/[runId]",
    family: "settings",
    kind: "detail",
    fab: { kind: "route", label: "New run", icon: RefreshCw, href: "/settings/backfill" },
  },
  {
    pattern: "/settings/categorization",
    family: "settings",
    kind: "list",
    fab: { kind: "route", label: "Add category", icon: Tag, href: "/categories/new" },
  },
  {
    pattern: "/settings/developer",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/general",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/import/reconcile-visibility",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/integrations",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/settings/reconciliation",
    family: "settings",
    kind: "section",
    fab: { kind: "fallback" },
  },
];
