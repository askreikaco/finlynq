/**
 * @vitest-environment jsdom
 */
// The one top bar (PageHeader): fixed anatomy [BACK] [TITLE + (i)] ... [MORE + FILTER|BULK EDIT] [PRIMARY].
// Anatomy and ordering, back visibility, tooltip, the primary action kinds, the max-2 secondary group,
// and the same bar at a phone and a wide viewport.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

let mockPath: string | null = "/accounts";
let mockSearch = "";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader, type PageHeaderProps } from "@/components/mobile/page-header";
import { usePageCustomize } from "@/components/mobile/page-customize";

afterEach(() => {
  cleanup();
  mockPath = "/accounts";
  mockSearch = "";
});

const cls = (el: Element | null | undefined) => (el ? el.getAttribute("class") ?? "" : "").split(/\s+/);
const bar = (c: HTMLElement) => c.querySelector('[data-slot="page-header"]') as HTMLElement;
const back = (c: HTMLElement) => c.querySelector('[data-slot="back-button"]') as HTMLElement | null;
const capsule = (c: HTMLElement) => c.querySelector('[data-slot="header-capsule"]') as HTMLElement | null;
const primary = (c: HTMLElement) => c.querySelector('[data-slot="topbar-primary"]') as HTMLElement | null;
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const noop = () => {};

describe("anatomy and ordering", () => {
  it("renders back, title + tooltip, secondary group, primary in that DOM order", () => {
    mockPath = "/accounts/5";
    const { container } = render(
      <PageHeader
        title="Checking"
        info="Your checking account"
        more={[{ label: "Export", onSelect: noop }]}
        filter={{ href: "/filter/x" }}
        primary={{ kind: "edit", label: "Edit account", onSelect: noop }}
      />,
    );
    const parts = [
      back(container)!,
      screen.getByRole("heading", { level: 1, name: "Checking" }),
      screen.getByRole("button", { name: "About Checking" }),
      screen.getByRole("button", { name: "More actions" }),
      screen.getByRole("link", { name: "Filter" }),
      screen.getByRole("button", { name: "Edit account" }),
    ];
    for (let i = 0; i < parts.length - 1; i++) expect(before(parts[i], parts[i + 1]), `part ${i} precedes ${i + 1}`).toBe(true);
  });

  it("the bar is a three-column grid: [back | title (1fr) | actions], the title is the middle column", () => {
    const { container } = render(<PageHeader title="Goals" primary={{ kind: "add", label: "Add goal", onSelect: noop }} />);
    expect(cls(bar(container))).toEqual(expect.arrayContaining(["grid", "grid-cols-[auto_minmax(0,1fr)_auto]", "glass-bar", "sticky", "page-header-bleed"]));
    expect(cls(container.querySelector('[data-slot="page-header-title-block"]'))).toEqual(expect.arrayContaining(["col-start-2", "min-w-0"]));
    expect(cls(container.querySelector('[data-slot="page-header-actions"]'))).toEqual(expect.arrayContaining(["col-start-3", "justify-self-end"]));
  });

  it("the primary is the rightmost control, outside the capsule, after it", () => {
    const { container } = render(
      <PageHeader title="Goals" more={[{ label: "Export", onSelect: noop }]} primary={{ kind: "add", label: "Add goal", onSelect: noop }} />,
    );
    const group = container.querySelector('[data-slot="page-header-actions"]') as HTMLElement;
    expect(group.lastElementChild).toBe(primary(container));
    expect(group.firstElementChild).toBe(capsule(container));
    expect(primary(container)!.closest('[data-slot="header-capsule"]')).toBeNull();
  });

  it("only the title: no capsule, no primary, no actions group", () => {
    const { container } = render(<PageHeader title="Solo" />);
    expect(capsule(container)).toBeNull();
    expect(primary(container)).toBeNull();
    expect(container.querySelector('[data-slot="page-header-actions"]')).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("the title is the one system style: one line, truncates", () => {
    render(<PageHeader title="A very long title" />);
    expect(cls(screen.getByRole("heading", { level: 1 }))).toEqual(expect.arrayContaining(["text-base", "font-semibold", "truncate"]));
  });

  it("no top border or inset top shadow class on the bar (bottom rim only)", () => {
    const { container } = render(<PageHeader title="X" />);
    const c = cls(bar(container));
    expect(c.filter((t) => /^(border-t|inset-shadow|shadow)/.test(t))).toEqual([]);
  });
});

describe("back visibility", () => {
  it("hidden on a root destination", () => {
    mockPath = "/accounts";
    expect(back(render(<PageHeader title="Accounts" />).container)).toBeNull();
  });

  it("automatic on a non-root page: a link to the parent route", () => {
    mockPath = "/transactions/5/edit";
    const b = back(render(<PageHeader title="Edit" />).container)!;
    expect(b.getAttribute("href")).toBe("/transactions");
    expect(cls(b)).toEqual(expect.arrayContaining(["size-11", "rounded-full"]));
    expect(b.getAttribute("aria-label")).toBe("Back");
  });

  it("a valid ?returnTo= replaces the parent", () => {
    mockPath = "/accounts";
    mockSearch = "returnTo=%2Ftransactions";
    expect(back(render(<PageHeader title="Accounts" />).container)!.getAttribute("href")).toBe("/transactions");
  });

  it("an explicit target wins, with its label", () => {
    mockPath = "/settings/rules/new";
    const b = back(render(<PageHeader title="New rule" back={{ href: "/settings/rules", label: "Back to Rules" }} />).container)!;
    expect(b.getAttribute("href")).toBe("/settings/rules");
    expect(b.getAttribute("aria-label")).toBe("Back to Rules");
  });

  it("onBack renders a button that runs the handler", () => {
    mockPath = "/accounts";
    const onBack = vi.fn();
    const { container } = render(<PageHeader title="Detail" back={{ onBack, label: "Back to list" }} />);
    const b = back(container)!;
    expect(b.tagName).toBe("BUTTON");
    fireEvent.click(b);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("back={false} forces a root bar on a deep path", () => {
    mockPath = "/transactions/5/edit";
    expect(back(render(<PageHeader title="Edit" back={false} />).container)).toBeNull();
  });

  it("an unknown route has no back by default", () => {
    mockPath = "/nope";
    expect(back(render(<PageHeader title="Nope" />).container)).toBeNull();
  });

  it("a back to the column parent (/more, /settings) carries column-auto-back so the desktop column shell hides it", () => {
    mockPath = "/settings/general";
    expect(cls(back(render(<PageHeader title="General" />).container))).toContain("column-auto-back");
    cleanup();
    mockPath = "/accounts/5";
    expect(cls(back(render(<PageHeader title="Acc" />).container))).not.toContain("column-auto-back");
  });
});

describe("title and tooltip", () => {
  it("info renders only an (i) button named About <title>; the text is not in the DOM until it opens", async () => {
    const { container } = render(<PageHeader title="Goals" info="Track your targets" />);
    const tip = screen.getByRole("button", { name: "About Goals" });
    expect(tip.getAttribute("data-slot")).toBe("info-tip");
    expect(screen.getByRole("heading", { level: 1 }).nextElementSibling).toBe(tip);
    expect(container.textContent).not.toMatch(/Track your targets/);
    fireEvent.click(tip);
    expect(await screen.findByText("Track your targets")).toBeTruthy();
  });

  it("no info, no (i)", () => {
    const { container } = render(<PageHeader title="Goals" />);
    expect(container.querySelector('[data-slot="info-tip"]')).toBeNull();
  });
});

describe("primary action", () => {
  it("add/edit with href is a link; the label is the accessible name and the icon is the only content", () => {
    const { container } = render(<PageHeader title="X" primary={{ kind: "add", label: "Add goal", href: "/goals/new" }} />);
    const p = primary(container)!;
    expect(p.tagName).toBe("A");
    expect(p.getAttribute("href")).toBe("/goals/new");
    expect(p.getAttribute("aria-label")).toBe("Add goal");
    expect(p.getAttribute("data-kind")).toBe("add");
    expect(p.textContent).toBe("");
    expect(p.querySelector("svg")).not.toBeNull();
  });

  it("a link primary with onSelect intercepts the click (split-view pane)", () => {
    const onSelect = vi.fn();
    const { container } = render(<PageHeader title="X" primary={{ kind: "add", label: "Add", href: "/x/new", onSelect }} />);
    const ev = fireEvent.click(primary(container)!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(ev).toBe(false); // default prevented: no navigation
  });

  it("edit is a button with onSelect and a different icon than add", () => {
    const onSelect = vi.fn();
    const a = render(<PageHeader title="X" primary={{ kind: "add", label: "Add", onSelect }} />).container;
    const addIcon = primary(a)!.innerHTML;
    cleanup();
    const e = render(<PageHeader title="X" primary={{ kind: "edit", label: "Edit", onSelect }} />).container;
    const p = primary(e)!;
    expect(p.tagName).toBe("BUTTON");
    expect(p.innerHTML).not.toBe(addIcon);
    fireEvent.click(p);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("save with a form id is a submit button for that form", () => {
    const { container } = render(<PageHeader title="X" primary={{ kind: "save", label: "Save", form: "f1" }} />);
    const p = primary(container)!;
    expect(p.getAttribute("type")).toBe("submit");
    expect(p.getAttribute("form")).toBe("f1");
  });

  it("save busy shows a spinner and is disabled; disabled disables", () => {
    const busy = render(<PageHeader title="X" primary={{ kind: "save", label: "Saving", onSelect: noop, busy: true }} />).container;
    expect(primary(busy)!.hasAttribute("disabled")).toBe(true);
    expect(primary(busy)!.querySelector(".animate-spin")).not.toBeNull();
    cleanup();
    const dis = render(<PageHeader title="X" primary={{ kind: "save", label: "Save", onSelect: noop, disabled: true }} />).container;
    expect(primary(dis)!.hasAttribute("disabled")).toBe(true);
  });

  it("testId reaches the button", () => {
    render(<PageHeader title="X" primary={{ kind: "save", label: "Save", onSelect: noop, testId: "my-save" }} />);
    expect(screen.getByTestId("my-save")).toBeTruthy();
  });
});

describe("secondary group: More + Filter, at most 2 buttons", () => {
  const filter = { href: "/filter/tx", activeCount: 2 };
  const bulkEdit = { onToggle: noop, active: false };
  const more = [{ label: "Export", onSelect: noop }];

  it("More comes first, Filter second", () => {
    const { container } = render(<PageHeader title="T" more={more} filter={filter} />);
    const kids = Array.from(capsule(container)!.children);
    expect(kids.map((k) => k.getAttribute("data-slot"))).toEqual(["overflow-trigger", "filter-button"]);
  });

  it("bulk edit takes the Filter slot; Filter moves to the first More item", async () => {
    const { container } = render(<PageHeader title="T" more={more} filter={filter} bulkEdit={bulkEdit} />);
    const kids = Array.from(capsule(container)!.children);
    expect(kids.map((k) => k.getAttribute("data-slot"))).toEqual(["overflow-trigger", "bulk-edit-trigger"]);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toEqual(["Filter", "Export"]);
  });

  it("the bulk edit toggle reports its pressed state and calls onToggle", () => {
    const onToggle = vi.fn();
    render(<PageHeader title="T" bulkEdit={{ onToggle, active: true, label: "Select rows" }} />);
    const b = screen.getByRole("button", { name: "Select rows" });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("every combination of more / filter / bulkEdit / customize holds at most 2 secondary buttons and never 2 filters", () => {
    function Page(props: Partial<PageHeaderProps> & { customize: boolean }) {
      usePageCustomize(props.customize ? { onOpen: noop } : null);
      const { customize: _c, ...rest } = props;
      return <PageHeader title="T" {...rest} />;
    }
    for (let mask = 0; mask < 16; mask++) {
      const props = {
        more: mask & 1 ? more : undefined,
        filter: mask & 2 ? filter : undefined,
        bulkEdit: mask & 4 ? bulkEdit : undefined,
        customize: !!(mask & 8),
      };
      const { container } = render(<Page {...props} />);
      const cap = capsule(container);
      const n = cap ? cap.children.length : 0;
      expect(n, `mask ${mask}`).toBeLessThanOrEqual(2);
      expect(container.querySelectorAll('[data-slot="filter-button"]').length).toBeLessThanOrEqual(1);
      expect(container.querySelectorAll('[data-slot="overflow-trigger"]').length).toBeLessThanOrEqual(1);
      cleanup();
    }
  });

  it("a lone filter is a one-cell capsule (a circle)", () => {
    const { container } = render(<PageHeader title="T" filter={filter} />);
    expect(capsule(container)!.children).toHaveLength(1);
    expect(cls(capsule(container))).toEqual(expect.arrayContaining(["h-11", "rounded-full", "glass-capsule"]));
  });

  it("Customize cards is a More item (never a bar button) and runs the page handler", async () => {
    const onOpen = vi.fn();
    function Cards() {
      usePageCustomize({ onOpen });
      return <PageHeader title="Accounts" more={more} primary={{ kind: "add", label: "Add", onSelect: noop }} />;
    }
    render(<Cards />);
    expect(screen.queryByRole("button", { name: /customize/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Export", "Customize cards"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Customize cards" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("More runs onSelect items and links href items", async () => {
    const onSelect = vi.fn();
    render(<PageHeader title="T" more={[{ label: "Run", onSelect }, { label: "Go", href: "/somewhere" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const run = await screen.findByRole("menuitem", { name: "Run" });
    fireEvent.click(run);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("same bar on a phone and a wide viewport", () => {
  const sample = (
    <PageHeader
      title="Transactions"
      info="All transactions"
      filter={{ href: "/filter/tx" }}
      bulkEdit={{ onToggle: noop }}
      more={[{ label: "Export", onSelect: noop }]}
      primary={{ kind: "add", label: "Add transaction", href: "/transactions/new" }}
    />
  );

  function htmlAt(width: number): string {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    window.dispatchEvent(new Event("resize"));
    const { container } = render(sample);
    // Generated ids (aria-controls, ids from useId) differ per render; the structure and classes must not.
    const html = container.innerHTML.replace(/\s(id|aria-controls|aria-describedby|aria-labelledby)="[^"]*"/g, "");
    cleanup();
    return html;
  }

  it("renders identical markup at 390 and 1440 (one design at every width, CSS does the rest)", () => {
    expect(htmlAt(390)).toBe(htmlAt(1440));
  });

  it("no layout or display class is gated on a breakpoint: the anatomy cannot change with width", () => {
    const { container } = render(sample);
    const all = [bar(container), ...Array.from(bar(container).querySelectorAll("*"))].flatMap((e) => cls(e));
    expect(all.filter((t) => /^(max-)?(regular|wide|md|lg|sm):(hidden|block|flex|grid|inline|sr-only|order-)/.test(t))).toEqual([]);
    expect(all).not.toContain("hidden");
  });

  it("the actions keep 44px targets at both widths: capsule h-11, primary styled 44px by the globals.css primary rule", () => {
    const { container } = render(sample);
    expect(cls(capsule(container))).toContain("h-11");
    expect(primary(container)).not.toBeNull();
  });
});

describe("source and CSS hygiene", () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), "src/components/mobile/page-header.tsx"), "utf-8");
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");

  it("page-header.tsx has no breakpoint-variant classes (regular:/wide:/sm:/md:/lg:/xl:) and no arbitrary text-[Npx]", () => {
    expect(CODE).not.toMatch(/(?<![\w-])(max-)?(regular|wide|sm|md|lg|xl|2xl):/);
    expect(CODE).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
  });

  it("there is no subtitle slot and no legacy action API in the component", () => {
    expect(CODE).not.toMatch(/page-header-subtitle|subtitle|actions\?:|overflow\?:|belowTitle|HEADER_|desktopClasses/);
  });

  it("CSS: the primary is a 44px round primary-coloured circle with a 20px glyph and no label, at every width", () => {
    const sel = '[data-slot="page-header-actions"] > [data-slot="topbar-primary"] {';
    const i = CSS.indexOf(sel);
    expect(i).toBeGreaterThan(CSS.indexOf("iOS 26-style liquid glass, every width"));
    const body = CSS.slice(i, CSS.indexOf("}", i));
    for (const d of ["width: 2.75rem", "height: 2.75rem", "border-radius: 9999px", "background: var(--primary)", "font-size: 0"]) {
      expect(body).toContain(d);
    }
  });

  it("CSS: every capsule cell is one 44px slot", () => {
    expect(CSS).toMatch(/\[data-slot="header-capsule"\] > :is\(button, a\) \{\s*width: 2\.75rem;\s*min-width: 2\.75rem;\s*height: 2\.75rem;/);
  });

  it("CSS: the bar has no top border or inset top highlight", () => {
    const i = CSS.indexOf(".glass-bar {");
    const body = CSS.slice(i, CSS.indexOf("}", i));
    expect(body).toContain("border-top: 0;");
    expect(body).toMatch(/box-shadow: inset 0 -1px 0/);
  });
});
