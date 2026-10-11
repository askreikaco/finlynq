/**
 * @vitest-environment jsdom
 */
import React from "react";
import * as fs from "fs";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/general",
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/settings/sections/dropdown-order-section", () => ({
  DropdownOrderSection: () => null,
}));

import {
  DensityProvider,
  useDensity,
  DENSITY_STORAGE_KEY,
  DEFAULT_DENSITY,
} from "@/components/adaptive/density-provider";
import { DisplaySection } from "@/components/settings/sections/display-section";
import { PER_USER_STORAGE_KEYS } from "@/lib/client/user-storage";

function Probe() {
  const { density, setDensity } = useDensity();
  return (
    <div>
      <span data-testid="density">{density}</span>
      <button type="button" onClick={() => setDensity("compact")}>to-compact</button>
      <button type="button" onClick={() => setDensity("comfortable")}>to-comfortable</button>
    </div>
  );
}

function mount() {
  return render(
    <DensityProvider>
      <Probe />
    </DensityProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-density");
});
afterEach(() => cleanup());

describe("DensityProvider", () => {
  it("defaults to comfortable and sets data-density on <html>", () => {
    mount();
    expect(DEFAULT_DENSITY).toBe("comfortable");
    expect(screen.getByTestId("density").textContent).toBe("comfortable");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  it("restores compact from device storage on mount", () => {
    localStorage.setItem("pf-density", "compact");
    mount();
    expect(screen.getByTestId("density").textContent).toBe("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  it("an unknown stored value falls back to comfortable", () => {
    localStorage.setItem("pf-density", "tiny");
    mount();
    expect(screen.getByTestId("density").textContent).toBe("comfortable");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  it("setDensity updates <html> and writes the device-level key pf-density", () => {
    mount();
    fireEvent.click(screen.getByText("to-compact"));
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(localStorage.getItem("pf-density")).toBe("compact");
    fireEvent.click(screen.getByText("to-comfortable"));
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
    expect(localStorage.getItem("pf-density")).toBe("comfortable");
  });

  it("is device-level: not namespaced per user and not in PER_USER_STORAGE_KEYS", () => {
    expect(DENSITY_STORAGE_KEY).toBe("pf-density");
    expect(PER_USER_STORAGE_KEYS).not.toContain("pf-density");
    mount();
    fireEvent.click(screen.getByText("to-compact"));
    const keys = Object.keys(localStorage);
    expect(keys).toContain("pf-density");
    expect(keys.some((k) => k.startsWith("pf-density:"))).toBe(false);
  });

  it("useDensity outside a provider returns the default and a no-op setter", () => {
    render(<Probe />);
    expect(screen.getByTestId("density").textContent).toBe("comfortable");
    expect(() => fireEvent.click(screen.getByText("to-compact"))).not.toThrow();
    expect(localStorage.getItem("pf-density")).toBeNull();
  });

  it("the root layout runs the pre-paint FOUC script and mounts the provider", () => {
    const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('localStorage.getItem("pf-density")');
    expect(layout).toContain("<DensityProvider>");
  });
});

describe("Settings > Display > Density row", () => {
  it("offers Comfortable (default) and Compact as a radiogroup that changes density", () => {
    mount2();
    const group = screen.getByRole("radiogroup", { name: "Density" });
    expect(group).toBeTruthy();
    const comfortable = screen.getByRole("radio", { name: "Comfortable" });
    const compact = screen.getByRole("radio", { name: "Compact" });
    expect(comfortable.getAttribute("aria-checked")).toBe("true");
    expect(compact.getAttribute("aria-checked")).toBe("false");
    act(() => {
      fireEvent.click(compact);
    });
    expect(compact.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(localStorage.getItem("pf-density")).toBe("compact");
    window.history.replaceState(null, "", "/");
  });
});

// Settings row mounted inside the provider.
function mount2() {
  // Open the Density accordion item the way a deep link does (#density).
  window.history.replaceState(null, "", "#density");
  return render(
    <DensityProvider>
      <DisplaySection />
    </DensityProvider>,
  );
}

describe("shared layout components honour dense:", () => {
  const read = (p: string) => fs.readFileSync(p, "utf8");

  it("Card tightens gap and padding in compact only", () => {
    const src = read("src/components/ui/card.tsx");
    for (const c of ["dense:pointer-fine:gap-3", "dense:pointer-fine:py-2.5", "dense:pointer-fine:[.border-b]:pb-3"]) expect(src).toContain(c);
    // Default classes untouched.
    expect(src).toContain("gap-4");
    expect(src).toContain("py-3 regular:py-4");
  });

  it("FormRow / FormGroup / ListRow / DataView carry dense: tweaks", () => {
    const row = read("src/components/forms/form-row.tsx");
    expect(row).toContain('"min-h-11 dense:pointer-fine:min-h-9"');
    expect(row).toContain("dense:gap-2");
    expect(read("src/components/forms/form-group.tsx")).toContain("dense:rounded-xl");
    expect(read("src/components/mobile/list-row.tsx")).toContain("dense:py-1.5");
    expect(read("src/components/adaptive/data-view.tsx")).toContain("dense:[&[data-view=cards]>.grid]:gap-2");
  });

  it("default (comfortable) output keeps the original classes; dense: classes are inert without data-density=compact", async () => {
    const { Card } = await import("@/components/ui/card");
    const { FormGroup } = await import("@/components/forms/form-group");
    const { container } = render(
      <div>
        <Card>x</Card>
        <FormGroup>y</FormGroup>
      </div>,
    );
    const card = container.querySelector('[data-slot="card"]')!;
    expect(card.className).toContain("gap-4");
    expect(card.className).toContain("py-3");
    expect(card.className).toContain("regular:py-4");
    const group = container.firstElementChild!.lastElementChild!;
    expect(group.className).toContain("rounded-2xl");
    // Every added token is dense:-prefixed; stripping them yields the original class list.
    const stripped = card.className.split(/\s+/).filter((t) => !t.startsWith("dense:")).join(" ");
    expect(stripped).toContain("group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-3 regular:py-4 text-sm");
  });
});
