/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { AccountRow, HoldingRow, MetricGrid, NetWorthHero } from "@/components/mobile";
import { formatCurrency } from "@/lib/currency";

afterEach(cleanup);
const cls = (el: Element) => el.className.toString().split(/\s+/);

describe("AccountRow", () => {
  const base = { accountId: 7, accountName: "Techcombank", currency: "VND", displayCurrency: "VND", type: "asset" as const };

  it("is one link to /accounts/[id] with a chevron, name, subtitle and balance via formatCurrency (VND: no decimals)", () => {
    render(<AccountRow {...base} balance={45306000} alias="TCB" />);
    const row = screen.getByRole("link");
    expect(row.getAttribute("href")).toBe("/accounts/7");
    expect(row.querySelector("[data-slot=list-row-chevron]")).not.toBeNull();
    expect(screen.getByText("Techcombank")).toBeTruthy();
    expect(screen.getByText("TCB · VND")).toBeTruthy();
    const amt = screen.getByText(formatCurrency(45306000, "VND"));
    expect(amt.textContent).not.toMatch(/\.\d/);
    expect(cls(amt)).toContain("text-pos");
  });

  it("shows the display-currency equivalent only when currencies differ", () => {
    const { rerender } = render(<AccountRow {...base} currency="USD" balance={100} convertedBalance={2500000} />);
    expect(screen.getByText(formatCurrency(2500000, "VND"))).toBeTruthy();
    rerender(<AccountRow {...base} currency="VND" balance={100} convertedBalance={100} />);
    expect(document.querySelector("[data-slot=list-row-secondary]")).toBeNull();
  });

  it("liability reads red, archived is dimmed and labelled; icon tile never shrinks", () => {
    render(<AccountRow {...base} type="liability" balance={-5000000} archived />);
    expect(cls(screen.getByText(formatCurrency(-5000000, "VND")))).toContain("text-neg");
    expect(screen.getByText(/Archived/)).toBeTruthy();
    expect(cls(screen.getByRole("link"))).toContain("opacity-60");
    expect(cls(document.querySelector("[data-slot=list-row-tile]")!)).toContain("shrink-0");
  });
});

describe("HoldingRow", () => {
  it("shows ONLY name | market value + unrealized % (text-pos) and fires onPress", () => {
    const onPress = vi.fn();
    render(<HoldingRow name="AAPL" marketValue={50000000} unrealizedPct={5.5} currency="VND" onPress={onPress} />);
    const row = screen.getByRole("button", { name: "AAPL" });
    expect(row.textContent).toContain("AAPL");
    expect(screen.getByText(formatCurrency(50000000, "VND"))).toBeTruthy();
    const pct = screen.getByText("+5.50%");
    expect(cls(pct)).toContain("text-pos");
    // nothing else on the row: no subtitle, no qty/price columns
    expect(row.querySelector("span.text-xs.text-muted-foreground.block")).toBeNull();
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("negative % is text-neg with a real minus; null % (cash) renders no % line", () => {
    const { rerender } = render(<HoldingRow name="VNM" marketValue={1} unrealizedPct={-3.2} currency="USD" onPress={() => {}} />);
    const pct = screen.getByText(/3\.20%/);
    expect(pct.textContent).toMatch(/^-/);
    expect(cls(pct)).toContain("text-neg");
    rerender(<HoldingRow name="Cash" marketValue={1} unrealizedPct={null} currency="USD" onPress={() => {}} />);
    expect(document.querySelector("[data-slot=list-row-secondary]")).toBeNull();
  });
});

describe("NetWorthHero + MetricGrid", () => {
  it("net worth = assets + liabilities; tiles use pos/neg tokens, no raw colors", () => {
    render(<NetWorthHero totalAssets={100} totalLiabilities={-40} currency="USD" />);
    expect(screen.getByText("$60.00")).toBeTruthy();
    expect(cls(screen.getByText("$100.00"))).toContain("text-pos");
    expect(cls(screen.getByText("-$40.00"))).toContain("text-neg");
    expect(document.querySelector("[data-slot=net-worth-hero]")!.innerHTML).not.toMatch(/emerald|rose-/);
  });

  it("MetricGrid is 2-col; counts plain, money via Amount", () => {
    render(<MetricGrid metrics={[{ label: "Holdings", value: 4 }, { label: "Cost", value: 1234.5, currency: "USD" }]} />);
    expect(cls(document.querySelector("[data-slot=metric-grid]")!)).toContain("grid-cols-2");
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("$1,234.50")).toBeTruthy();
  });
});
