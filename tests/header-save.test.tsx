// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/transactions/new",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { PageHeader, HEADER_SAVE, HEADER_CELL } from "@/components/mobile";
import { splitHeaderSave } from "@/components/mobile/page-header";

afterEach(cleanup);

describe("PageHeader HEADER_SAVE", () => {
  it("renders the Save outside the capsule, after it, and keeps it out of the capsule cells", () => {
    render(
      <PageHeader
        title="New Expense"
        onBack={() => {}}
        overflow={[{ label: "Delete", onSelect: () => {} }]}
        actions={
          <button type="button" aria-label="Save" className={HEADER_SAVE} data-testid="hdr-save">
            Save
          </button>
        }
      />,
    );
    const save = screen.getByTestId("hdr-save");
    const capsule = document.querySelector('[data-slot="header-capsule"]');
    expect(capsule).not.toBeNull();
    expect(capsule!.contains(save)).toBe(false);
    const actions = document.querySelector('[data-slot="page-header-actions"]')!;
    expect(actions.lastElementChild).toBe(save);
    expect(actions.className).toContain("max-regular:gap-2");
  });

  it("is the only action: no empty capsule, still renders", () => {
    render(
      <PageHeader title="Edit" onBack={() => {}} actions={<button type="button" className={HEADER_SAVE} data-testid="s">Save</button>} />,
    );
    expect(screen.getByTestId("s")).toBeTruthy();
    expect(document.querySelector('[data-slot="header-capsule"]')).toBeNull();
  });

  it("splitHeaderSave takes only the first marked action and leaves the others in order", () => {
    const a = <button key="a" className={HEADER_CELL}>a</button>;
    const s = <button key="s" className={HEADER_SAVE}>s</button>;
    const r = splitHeaderSave([a, s]);
    expect(React.isValidElement(r.save) && (r.save.props as { children?: string }).children).toBe("s");
    expect(r.rest).toHaveLength(1);
    expect((r.rest[0] as React.ReactElement<{ children?: string }>).props.children).toBe("a");
  });

  it("CSS: below regular the save is a 44px round primary-coloured circle with a 20px glyph and no label", () => {
    const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
    const i = css.indexOf('[data-slot="page-header-actions"] > .header-save {');
    expect(i).toBeGreaterThan(css.indexOf("@media (width < 40rem) {"));
    const body = css.slice(i, css.indexOf("}", i));
    for (const d of ["width: 2.75rem", "height: 2.75rem", "border-radius: 9999px", "background: var(--primary)", "font-size: 0"]) {
      expect(body).toContain(d);
    }
  });
});
