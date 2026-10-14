"use client";

/**
 * Kill-switch guards: the Next middleware answers 404 for /family* (FAMILY_WEALTH_ENABLED=0) and /admin/instance*
 * (FINLYNQ_INSTANCE_ADMIN off) before any page renders. nginx serves SPA routes without touching Next, so the SPA
 * repeats the check against GET /api/config/flags (runtime env, never inlined): a disabled route renders the
 * same "not found" state as an unknown route (RouteError, NotFoundError). Until the flags answered in this page
 * load a guarded route renders nothing (no flash of a disabled page); an unreachable flags API fails closed.
 */
import { createElement, type ComponentType, type ReactNode } from "react";
import { isFamilyWealthPath } from "@/lib/family/flag";
import { isInstanceAdminPath } from "@/lib/admin/instance-flag";
import { useFlags, useFlagsLoaded, type Flags } from "./flags";
import { NotFoundError } from "./shims/next-navigation";

/** Pure: which flag decides whether `route` (Next form, "/admin/instance/x") exists. null = unguarded. */
export function guardOf(route: string): ((f: Flags) => boolean) | null {
  if (isFamilyWealthPath(route)) return (f) => f.familyWealth;
  if (isInstanceAdminPath(route)) return (f) => f.instanceAdmin;
  return null;
}

function Guard({ allow, children }: { allow: (f: Flags) => boolean; children: ReactNode }) {
  const flags = useFlags();
  const loaded = useFlagsLoaded();
  if (!loaded) return null;
  if (!allow(flags)) throw new NotFoundError();
  return children;
}

/** Wrap a route component in its kill-switch guard (identity for unguarded routes). */
export function guarded(route: string, Component: ComponentType): ComponentType {
  const allow = guardOf(route);
  if (!allow) return Component;
  return function Guarded() {
    return createElement(Guard, { allow, children: createElement(Component) });
  };
}
