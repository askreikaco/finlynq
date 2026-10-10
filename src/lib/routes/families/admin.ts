import { Megaphone } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the admin family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/admin",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/announcements",
    family: "admin",
    kind: "admin",
    fab: { kind: "handler", label: "New announcement", icon: Megaphone, handlerKey: "admin.announcements.new", },
  },
  {
    pattern: "/admin/api-log",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/diagnostics",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/email-inbox",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/feedback",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/inbox",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/instance",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/integrations",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/price-cache",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/admin/system",
    family: "admin",
    kind: "admin",
    fab: { kind: "fallback" },
  },
];
