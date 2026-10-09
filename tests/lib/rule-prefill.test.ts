/**
 * Query-param prefill for /settings/rules/new (PKG5). Pure function, no DOM.
 */
import { describe, it, expect } from "vitest";
import { rulePrefillFromParams } from "@/lib/rules/rule-prefill";

const q = (s: string) => new URLSearchParams(s);

describe("rulePrefillFromParams", () => {
  it("no params: empty name, no conditions, no actions (editor defaults apply)", () => {
    const p = rulePrefillFromParams(q(""));
    expect(p).toEqual({ name: "", conditions: undefined, actions: undefined, stagedImportId: undefined });
  });

  it("payee seeds a contains-payee condition and the default 'Match \"…\"' name", () => {
    const p = rulePrefillFromParams(q("payee=%20Starbucks%20"));
    expect(p.name).toBe('Match "Starbucks"');
    expect(p.conditions).toEqual([{ field: "payee", op: "contains", value: "Starbucks" }]);
  });

  it("an explicit name overrides the default name", () => {
    const p = rulePrefillFromParams(q("payee=Starbucks&name=Coffee%20runs"));
    expect(p.name).toBe("Coffee runs");
  });

  it("categoryId seeds one set_category action; invalid ids are dropped", () => {
    expect(rulePrefillFromParams(q("categoryId=7")).actions).toEqual([{ kind: "set_category", categoryId: 7 }]);
    expect(rulePrefillFromParams(q("categoryId=0")).actions).toBeUndefined();
    expect(rulePrefillFromParams(q("categoryId=-3")).actions).toBeUndefined();
    expect(rulePrefillFromParams(q("categoryId=7abc")).actions).toBeUndefined();
  });

  it("stagedImportId with no category gives an empty action list (banner flow adds its own)", () => {
    const p = rulePrefillFromParams(q("payee=X&stagedImportId=batch_01-A"));
    expect(p.stagedImportId).toBe("batch_01-A");
    expect(p.actions).toEqual([]);
  });

  it("rejects a malformed stagedImportId (path or script characters)", () => {
    expect(rulePrefillFromParams(q("stagedImportId=../../etc")).stagedImportId).toBeUndefined();
    expect(rulePrefillFromParams(q("stagedImportId=%3Cscript%3E")).stagedImportId).toBeUndefined();
  });

  it("caps long payee and name values", () => {
    const long = "a".repeat(300);
    const p = rulePrefillFromParams(q(`payee=${long}&name=${long}`));
    expect(p.conditions?.[0]).toMatchObject({ value: "a".repeat(200) });
    expect(p.name.length).toBeLessThanOrEqual(120);
  });
});
