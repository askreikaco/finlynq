import { describe, it, expect } from "vitest";
import { nextDate, prevDate, addDays } from "@/lib/utils/date";

describe("nextDate", () => {
  describe("monthly recurrence", () => {
    it("should compute next month for mid-month dates", () => {
      expect(nextDate("2026-11-05", "monthly")).toBe("2026-12-05");
    });

    it("should handle month-end dates by overflowing to next month (Jan 31 + 1 month)", () => {
      // JavaScript's setMonth overflows: Jan 31 + 1 month = Mar 3 (Feb 28 + 3 days)
      // This is the existing behavior; the code doesn't normalize to last-day-of-month
      expect(nextDate("2026-01-31", "monthly")).toBe("2026-03-03");
    });

    it("should handle leap year month-end overflow (Jan 31 + 1 month in leap year)", () => {
      // 2024 is a leap year, but Jan 31 + 1 = Feb 29, then overflow continues
      // Jan 31 -> setMonth(1) -> Feb 31 -> Mar 2 (Feb 29 + 2 days)
      expect(nextDate("2024-01-31", "monthly")).toBe("2024-03-02");
    });

    it("should handle year boundary correctly", () => {
      expect(nextDate("2026-12-05", "monthly")).toBe("2027-01-05");
    });

    it("should handle month-end overflow (Mar 31 + 1 month)", () => {
      // Mar 31 + 1 month = Apr 31 -> May 1 (Apr 30 + 1 day)
      expect(nextDate("2026-03-31", "monthly")).toBe("2026-05-01");
    });
  });

  describe("weekly recurrence", () => {
    it("should add 7 days", () => {
      expect(nextDate("2026-11-05", "weekly")).toBe("2026-11-12");
    });

    it("should handle year boundary correctly", () => {
      expect(nextDate("2026-12-28", "weekly")).toBe("2027-01-04");
    });
  });

  describe("biweekly recurrence", () => {
    it("should add 14 days", () => {
      expect(nextDate("2026-11-05", "biweekly")).toBe("2026-11-19");
    });
  });

  describe("quarterly recurrence", () => {
    it("should add 3 months", () => {
      expect(nextDate("2026-11-05", "quarterly")).toBe("2027-02-05");
    });

    it("should handle year boundary", () => {
      expect(nextDate("2026-10-05", "quarterly")).toBe("2027-01-05");
    });
  });

  describe("annual/yearly recurrence", () => {
    it("should add 1 year", () => {
      expect(nextDate("2026-11-05", "annual")).toBe("2027-11-05");
    });

    it("should handle yearly alias", () => {
      expect(nextDate("2026-11-05", "yearly")).toBe("2027-11-05");
    });

    it("should handle leap day correctly", () => {
      // Feb 29, 2024 + 1 year = 2025, but 2025 is not a leap year
      // So setFullYear(2025) on Feb 29 -> Feb 29, 2025 doesn't exist -> Mar 1
      expect(nextDate("2024-02-29", "annual")).toBe("2025-03-01");
    });
  });

  describe("UTC timezone handling", () => {
    it("should use UTC regardless of local timezone", () => {
      // These tests should pass with or without TZ env var
      // because the implementation uses UTC explicitly
      const result = nextDate("2026-11-05", "monthly");
      expect(result).toBe("2026-12-05");
    });

    it("should handle dates at midnight UTC correctly", () => {
      expect(nextDate("2026-11-05", "weekly")).toBe("2026-11-12");
    });
  });
});

describe("prevDate", () => {
  it("should subtract days for weekly", () => {
    expect(prevDate("2026-11-12", "weekly")).toBe("2026-11-05");
  });

  it("should subtract months for monthly", () => {
    expect(prevDate("2026-12-05", "monthly")).toBe("2026-11-05");
  });

  it("should handle year boundary correctly", () => {
    expect(prevDate("2027-01-05", "monthly")).toBe("2026-12-05");
  });

  it("should handle month-end dates", () => {
    // Feb 28 - 1 month = Jan 28
    expect(prevDate("2026-02-28", "monthly")).toBe("2026-01-28");
  });
});

describe("addDays", () => {
  it("should add positive days", () => {
    expect(addDays("2026-11-05", 7)).toBe("2026-11-12");
  });

  it("should subtract days with negative count", () => {
    expect(addDays("2026-11-12", -7)).toBe("2026-11-05");
  });

  it("should handle year boundary correctly", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("should handle year boundary backward", () => {
    expect(addDays("2027-01-04", -7)).toBe("2026-12-28");
  });
});
