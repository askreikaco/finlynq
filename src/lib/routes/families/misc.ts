import { MessageSquarePlus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the misc family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/api-docs",
    family: "misc",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/chat",
    family: "misc",
    kind: "form",
    fab: { kind: "hidden", reason: "full-height composer" },
  },
  {
    pattern: "/dev/gallery",
    family: "misc",
    kind: "tool",
    fab: { kind: "fallback" },
  },
  {
    pattern: "/feedback",
    family: "misc",
    kind: "list",
    fab: { kind: "handler", label: "Send feedback", icon: MessageSquarePlus, handlerKey: "feedback.send" },
  },
  {
    pattern: "/whats-new",
    family: "misc",
    kind: "tool",
    fab: { kind: "fallback" },
  },
];
