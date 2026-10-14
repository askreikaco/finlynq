/**
 * Route table: built from the Next file convention under src/app/(app) (pages + nested layouts), so the
 * SPA reuses the same files. Conversion: [id] -> :id, route groups (x) removed, [...slug] -> *.
 * Only routes listed in routes.config.ts are registered (strangler); each page/layout is a lazy import,
 * so every page is its own chunk. src/spa/pages/<route>.tsx overrides a page file (client twin of a
 * server wrapper page), <route>/layout.tsx a layout file; (app)/layout.tsx is replaced by AppShell.tsx.
 */
import { createElement, useEffect, type ComponentType, type ReactNode } from "react";
import { Outlet, type RouteObject } from "react-router";
import { SPA_ROUTES } from "./routes.config";
import { guarded } from "./guards";

type Mod = { default: ComponentType<{ children?: ReactNode }>; metadata?: { title?: unknown } };
type Loader = () => Promise<unknown>;

// Relative to this file; the nested (app) layout.tsx at the root is excluded (AppShell replaces it).
const pageFiles = import.meta.glob("../app/(app)/**/page.tsx") as Record<string, Loader>;
const layoutFiles = import.meta.glob(["../app/(app)/**/layout.tsx", "!../app/(app)/layout.tsx"]) as Record<string, Loader>;
const overrideFiles = import.meta.glob("./pages/**/*.tsx") as Record<string, Loader>;

const APP_PREFIX = "../app/(app)/";

/** Every page route of the app (enabled or not): needed to know which static siblings a dynamic route must not swallow. */
export const PAGE_ROUTES: string[] = Object.keys(pageFiles).map((f) => fileToNextRoute(f));

function segmentToPath(seg: string): string {
  if (/^\(.*\)$/.test(seg)) return "";
  if (/^\[\.\.\.(.+)\]$/.test(seg) || /^\[\[\.\.\.(.+)\]\]$/.test(seg)) return "*";
  const m = /^\[(.+)\]$/.exec(seg);
  return m ? `:${m[1]}` : seg;
}

/** "../app/(app)/settings/about/page.tsx" -> "/settings/about" (Next form, groups removed, [id] kept). */
export function fileToNextRoute(file: string): string {
  const dir = file.slice(APP_PREFIX.length).replace(/\/?(page|layout)\.tsx$/, "");
  const segs = dir.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return "/" + segs.join("/");
}

function titleOf(m: Mod): string | null {
  const t = m.metadata?.title;
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "absolute" in t && typeof (t as { absolute: unknown }).absolute === "string") return (t as { absolute: string }).absolute;
  return null;
}

function Titled({ title, children }: { title: string | null; children: ReactNode }) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
  return children;
}

function pageRoute(loader: Loader, route: string): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => {
      const m = (await loader()) as Mod;
      const Page = m.default;
      const title = titleOf(m);
      return { Component: guarded(route, () => createElement(Titled, { title, children: createElement(Page) })) };
    },
  };
}

function layoutRoute(loader: Loader, route: string): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => {
      const m = (await loader()) as Mod;
      const Layout = m.default;
      return { Component: guarded(route, () => createElement(Layout, null, createElement(Outlet))) };
    },
  };
}

/** `path` = Next-form route of the directory ("/family/accept"), used for the kill-switch guards. */
type Dir = { seg: string; path: string; page?: Loader; layout?: Loader; children: Map<string, Dir> };

function buildDirs(): Dir {
  const root: Dir = { seg: "", path: "", children: new Map() };
  const enabled = new Set(SPA_ROUTES);
  const dirOf = (file: string) => {
    let d = root;
    const rel = file.slice(APP_PREFIX.length).split("/").slice(0, -1);
    for (const seg of rel) {
      if (!d.children.has(seg)) d.children.set(seg, { seg, path: /^\(.*\)$/.test(seg) ? d.path : `${d.path}/${seg}`, children: new Map() });
      d = d.children.get(seg)!;
    }
    return d;
  };
  for (const [file, loader] of Object.entries(pageFiles)) {
    const route = fileToNextRoute(file);
    if (!enabled.has(route)) continue;
    const ovKey = "./pages" + route + ".tsx";
    const ovIdx = "./pages" + (route === "/" ? "/index" : route) + "/index.tsx";
    dirOf(file).page = overrideFiles[ovKey] ?? overrideFiles[ovIdx] ?? loader;
  }
  // Layouts only for directories that lead to an enabled page (prune empty branches below).
  // src/spa/pages/<route>/layout.tsx overrides a layout file (client twin of a server layout).
  for (const [file, loader] of Object.entries(layoutFiles)) dirOf(file).layout = overrideFiles["./pages" + fileToNextRoute(file) + "/layout.tsx"] ?? loader;
  return root;
}

function hasPage(d: Dir): boolean {
  return !!d.page || [...d.children.values()].some(hasPage);
}

function build(d: Dir): RouteObject[] {
  const out: RouteObject[] = [];
  if (d.page) out.push({ index: true, ...pageRoute(d.page, d.path || "/") });
  for (const c of d.children.values()) if (hasPage(c)) out.push(...build(c));
  const seg = segmentToPath(d.seg);
  if (d.layout) return [{ path: seg || undefined, ...layoutRoute(d.layout, d.path || "/"), children: out }];
  if (!seg) return out;
  // no layout: fold this segment into the children's paths
  return out.map((r) => {
    if (r.index) return { path: seg, lazy: r.lazy } as RouteObject;
    return { ...r, path: r.path ? `${seg}/${r.path}` : seg } as RouteObject;
  });
}

/** Children of the AppShell route. */
export function buildAppRoutes(): RouteObject[] {
  return build(buildDirs());
}
