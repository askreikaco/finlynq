import { Tag } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the categories family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/categories",
    family: "categories",
    kind: "list",
    fab: { kind: "route", label: "Add category", icon: Tag, href: "/categories?edit=new" },
  },
  {
    pattern: "/categories/[id]",
    family: "categories",
    kind: "tool",
    fab: { kind: "fallback" },
  },
];
