/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";

let mockPath: string | null = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));

import { NAV_REGISTRY, getNavEntry } from "@/lib/nav-config";
import { resolveBackTarget, useBackTarget, levelOf } from "@/components/adaptive/use-back-target";
import { useBackTarget as fromIndex, resolveBackTarget as resolveFromIndex } from "@/components/adaptive";
import { PageHeader } from "@/components/mobile/page-header";

afterEach(() => {
  cleanup();
  mockPath = "/dashboard";
});

const ROUTE_ENTRIES = NAV_REGISTRY.filter((e) => !e.path.includes("?"));

describe("registry back targets: every level 2 and 3 entry resolves to its parent", () => {
  const deep = ROUTE_ENTRIES.filter((e) => levelOf(e) >= 2);

  it("there are level 2 and level 3 entries to check", () => {
    expect(deep.some((e) => levelOf(e) === 2)).toBe(true);
    expect(deep.some((e) => levelOf(e) === 3)).toBe(true);
  });

  it.each(deep.map((e) => [e.path, e.parent, levelOf(e)] as const))(
    "%s -> parent %s (level %i)",
    (path, parent, level) => {
      const t = resolveBackTarget(path);
      expect(t).toEqual({ href: parent, level });
    },
  );

  it("the import-reconcile shortcut (path with a query) is skipped by the resolver, its base path is /import", () => {
    expect(getNavEntry("/import?tab=reconcile")?.parent).toBe("/more");
    expect(resolveBackTarget("/import")).toEqual({ href: "/more", level: 2 });
  });

  it("every parent in the chain is a registry entry and levelOf terminates (no cycles)", () => {
    for (const e of ROUTE_ENTRIES) {
      expect(levelOf(e)).toBeLessThanOrEqual(4);
      if (e.parent) expect(getNavEntry(e.parent)).toBeDefined();
    }
  });
});

describe("levels", () => {
  it.each(["dashboard", "accounts", "portfolio", "transactions", "more"])("%s is level 1 with no back target", (id) => {
    const e = NAV_REGISTRY.find((x) => x.id === id)!;
    expect(levelOf(e)).toBe(1);
    expect(resolveBackTarget(e.path)).toEqual({ href: null, level: 1 });
  });

  it("the four tabs are the only level 1 surface entries", () => {
    const surfaced = NAV_REGISTRY.filter((e) => e.surfaces.length > 0 && levelOf(e) === 1).map((e) => e.path);
    expect(surfaced.sort()).toEqual(["/accounts", "/dashboard", "/portfolio", "/transactions"]);
  });
});

describe("dynamic and nested routes resolve by longest registry prefix", () => {
  it.each([
    ["/accounts/5", { href: "/accounts", level: 2 }],
    ["/accounts/5/edit", { href: "/accounts", level: 2 }],
    ["/transactions/42/edit", { href: "/transactions", level: 2 }],
    ["/transactions/42/split", { href: "/transactions", level: 2 }],
    ["/transactions/new", { href: "/transactions", level: 2 }],
    ["/transactions/transfer/7/edit", { href: "/transactions", level: 2 }],
    ["/budgets/new", { href: "/budgets", level: 3 }],
    ["/goals/12/edit", { href: "/goals", level: 3 }],
    ["/loans/new", { href: "/loans", level: 3 }],
    ["/subscriptions/3/edit", { href: "/subscriptions", level: 3 }],
    ["/categories/9/edit", { href: "/categories", level: 3 }],
    ["/settings/rules/new", { href: "/settings", level: 3 }],
    ["/settings/rules/4/edit", { href: "/settings", level: 3 }],
    ["/settings/investments/securities/8/prices", { href: "/settings/investments", level: 4 }],
    ["/settings/categorization", { href: "/settings", level: 3 }],
    ["/settings/general", { href: "/settings", level: 3 }],
    ["/account/info", { href: "/account", level: 3 }],
    ["/admin/system", { href: "/admin/env", level: 3 }],
    ["/admin/env", { href: "/more", level: 2 }],
    ["/portfolio/new", { href: "/portfolio", level: 2 }],
    ["/portfolio/new/buy", { href: "/portfolio/new", level: 3 }],
    ["/portfolio/new/fx-conversion", { href: "/portfolio/new", level: 3 }],
    ["/portfolio/dividends", { href: "/portfolio", level: 2 }],
    ["/import/pending", { href: "/import", level: 3 }],
    ["/budgets?period=2026-10", { href: "/more", level: 2 }],
    ["/budgets/", { href: "/more", level: 2 }],
  ])("%s", (path, expected) => {
    expect(resolveBackTarget(path)).toEqual(expected);
  });

  it("a longer registry path beats a shorter one (portfolio/new vs portfolio)", () => {
    expect(resolveBackTarget("/portfolio/new/sell")?.href).toBe("/portfolio/new");
    expect(resolveBackTarget("/portfolio/realized-gains")?.href).toBe("/portfolio");
  });
});

describe("unknown routes", () => {
  it.each(["/nope", "/accountsfoo", "/connect-nothing", "", "/"])("%j -> null", (p) => {
    expect(resolveBackTarget(p)).toBeNull();
  });

  it("null and undefined pathnames -> null", () => {
    expect(resolveBackTarget(null)).toBeNull();
    expect(resolveBackTarget(undefined)).toBeNull();
  });
});

describe("useBackTarget hook", () => {
  function Probe() {
    const t = useBackTarget();
    return <div data-testid="probe">{t ? `${t.href ?? "none"}|${t.level}` : "null"}</div>;
  }

  it("reads the current pathname", () => {
    mockPath = "/transactions/5/edit";
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("/transactions|2");
  });

  it("is exported from adaptive/index.ts", () => {
    expect(fromIndex).toBe(useBackTarget);
    expect(resolveFromIndex).toBe(resolveBackTarget);
  });

  it("returns null when the pathname is unavailable", () => {
    mockPath = null;
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("null");
  });
});

describe("PageHeader automatic back fallback", () => {
  it("shows a back button to the registry parent on a level 2+ page with no backHref", () => {
    mockPath = "/transactions/5/edit";
    render(<PageHeader title="Edit transaction" />);
    const back = document.querySelector('[data-slot="back-button"]') as HTMLElement;
    expect(back).not.toBeNull();
    expect(back.getAttribute("href")).toBe("/transactions");
  });

  it("shows no back button on a level 1 tab", () => {
    mockPath = "/accounts";
    render(<PageHeader title="Accounts" />);
    expect(document.querySelector('[data-slot="back-button"]')).toBeNull();
  });

  it("an explicit backHref still wins over the registry", () => {
    mockPath = "/settings/rules/new";
    render(<PageHeader title="New rule" backHref="/settings/rules" />);
    const back = document.querySelector('[data-slot="back-button"]') as HTMLElement;
    expect(back.getAttribute("href")).toBe("/settings/rules");
  });

  it("an unknown route with no backHref shows no back button", () => {
    mockPath = "/nope";
    render(<PageHeader title="Nope" />);
    expect(document.querySelector('[data-slot="back-button"]')).toBeNull();
    expect(within(document.body).queryByLabelText("Back")).toBeNull();
  });
});
