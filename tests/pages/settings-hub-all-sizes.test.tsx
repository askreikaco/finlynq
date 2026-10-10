/**
 * @vitest-environment jsdom
 */
/**
 * G2-06: the Settings hub is the only section switcher at every size, and FINLYNQ_NAV_V2 is gone.
 * - no aside, pill row or tab strip in the shell, at any size (the shell has no size-specific markup)
 * - the hub renders with no flag; nothing in settings reads an env flag
 * - every settings route is reachable from the hub (directly, as a child, as a registry alias, or via a
 *   listed access path); any new unreachable route fails here
 * - FINLYNQ_NAV_V2 / nav-v2 / navV2 are absent from src
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join, relative, sep } from "path";
import { render, cleanup } from "@testing-library/react";

let mockPath = "/settings/general";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
}));

import { SettingsShell } from "@/components/settings-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getEntriesBySurface, ALIASES } from "@/lib/nav-config";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

/** Settings routes with no link from the hub or a hub page. Each one is listed here on purpose. */
const KNOWN_UNLINKED: Record<string, string> = {
  "/settings/account": "legacy redirect to /account/security (G2-15); no hub link, external links (OAuth callback, MCP guide) still resolve",
};
/** Routes reached from a hub page through a control that is not a registry alias. */
const LISTED_ACCESS: Record<string, string> = {
  "/settings/backfill": "Developer > Data section button (data-section.tsx)",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Route path of every settings page.tsx under src/app/(app)/settings. */
function settingsRoutes(): string[] {
  const base = join(SRC, "app", "(app)", "settings");
  return walk(base)
    .filter((f) => f.endsWith(`${sep}page.tsx`))
    .map((f) => {
      const rel = relative(base, f).split(sep).slice(0, -1);
      return ["/settings", ...rel].join("/");
    })
    .sort();
}

beforeEach(() => {
  mockPath = "/settings/general";
});

afterEach(() => {
  cleanup();
});

describe("Settings hub at every size (G2-06)", () => {
  it("the shell renders no aside, pill strip or tab strip on a sub-page", () => {
    mockPath = "/settings/investments";
    const { container } = render(
      <SettingsShell>
        <div>Detail</div>
      </SettingsShell>,
    );
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('nav[aria-label="Settings sections"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelectorAll('a[href^="/settings/"]').length).toBe(0);
  });

  it("the shell renders no aside, pill strip or tab strip on the hub", () => {
    mockPath = "/settings";
    const { container } = render(
      <SettingsShell>
        <SettingsHub />
      </SettingsShell>,
    );
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('nav[aria-label="Settings sections"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="settings-hub-row"]').length).toBe(7);
  });

  it("the shell and hub source carry no size-specific layout (no md/lg/max-md tokens, no wrappers)", () => {
    for (const rel of ["src/components/settings-shell.tsx", "src/components/settings-hub.tsx"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/(^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):/m);
      expect(src, rel).not.toMatch(/CompactOnly|FromMd|<aside|matchMedia|isMobile|innerWidth/);
    }
  });

  it("the hub renders the same with no flag set, set to 0, or set to 1 (no env read in settings)", () => {
    const original = process.env.FINLYNQ_NAV_V2;
    const html: string[] = [];
    for (const value of [undefined, "0", "1"]) {
      if (value === undefined) delete process.env.FINLYNQ_NAV_V2;
      else process.env.FINLYNQ_NAV_V2 = value;
      const { container, unmount } = render(<SettingsHub />);
      html.push(container.innerHTML);
      unmount();
    }
    if (original === undefined) delete process.env.FINLYNQ_NAV_V2;
    else process.env.FINLYNQ_NAV_V2 = original;

    expect(html[1]).toBe(html[0]);
    expect(html[2]).toBe(html[0]);
    for (const rel of [
      "src/components/settings-hub.tsx",
      "src/components/settings-shell.tsx",
      "src/app/(app)/settings/page.tsx",
      "src/app/(app)/settings/layout.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/process\.env|redirect\(/);
    }
  });

  it("every settings surface entry in the registry is a hub row", () => {
    const { container } = render(<SettingsHub />);
    const hubHrefs = Array.from(container.querySelectorAll('[data-slot="settings-hub-row"]')).map((a) =>
      a.getAttribute("href"),
    );
    const registry = getEntriesBySurface("settings").map((e) => e.path);
    expect([...hubHrefs].sort()).toEqual([...registry].sort());
  });

  it("every settings route is reachable from the hub, or is listed with its access path", () => {
    const { container } = render(<SettingsHub />);
    const hubPaths = Array.from(container.querySelectorAll('[data-slot="settings-hub-row"]')).map((a) =>
      a.getAttribute("href") as string,
    );
    const aliasToHub = ALIASES.filter((a) => a.path.startsWith("/settings") && hubPaths.includes(a.target)).map(
      (a) => a.path,
    );

    const unreachable: string[] = [];
    for (const route of settingsRoutes()) {
      if (route === "/settings") continue;
      const viaHub = hubPaths.some((p) => route === p || route.startsWith(p + "/"));
      const viaAlias = aliasToHub.some((p) => route === p || route.startsWith(p + "/"));
      if (viaHub || viaAlias) continue;
      const viaListed = Object.keys(LISTED_ACCESS).some((p) => route === p || route.startsWith(p + "/"));
      if (viaListed || KNOWN_UNLINKED[route]) continue;
      unreachable.push(route);
    }
    expect(unreachable, `settings routes not reachable from the hub: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("the listed access paths are still real (the control exists in source)", () => {
    expect(read("src/components/settings/sections/data-section.tsx")).toContain('"/settings/backfill"');
  });

  it("the known unlinked route still exists (so the exception list does not hide a deleted page)", async () => {
    // A route is "still there" as a page, or as a nav-config redirect once its page was removed (G2-15).
    const { REDIRECTS } = await import("@/lib/nav-config");
    for (const route of Object.keys(KNOWN_UNLINKED)) {
      const isPage = existsSync(join(SRC, "app", "(app)", route, "page.tsx"));
      const isRedirect = REDIRECTS.some((r) => r.source === route);
      expect(isPage || isRedirect, route).toBe(true);
    }
  });

  it("FINLYNQ_NAV_V2, nav-v2 and navV2 are absent from src", () => {
    const hits: string[] = [];
    for (const f of walk(SRC)) {
      if (!/\.(ts|tsx|js|jsx|css|md)$/.test(f)) continue;
      if (/NAV_V2|nav-v2|navV2|isNavV2Enabled/.test(readFileSync(f, "utf-8"))) hits.push(relative(ROOT, f));
    }
    expect(hits).toEqual([]);
    expect(existsSync(join(SRC, "lib", "nav-v2"))).toBe(false);
  });
});
