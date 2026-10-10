// Guard (a) + (c): every page.tsx under src/app/(app) renders a template (or is a registered alias, or is a
// not-yet-migrated entry of its family baseline), and every route has exactly one RouteDef in one families/*.ts file.
// Ratchet: the unmigrated list may only shrink. A migrated page must leave the list (tight ratchet).
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { ALL_ROUTES } from "../../src/lib/routes";
import { ROUTES as goals } from "../../src/lib/routes/families/goals";
import { ROUTES as loans } from "../../src/lib/routes/families/loans";
import { ROUTES as subscriptions } from "../../src/lib/routes/families/subscriptions";
import { ROUTES as budgets } from "../../src/lib/routes/families/budgets";
import { ROUTES as categories } from "../../src/lib/routes/families/categories";
import { ROUTES as rules } from "../../src/lib/routes/families/rules";
import { ROUTES as investments } from "../../src/lib/routes/families/investments";
import { ROUTES as accounts } from "../../src/lib/routes/families/accounts";
import { ROUTES as transactions } from "../../src/lib/routes/families/transactions";
import { ROUTES as portfolio } from "../../src/lib/routes/families/portfolio";
import { ROUTES as reports } from "../../src/lib/routes/families/reports";
import { ROUTES as hubs } from "../../src/lib/routes/families/hubs";
import { ROUTES as settings } from "../../src/lib/routes/families/settings";
import { ROUTES as admin } from "../../src/lib/routes/families/admin";
import { ROUTES as familyImport } from "../../src/lib/routes/families/family-import";
import { ROUTES as misc } from "../../src/lib/routes/families/misc";
import { ROUTES as aliases } from "../../src/lib/routes/families/aliases";
import type { RouteDef } from "../../src/lib/routes/types";
import {
  APP_DIR,
  BASELINE_DIR,
  FAMILIES,
  ROOT,
  importsTemplates,
  isPageFile,
  kindOfPage,
  listAppFiles,
  loadBaselines,
  ownerFamilyOf,
  pageRatchet,
  readFiles,
  routeOfDir,
} from "./scan";

const FAMILY_MODULES: Record<string, RouteDef[]> = {
  goals,
  loans,
  subscriptions,
  budgets,
  categories,
  rules,
  investments,
  accounts,
  transactions,
  portfolio,
  reports,
  hubs,
  settings,
  admin,
  "family-import": familyImport,
  misc,
  aliases,
};

const appFiles = listAppFiles();
const pageFiles = appFiles.filter(isPageFile);
const contents = readFiles(pageFiles);
const baselines = loadBaselines();

const aliasPages = new Set(pageFiles.filter((p) => kindOfPage(p) === "alias"));
const unmigratedEntries = Object.values(baselines).flatMap((b) => b.unmigrated.map((file) => ({ family: b.family, file })));
const unmigrated = new Set(unmigratedEntries.map((e) => e.file));

describe("page-template guard: baseline files", () => {
  it("has exactly one baseline per route family, named after the family", () => {
    const onDisk = fs
      .readdirSync(BASELINE_DIR)
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/, ""))
      .sort();
    expect(onDisk).toEqual([...FAMILIES].sort());
  });

  it("each baseline names its own family", () => {
    const wrong = Object.entries(baselines)
      .filter(([name, b]) => b.family !== name)
      .map(([name, b]) => `${name}.json says family=${b.family}`);
    expect(wrong).toEqual([]);
  });

  it("each unmigrated entry is owned by the family whose baseline lists it", () => {
    const wrong = unmigratedEntries
      .filter((e) => ownerFamilyOf(e.file) !== e.family)
      .map((e) => `${e.file} listed in ${e.family}.json but owned by ${ownerFamilyOf(e.file) ?? "nobody"}`);
    expect(wrong).toEqual([]);
  });

  it("no page is listed in two baselines", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const e of unmigratedEntries) {
      if (seen.has(e.file)) dupes.push(`${e.file} in ${seen.get(e.file)} and ${e.family}`);
      seen.set(e.file, e.family);
    }
    expect(dupes).toEqual([]);
  });
});

describe("page-template guard (a): every page renders a template", () => {
  const { newPages, stale } = pageRatchet(contents, aliasPages, unmigrated);

  it("no new page file lacks an @/components/templates import (new pages must comply; alias pages are exempt)", () => {
    expect(
      newPages,
      `New page files must import from @/components/templates or be a registered alias: ${newPages.join(", ")}`
    ).toEqual([]);
  });

  it("ratchet tightens: a migrated page must be removed from its baseline", () => {
    expect(
      stale,
      `Baseline lists pages that are gone, aliased or already on a template (remove them): ${stale.join(", ")}`
    ).toEqual([]);
  });

  it("every baseline page still exists on disk", () => {
    const missing = unmigratedEntries
      .filter((e) => !(e.file in contents))
      .map((e) => e.file);
    expect(missing).toEqual([]);
  });

  it("mutation self-check: an in-memory page without the templates import is reported as new", () => {
    const plain = "export default function P() { return <div />; }";
    const templated = 'import { ListPage } from "@/components/templates";\nexport default function P() { return <ListPage />; }';
    expect(importsTemplates(plain)).toBe(false);
    expect(importsTemplates(templated)).toBe(true);
    const fake = { [`${APP_DIR}/zz-new/page.tsx`]: plain };
    expect(pageRatchet(fake, new Set(), new Set()).newPages).toEqual([`${APP_DIR}/zz-new/page.tsx`]);
    expect(pageRatchet({ [`${APP_DIR}/zz-new/page.tsx`]: templated }, new Set(), new Set())).toEqual({
      newPages: [],
      stale: [],
    });
  });
});

describe("page-template guard (c): every route has exactly one RouteDef", () => {
  const routeOfPage = (file: string) => routeOfDir(path.posix.dirname(file));
  const pageRoutes = pageFiles.map(routeOfPage);
  const registered = new Set(ALL_ROUTES.map((r) => r.pattern));

  it("each families/*.ts file on disk is a known family, and every entry in it has that family", () => {
    const onDisk = fs
      .readdirSync(path.join(ROOT, "src/lib/routes/families"))
      .filter((n) => n.endsWith(".ts"))
      .map((n) => n.replace(/\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...FAMILIES].sort());
    const wrong: string[] = [];
    for (const [name, defs] of Object.entries(FAMILY_MODULES)) {
      for (const d of defs) if (d.family !== name) wrong.push(`${d.pattern} in families/${name}.ts has family=${d.family}`);
    }
    expect(wrong).toEqual([]);
  });

  it("ALL_ROUTES holds every family entry, once", () => {
    const total = Object.values(FAMILY_MODULES).reduce((n, defs) => n + defs.length, 0);
    expect(ALL_ROUTES).toHaveLength(total);
  });

  it("every page.tsx route has an entry", () => {
    const missing = pageRoutes.filter((r) => !registered.has(r));
    expect(missing, `Pages without a RouteDef: ${missing.join(", ")}`).toEqual([]);
  });

  it("every page.tsx route has exactly one entry across families/*.ts", () => {
    const bad = pageRoutes
      .map((route) => {
        const hits = Object.entries(FAMILY_MODULES).filter(([, defs]) => defs.some((d) => d.pattern === route));
        return { route, n: hits.length, files: hits.map(([name]) => name) };
      })
      .filter((x) => x.n !== 1)
      .map((x) => `${x.route}: in ${x.n} families (${x.files.join(", ") || "none"})`);
    expect(bad).toEqual([]);
  });

  it("no RouteDef is stale: every entry has a page.tsx", () => {
    const pageSet = new Set(pageRoutes);
    const stale = ALL_ROUTES.map((r) => r.pattern).filter((p) => !pageSet.has(p));
    expect(stale, `RouteDef entries without a page.tsx: ${stale.join(", ")}`).toEqual([]);
  });

  it("no route pattern is registered twice", () => {
    const patterns = ALL_ROUTES.map((r) => r.pattern);
    expect(patterns.filter((p, i) => patterns.indexOf(p) !== i)).toEqual([]);
  });
});
