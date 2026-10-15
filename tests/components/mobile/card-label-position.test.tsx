// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Wallet } from "lucide-react";
import {
  CARD_PAD_X,
  CARD_LABEL_TOP,
  CARD_LABEL_TEXT,
  CARD_ICON_TILE,
  CARD_LABEL_GAP,
  CARD_LABEL_MB,
  METRIC_TONES,
} from "@/components/mobile/card-label";
import { Card } from "@/components/ui/card";

vi.mock("next/link", () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/animated-number", () => ({ AnimatedNumber: ({ value }: any) => <span>{value}</span> }));
vi.mock("@/components/sparkline", () => ({ Sparkline: () => null }));
vi.mock("@/components/ui/lazy-view", () => ({ LazyView: ({ children }: any) => <>{children}</> }));

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("card label position is shared", () => {
  it("the metric and the body layout both render the one CardLabel row", () => {
    const src = read("src/components/ui/card.tsx");
    expect(src.match(/<CardLabel\b/g)).toHaveLength(2);
    expect(src).not.toContain("SectionLabel");
    expect(CARD_PAD_X).toBe("px-3 @[11rem]:px-5");
  });

  it("a titled card label row carries the px constants and the card is a container", () => {
    const { container } = render(<Card title="Action Center" icon={Wallet} tone="indigo">x</Card>);
    const card = container.querySelector("[data-slot=card]")!;
    expect(card.className).toContain("@container");
    const row = container.querySelector("[data-slot=card-label]")!;
    for (const c of CARD_PAD_X.split(" ")) expect(row.className).toContain(c);
    for (const c of CARD_LABEL_TOP.split(" ")) expect(row.className).toContain(c);
    for (const c of CARD_LABEL_GAP.split(" ")) expect(row.className).toContain(c);
    expect(row.className).toContain(CARD_LABEL_MB);
    const body = container.querySelector("[data-slot=card-body]")!;
    for (const c of CARD_PAD_X.split(" ")) expect(body.className).toContain(c);
  });

  it("metric and body cards: label row, text and icon tile are identical", () => {
    const m = render(<Card title="Total Net Worth" icon={Wallet} tone="indigo" value="1" />);
    const s = render(<Card title="Action Center" icon={Wallet} tone="indigo">x</Card>);
    const mr = m.container.querySelector("[data-slot=card-label]")!;
    const sr = s.container.querySelector("[data-slot=card-label]")!;
    for (const c of [...CARD_LABEL_TOP.split(" "), ...CARD_PAD_X.split(" ")]) {
      expect(mr.className).toContain(c);
      expect(sr.className).toContain(c);
    }
    const mt = m.container.querySelector("[data-slot=card-label-text]")!;
    const st = s.container.querySelector("[data-slot=card-label-text]")!;
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

  it("no icon -> no tile, same padding (sticky date headers / sub-labels); action on the right", () => {
    const { container, getByText } = render(
      <Card title="Today" titleClassName="sticky" action={<button>Edit</button>}>x</Card>,
    );
    expect(container.querySelector("[data-slot=card-label-icon]")).toBeNull();
    const row = container.querySelector("[data-slot=card-label]")!;
    expect(row.className).toContain("sticky");
    expect(row.className).toContain("@[11rem]:px-5");
    expect(row.contains(getByText("Edit"))).toBe(true);
  });
});
