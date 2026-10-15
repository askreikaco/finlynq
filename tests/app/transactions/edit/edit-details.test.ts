/**
 * @vitest-environment node
 * Read-only Details on the edit page (the facts the list's row sheet used to show): Kind, Investment, Quantity, Splits.
 */
import { describe, it, expect } from "vitest";
import { editDetailItems } from "@/components/transactions/entry/edit-details";

const labels = (items: ReturnType<typeof editDetailItems>) => items.map((i) => i.label);
const row = (o: object = {}) => ({ portfolioHolding: null, quantity: null, kind: null, ...o });

describe("editDetailItems", () => {
  it("a plain row has nothing to add (Source, Created and Updated are the meta line)", () => {
    expect(editDetailItems(row(), 0)).toEqual([]);
    expect(editDetailItems(row(), null)).toEqual([]);
    expect(editDetailItems(row(), undefined)).toEqual([]);
  });

  it("an investment row adds Investment and Quantity; a zero or missing quantity is left out", () => {
    expect(labels(editDetailItems(row({ portfolioHolding: "VTI", quantity: 3 }), 0))).toEqual(["Investment", "Quantity"]);
    expect(labels(editDetailItems(row({ portfolioHolding: "VTI", quantity: 0 }), 0))).toEqual(["Investment"]);
  });

  it("a kind adds Kind first", () => {
    expect(labels(editDetailItems(row({ kind: "dividend", portfolioHolding: "VTI" }), 0))).toEqual(["Kind", "Investment"]);
  });

  it("stored splits add a singular or plural Splits count", () => {
    expect(editDetailItems(row(), 1)[0]).toEqual({ label: "Splits", value: "1 split" });
    expect(editDetailItems(row(), 3)[0]).toEqual({ label: "Splits", value: "3 splits" });
  });
});
