import { describe, it, expect } from "vitest";
import { canonicalJson } from "@/lib/local-first/oplog/canon";

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}',
    );
  });

  it("is independent of insertion order", () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it("serializes primitives, arrays and null", () => {
    expect(canonicalJson([null, true, false, "a\"b", 0, -1.5])).toBe('[null,true,false,"a\\"b",0,-1.5]');
  });

  it("rejects NaN, Infinity and -Infinity", () => {
    expect(() => canonicalJson(NaN)).toThrow(TypeError);
    expect(() => canonicalJson({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalJson([-Infinity])).toThrow(TypeError);
  });

  it("rejects undefined at top level, in objects and in arrays", () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJson([1, undefined])).toThrow(TypeError);
  });

  it("rejects functions, bigint, sparse arrays, cycles and class instances", () => {
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalJson(BigInt(1))).toThrow(TypeError);
    expect(() => canonicalJson([1, , 3])).toThrow(TypeError);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => canonicalJson(cyc)).toThrow(TypeError);
    class Foo {
      x = 1;
    }
    expect(() => canonicalJson(new Foo())).toThrow(TypeError);
  });
});
