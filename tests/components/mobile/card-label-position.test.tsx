// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Wallet } from "lucide-react";
import {
  CardLabel,
  CARD_PAD_X,
  CARD_PAD_T,
  CARD_LABEL_TOP,
  CARD_LABEL_TEXT,
  CARD_ICON_TILE,
  CARD_LABEL_GAP,
  CARD_LABEL_MB,
  METRIC_TONES,
} from "@/components/mobile/card-label";
import { SectionCard } from "@/components/mobile/section-card";
import { MetricCard, METRIC_TONES as METRIC_TONES_REEXPORT } from "@/components/metric-card";

vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
vi.mock("framer-motion", () => ({ motion: { div: ({ children, variants, ...p }: any) => <div {...p}>{children}</div> } }));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/animated-number", () => ({ AnimatedNumber: ({ value }: any) => <span>{value}</span> }));
vi.mock("@/components/sparkline", () => ({ Sparkline: () => null }));
vi.mock("@/components/ui/lazy-view", () => ({ LazyView: ({ children }: any) => <>{children}</> }));

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("card label position is shared", () => {
  it("MetricCard and SectionCard both render the shared CardLabel", () => {
    expect(read("src/components/metric-card.tsx")).toMatch(/<CardLabel\b/);
    expect(read("src/components/mobile/section-card.tsx")).toMatch(/<CardLabel\b/);
    // the old per-component label markup is gone
    expect(read("src/components/mobile/section-card.tsx")).not.toContain("SectionLabel");
  });

  it("MetricCard content uses the exported padding constants", () => {
    const src = read("src/components/metric-card.tsx");
    expect(src).toContain("${CARD_PAD_T} ${CARD_PAD_X}");
    expect(CARD_PAD_X).toBe("px-3 @[11rem]:px-5");
    expect(CARD_PAD_T).toBe("pt-4");
  });

  it("SectionCard label row carries the same px constants and is a container", () => {
    const { container } = render(<SectionCard label="Action Center" icon={Wallet} tone="indigo">x</SectionCard>);
    const card = container.querySelector("[data-slot=section-card]")!;
    expect(card.className).toContain("@container");
    const row = container.querySelector("[data-slot=card-label]")!;
    for (const c of CARD_PAD_X.split(" ")) expect(row.className).toContain(c);
    for (const c of CARD_LABEL_TOP.split(" ")) expect(row.className).toContain(c);
    for (const c of CARD_LABEL_GAP.split(" ")) expect(row.className).toContain(c);
    expect(row.className).toContain(CARD_LABEL_MB);
    const body = container.querySelector("[data-slot=section-card-body]")!;
    for (const c of CARD_PAD_X.split(" ")) expect(body.className).toContain(c);
  });

  it("MetricCard and SectionCard label text + icon tile are identical", () => {
    const m = render(<MetricCard label="Total Net Worth" icon={Wallet} tone="indigo" value="1" />);
    const s = render(<SectionCard label="Action Center" icon={Wallet} tone="indigo">x</SectionCard>);
    const mt = m.container.querySelector("[data-slot=card-label-text]")!;
    const st = s.container.querySelector("[data-slot=section-card-label]")!;
    for (const c of CARD_LABEL_TEXT.split(" ")) {
      expect(mt.className).toContain(c);
      expect(st.className).toContain(c);
    }
    const mi = m.container.querySelector("[data-slot=card-label-icon]")!;
    const si = s.container.querySelector("[data-slot=card-label-icon]")!;
    for (const c of [...CARD_ICON_TILE.split(" "), ...METRIC_TONES.indigo.split(" ")]) {
      expect(mi.className).toContain(c);
      expect(si.className).toContain(c);
    }
  });

  it("METRIC_TONES is one table re-exported by MetricCard", () => {
    expect(METRIC_TONES_REEXPORT).toBe(METRIC_TONES);
  });

  it("no icon -> no tile, same padding (sticky date headers / sub-labels); action on the right", () => {
    const { container, getByText } = render(
      <SectionCard label="Today" labelClassName="sticky" action={<button>Edit</button>}>x</SectionCard>,
    );
    expect(container.querySelector("[data-slot=card-label-icon]")).toBeNull();
    const row = container.querySelector("[data-slot=card-label]")!;
    expect(row.className).toContain("sticky");
    expect(row.className).toContain("@[11rem]:px-5");
    expect(row.contains(getByText("Edit"))).toBe(true);
  });

  it("CardLabel inset skips its own padding (parent pads)", () => {
    const { container } = render(<CardLabel inset>Hi</CardLabel>);
    expect(container.querySelector("[data-slot=card-label]")!.className).not.toContain("px-");
  });
});
