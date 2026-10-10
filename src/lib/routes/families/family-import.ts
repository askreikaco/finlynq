import { Upload, UserPlus } from "lucide-react";
import type { RouteDef } from "../types";

/** Routes of the family-import family. FAB and full-screen facts moved here unchanged from fab-registry / nav.tsx. */
export const ROUTES: RouteDef[] = [
  {
    pattern: "/family",
    family: "family-import",
    kind: "list",
    fab: { kind: "route", label: "Invite", icon: UserPlus, href: "/family/share" },
  },
  {
    pattern: "/family/accept",
    family: "family-import",
    kind: "form",
    fab: { kind: "hidden", reason: "one-shot invite-accept flow" },
  },
  {
    pattern: "/family/share",
    family: "family-import",
    kind: "list",
    fab: { kind: "handler", label: "Invite", icon: UserPlus, handlerKey: "family.invite" },
  },
  {
    pattern: "/import",
    family: "family-import",
    kind: "list",
    fab: { kind: "handler", label: "Upload statement", icon: Upload, handlerKey: "import.upload" },
  },
  {
    pattern: "/import/pending",
    family: "family-import",
    kind: "list",
    fab: { kind: "route", label: "Upload statement", icon: Upload, href: "/import" },
  },
  {
    pattern: "/manage-accounts",
    family: "family-import",
    kind: "list",
    fab: { kind: "handler", label: "Add another account", icon: UserPlus, handlerKey: "manage-accounts.add", },
  },
];
