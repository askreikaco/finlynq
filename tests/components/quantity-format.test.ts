import { describe, it, expect, afterEach } from "vitest";
import { setActiveDisplayLocale } from "@/lib/locale";
import { formatLocaleQty } from "./_qty";

afterEach(() => setActiveDisplayLocale("en-CA"));

describe("quantity formatting", () => {
  it("en unchanged, vi comma", () => {
    expect(formatLocaleQty(1234.5)).toBe((1234.5).toLocaleString("en-US", { maximumFractionDigits: 4 }));
    expect(formatLocaleQty(1234567)).toBe("1,234,567");
    setActiveDisplayLocale("vi-VN");
    expect(formatLocaleQty(1234.5)).toBe("1.234,5");
  });
});
