/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Wallet } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { Amount, ListRow, SectionCard, SectionLabel, StatTile, PillButton, DetailSheet } from "@/components/mobile";
import { formatCurrency } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";

afterEach(cleanup);
const cls = (el: Element) => el.className.toString().split(/\s+/);

describe("Amount", () => {
  it("formats via formatCurrency: VND has no decimals, USD has two", () => {
    const { rerender } = render(<Amount value={45306000} currency="VND" tone="none" />);
    expect(screen.getByText(formatCurrency(45306000, "VND")).textContent).not.toMatch(/\.\d/);
    rerender(<Amount value={1234.5} currency="USD" tone="none" />);
    expect(screen.getByText("$1,234.50")).toBeTruthy();
  });

  it("is tabular + nowrap and never forces mono itself", () => {
    render(<Amount value={5} currency="USD" />);
    const c = cls(screen.getByText("$5.00"));
    expect(c).toEqual(expect.arrayContaining(["tabular-nums", "whitespace-nowrap"]));
    expect(c).not.toContain("font-mono");
  });

  it("colors by sign with the pos/neg tokens (no raw emerald/rose)", () => {
    const { rerender } = render(<Amount value={10} currency="USD" />);
    expect(cls(screen.getByText("$10.00"))).toContain("text-pos");
    rerender(<Amount value={-10} currency="USD" />);
    expect(cls(screen.getByText("-$10.00"))).toContain("text-neg");
    rerender(<Amount value={0} currency="USD" />);
    expect(cls(screen.getByText("$0.00")).some((t) => /pos|neg|emerald|rose/.test(t))).toBe(false);
  });

  it("showSign prefixes + on positives only", () => {
    render(<Amount value={12} currency="USD" showSign />);
    expect(screen.getByText("+$12.00")).toBeTruthy();
  });

  it("sizes: hero text-3xl/700, lg 20, md text-sm", () => {
    const { rerender } = render(<Amount value={1} currency="USD" size="hero" />);
    expect(cls(screen.getByText("$1.00"))).toEqual(expect.arrayContaining(["text-3xl", "font-bold"]));
    rerender(<Amount value={1} currency="USD" size="lg" />);
    expect(cls(screen.getByText("$1.00"))).toContain("text-xl");
    rerender(<Amount value={1} currency="USD" size="md" />);
    expect(cls(screen.getByText("$1.00"))).toContain("text-sm");
  });

  it.each([[54_300_000, "54.3M"], [2_500_000_000, "2.5B"], [572_345, "572K"], [1500, "1.5K"], [850, "850"], [-1_200_000, "-1.2M"]])(
    "compact %s -> %s (K/M/B) keeping the full value as aria-label",
    (v, text) => {
      render(<Amount value={v} currency="VND" compact />);
      const el = screen.getByText(text);
      expect(formatCompactNumber(v)).toBe(text);
      expect(el.getAttribute("aria-label")).toBe(formatCurrency(v, "VND"));
    },
  );
});

describe("ListRow", () => {
  it("renders title, ONE subtitle, primary value, secondary with tone, chevron, 56px min", () => {
    const { container } = render(
      <ListRow href="/accounts/1" icon={Wallet} title="TCB" subtitle="VND" value={<Amount value={5} currency="VND" />} secondary="+2.5%" secondaryTone="pos" />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/accounts/1");
    expect(cls(link)).toContain("min-h-[56px]");
    // Compact density: 44px (dense:min-h-11 = 2.75rem), never below the 44px touch target.
    expect(cls(link)).toContain("dense:min-h-11");
    expect(cls(link).filter((c) => c.startsWith("dense:min-h-"))).toEqual(["dense:min-h-11"]);
    expect(screen.getByText("TCB")).toBeTruthy();
    expect(screen.getByText("VND")).toBeTruthy();
    const sec = screen.getByText("+2.5%");
    expect(sec.getAttribute("data-tone")).toBe("pos");
    expect(cls(sec)).toContain("text-pos");
    expect(container.querySelector("[data-slot=list-row-chevron]")).toBeTruthy();
    expect(cls(container.querySelector("[data-slot=list-row-tile]")!)).toEqual(expect.arrayContaining(["size-9", "rounded-full"]));
  });

  it.each([["neg", "text-neg"], ["muted", "text-muted-foreground"]] as const)("secondaryTone %s -> %s", (tone, c) => {
    render(<ListRow title="a" value="1" secondary="x" secondaryTone={tone} />);
    expect(cls(screen.getByText("x"))).toContain(c);
  });

  it("initials tile + button row calls onPress", () => {
    const onPress = vi.fn();
    const { container } = render(<ListRow title="Cash" initials="C" onPress={onPress} />);
    expect(container.querySelector("[data-slot=list-row-tile]")?.textContent).toBe("C");
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalled();
  });

  it("static rows are not interactive and show no chevron", () => {
    const { container } = render(<ListRow title="Static" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("[data-slot=list-row-chevron]")).toBeNull();
  });
});

describe("SectionCard / SectionLabel / StatTile", () => {
  it("SectionLabel is text-xs/700 uppercase tracking-normal muted", () => {
    render(<SectionLabel>Cash</SectionLabel>);
    expect(cls(screen.getByRole("heading", { name: "Cash" }))).toEqual(
      expect.arrayContaining(["text-xs", "font-bold", "uppercase", "tracking-normal", "text-muted-foreground"]),
    );
  });

  it("SectionCard: label above a 12px-radius, p-4 card using theme tokens", () => {
    const { container } = render(<SectionCard label="Net worth">body</SectionCard>);
    expect(screen.getByRole("heading", { name: "Net worth" })).toBeTruthy();
    const body = container.querySelector("[data-slot=section-card-body]")!;
    expect(cls(body)).toEqual(expect.arrayContaining(["rounded-xl", "p-4", "bg-card", "border-border/50"]));
    expect(body.textContent).toBe("body");
  });

  it("SectionCard without label renders no heading", () => {
    render(<SectionCard>x</SectionCard>);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("StatTile asserts MetricCard label contract: label text rendered with MetricCard styling", () => {
    render(<StatTile label="Income" value={<Amount value={1} currency="USD" />} sub="this month" />);
    // Assert MetricCard contract: label text is rendered with MetricCard styling
    expect(screen.getByText("Income")).toBeTruthy();
    expect(cls(screen.getByText("Income"))).toEqual(
      expect.arrayContaining(["text-xs", "font-medium", "text-muted-foreground", "tracking-wide", "uppercase", "truncate"])
    );
    // Assert value is rendered (the Amount component should show $1.00)
    expect(screen.getByText("$1.00")).toBeTruthy();
    // Assert sub-line is rendered
    expect(screen.getByText("this month")).toBeTruthy();
  });

  it("StatTile renders ReactNode labels (not just strings) and preserves their structure", () => {
    render(<StatTile label={<span data-testid="lbl">Inc<b>ome</b></span>} value="1" />);
    expect(screen.getByTestId("lbl")).toBeTruthy();
    expect(screen.queryByText("Stat")).toBeNull();
  });
});

describe("PillButton", () => {
  it("is a button with the native pill look and a 44px hit area", () => {
    render(<PillButton>+ Add</PillButton>);
    const b = screen.getByRole("button", { name: "+ Add" });
    expect(b.getAttribute("type")).toBe("button");
    expect(cls(b)).toEqual(expect.arrayContaining(["h-9", "rounded-lg", "px-3.5", "font-bold", "bg-primary", "after:-inset-y-1"]));
  });

  it("36px box + 2x4px pseudo extension = 44px", () => {
    render(<PillButton>x</PillButton>);
    const c = cls(screen.getByRole("button"));
    expect(c).toContain("h-9"); // 36
    expect(c).toContain("after:-inset-y-1"); // +4 top +4 bottom
  });

  it("renders a link when href is given", () => {
    render(<PillButton href="/x">Go</PillButton>);
    expect(screen.getByRole("link", { name: "Go" }).getAttribute("href")).toBe("/x");
  });
});

describe("DetailSheet", () => {
  it("lists label/value pairs in a dialog and renders actions", async () => {
    render(
      <DetailSheet open onOpenChange={() => {}} title="PVS.VN" items={[{ label: "Quantity", value: "300" }, { label: "Avg cost", value: "33,333" }]}>
        <button>Edit</button>
      </DetailSheet>,
    );
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("PVS.VN")).toBeTruthy();
    expect(within(dlg).getByText("Quantity").tagName).toBe("DT");
    expect(within(dlg).getByText("300").tagName).toBe("DD");
    expect(within(dlg).getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    render(<DetailSheet open={false} onOpenChange={() => {}} title="x" items={[]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
