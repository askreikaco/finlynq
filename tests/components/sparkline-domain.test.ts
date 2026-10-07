import { describe, it, expect } from "vitest";
import { sparkDomain } from "@/components/sparkline";

describe("sparkDomain: padded domain for sparkline charts", () => {
  it("adds padding to regular data ranges", () => {
    const data = [100, 101, 102];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(102);
    // Pad should be 10% of range (102 - 100 = 2, pad = 0.2)
    expect(max - min).toBeCloseTo(2.4, 1);
  });

  it("handles flat data (all same values) non-degenerately", () => {
    const data = [5, 5, 5];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(5);
    expect(max).toBeGreaterThan(5);
    // Pad should be 5% of |5| = 0.25
    expect(max).toBe(5.25);
    expect(min).toBe(4.75);
  });

  it("handles negative values", () => {
    const data = [-100, -50, 0];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(-100);
    expect(max).toBeGreaterThan(0);
    // Range is 100, pad is 10
    expect(min).toBeCloseTo(-110, 0);
    expect(max).toBeCloseTo(10, 0);
  });

  it("handles single point", () => {
    const data = [42];
    const [min, max] = sparkDomain(data);
    // For a single value, it's flat data: pad = 5% of |42| = 2.1
    expect(min).toBeLessThan(42);
    expect(max).toBeGreaterThan(42);
    expect(max).toBeCloseTo(42 * 1.05, 1);
    expect(min).toBeCloseTo(42 * 0.95, 1);
  });

  it("handles empty data gracefully", () => {
    const [min, max] = sparkDomain([]);
    expect([min, max]).toEqual([0, 1]);
  });

  it("returns [0, 1] for null/undefined data", () => {
    const [min, max] = sparkDomain(null as any);
    expect([min, max]).toEqual([0, 1]);
  });

  it("ignores NaN values", () => {
    const data = [100, NaN, 120];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(120);
  });

  it("ignores Infinity values", () => {
    const data = [100, Infinity, 120];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(120);
  });

  it("ignores negative Infinity values", () => {
    const data = [100, -Infinity, 120];
    const [min, max] = sparkDomain(data);
    expect(min).toBeLessThan(100);
    expect(max).toBeGreaterThan(120);
  });

  it("returns [0, 1] when all values are non-finite", () => {
    const data = [NaN, Infinity, -Infinity];
    const [min, max] = sparkDomain(data);
    expect([min, max]).toEqual([0, 1]);
  });

  it("returns [0, 1] when array contains only null/undefined (as any)", () => {
    const data = [null as any, undefined as any];
    const [min, max] = sparkDomain(data);
    expect([min, max]).toEqual([0, 1]);
  });
});
