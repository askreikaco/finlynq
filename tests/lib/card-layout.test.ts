import { describe, it, expect } from "vitest";
import { cardLayoutKey, defaultCardLayout, normalizeCardLayout, PAGE_ID_RE, type PageCard } from "@/lib/card-layout";

const CARDS: PageCard[] = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C", defaultVisible: false },
];

describe("card-layout", () => {
  it("default layout: card array order, defaultVisible:false starts hidden", () => {
    expect(defaultCardLayout(CARDS)).toEqual({ order: ["a", "b", "c"], hidden: ["c"] });
  });

  it("garbage -> default layout", () => {
    for (const bad of [null, undefined, 3, "x", [], { order: "no", hidden: 4 }]) {
      expect(normalizeCardLayout(bad, CARDS)).toEqual({ order: ["a", "b", "c"], hidden: ["c"] });
    }
  });

  it("drops unknown ids and duplicates, keeps the saved order and hidden set", () => {
    const out = normalizeCardLayout({ order: ["b", "zzz", "a", "b"], hidden: ["a", "zzz", "a"] }, CARDS);
    // "c" was not saved: it goes right after its default predecessor "b"
    expect(out.order).toEqual(["b", "c", "a"]);
    // "a" stays hidden as saved; "c" (default hidden, never saved) is hidden too
    expect(out.hidden).toEqual(["a", "c"]);
  });

  it("a card missing from the saved order is inserted after its default predecessor; a default-hidden one is hidden", () => {
    const out = normalizeCardLayout({ order: ["b", "a"], hidden: [] }, CARDS);
    expect(out.order).toEqual(["b", "c", "a"]);
    expect(out.hidden).toEqual(["c"]);
    // a card the user already saved as shown stays shown
    expect(normalizeCardLayout({ order: ["a", "b", "c"], hidden: [] }, CARDS).hidden).toEqual([]);
  });

  it("settings key is per page; page ids are short slugs only", () => {
    expect(cardLayoutKey("accounts")).toBe("card_layout_v1:accounts");
    expect(PAGE_ID_RE.test("reports")).toBe(true);
    expect(PAGE_ID_RE.test("Bad Id")).toBe(false);
    expect(PAGE_ID_RE.test("../x")).toBe(false);
    expect(PAGE_ID_RE.test("")).toBe(false);
  });
});
