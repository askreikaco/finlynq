// The type system enforces the top bar anatomy. Each @ts-expect-error line must be a compile error:
// `npm run typecheck` fails if one of them stops erroring (unused directive), so these are real guards.
import { describe, it, expect } from "vitest";
import type { PageHeaderProps, TopBarPrimary, TopBarBack, MoreItem } from "@/components/mobile/page-header";

const noop = () => {};

describe("top bar types", () => {
  it("accepts every valid slot combination", () => {
    const ok: PageHeaderProps[] = [
      { title: "Root" },
      { title: "Detail", back: { href: "/x" }, primary: { kind: "edit", label: "Edit", onSelect: noop } },
      { title: "List", info: "Help", filter: { href: "/f" }, more: [{ label: "Export", onSelect: noop }], primary: { kind: "add", label: "Add", href: "/new" } },
      { title: "Bulk", bulkEdit: { onToggle: noop }, filter: { href: "/f" } },
      { title: "Form", back: { onBack: noop, label: "Back" }, primary: { kind: "save", label: "Save", form: "f" } },
      { title: "Root forced", back: false },
    ];
    expect(ok).toHaveLength(6);
  });

  it("title is required and a string", () => {
    // @ts-expect-error title is required
    const a: PageHeaderProps = {};
    // @ts-expect-error title is a string, not a node
    const b: PageHeaderProps = { title: 42 };
    expect([a, b]).toHaveLength(2);
  });

  it("there are no ad-hoc slots: actions, children, overflow, subtitle, lead, belowTitle, className are not props", () => {
    // @ts-expect-error no actions node
    const a: PageHeaderProps = { title: "T", actions: null };
    // @ts-expect-error no children
    const b: PageHeaderProps = { title: "T", children: null };
    // @ts-expect-error renamed to `more`
    const c: PageHeaderProps = { title: "T", overflow: [] };
    // @ts-expect-error no subtitle line (use `info`)
    const d: PageHeaderProps = { title: "T", subtitle: "x" };
    // @ts-expect-error no lead
    const e: PageHeaderProps = { title: "T", lead: null };
    // @ts-expect-error no belowTitle
    const f: PageHeaderProps = { title: "T", belowTitle: null };
    // @ts-expect-error the bar lays itself out
    const g: PageHeaderProps = { title: "T", className: "x" };
    // @ts-expect-error back is an object, not backHref
    const h: PageHeaderProps = { title: "T", backHref: "/x" };
    expect([a, b, c, d, e, f, g, h]).toHaveLength(8);
  });

  it("primary is ONE action, not a list, with a kind and a label", () => {
    // @ts-expect-error a list of actions is not a primary
    const a: TopBarPrimary = [{ kind: "add", label: "A", onSelect: noop }];
    // @ts-expect-error kind is add | edit | save
    const b: TopBarPrimary = { kind: "delete", label: "D", onSelect: noop };
    // @ts-expect-error label is required
    const c: TopBarPrimary = { kind: "add", onSelect: noop };
    // @ts-expect-error an add without href or onSelect does nothing
    const d: TopBarPrimary = { kind: "add", label: "A" };
    // @ts-expect-error a save needs onSelect or a form id
    const e: TopBarPrimary = { kind: "save", label: "S" };
    // @ts-expect-error an element is not a primary
    const f: TopBarPrimary = { type: "button" };
    expect([a, b, c, d, e, f]).toHaveLength(6);
    const ok: TopBarPrimary[] = [
      { kind: "add", label: "A", href: "/new" },
      { kind: "add", label: "A", href: "/new", onSelect: noop },
      { kind: "edit", label: "E", onSelect: noop },
      { kind: "save", label: "S", onSelect: noop, busy: true },
      { kind: "save", label: "S", form: "f" },
    ];
    expect(ok).toHaveLength(5);
  });

  it("the secondary group has exactly the slots more / filter / bulkEdit", () => {
    // @ts-expect-error a second filter-like slot does not exist
    const a: PageHeaderProps = { title: "T", sort: { href: "/s" } };
    // @ts-expect-error more is a list of menu items, not nodes
    const b: PageHeaderProps = { title: "T", more: [<div key="x" />] };
    // @ts-expect-error filter needs an href
    const c: PageHeaderProps = { title: "T", filter: { activeCount: 1 } };
    // @ts-expect-error bulkEdit needs onToggle
    const d: PageHeaderProps = { title: "T", bulkEdit: { active: true } };
    expect([a, b, c, d]).toHaveLength(4);
    const items: MoreItem[] = [{ label: "x", href: "/y" }];
    expect(items).toHaveLength(1);
  });

  it("back is a link target, a handler, or false", () => {
    // @ts-expect-error back needs href or onBack
    const a: TopBarBack = { label: "Back" };
    // @ts-expect-error onBack is a function
    const b: TopBarBack = { onBack: "x" };
    expect([a, b]).toHaveLength(2);
  });
});
