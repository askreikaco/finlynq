// @vitest-environment node
import { describe, it, expect } from "vitest";
import { groupSelId, groupSlug, isGroupSelId, resolveGroupSelId } from "@/lib/categories/group-key";
import { parseSel } from "@/lib/list-detail/selection";

const cats = [
  { type: "E", group: "Food & Drink" },
  { type: "E", group: "Housing" },
  { type: "I", group: "Housing" },
  { type: "E", group: "" },
];

describe("category group ids", () => {
  it("slugifies names to a short token", () => {
    expect(groupSlug("Food & Drink")).toBe("food_drink");
    expect(groupSlug("  ??  ")).toBe("group");
    expect(groupSlug("x".repeat(200)).length).toBeLessThanOrEqual(48);
  });

  it("builds g-<type>-<slug> ids that the split view accepts as a selection", () => {
    const id = groupSelId("E", "Food & Drink");
    expect(id).toBe("g-E-food_drink");
    expect(isGroupSelId(id)).toBe(true);
    expect(parseSel(id)).toEqual({ kind: "item", id });
    expect(isGroupSelId("12")).toBe(false);
    expect(isGroupSelId(null)).toBe(false);
  });

  it("resolves an id back to the real name and type, per type", () => {
    expect(resolveGroupSelId("g-E-food_drink", cats)).toEqual({ type: "E", name: "Food & Drink" });
    expect(resolveGroupSelId("g-I-housing", cats)).toEqual({ type: "I", name: "Housing" });
    expect(resolveGroupSelId("g-I-food_drink", cats)).toBeNull();
    expect(resolveGroupSelId("42", cats)).toBeNull();
  });
});
