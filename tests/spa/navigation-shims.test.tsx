// @vitest-environment jsdom
/** next/navigation shim behaviour the toolbar / split view / refresh sites depend on. */
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const reval = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/write-revalidation", () => ({ scheduleRevalidation: reval }));

import { useRouter, useSearchParams } from "@/spa/shims/next-navigation";
import { subscribeLocation } from "@/spa/history-sync";

function Probe({ onSearch }: { onSearch: (s: string) => void }) {
  onSearch(useSearchParams().toString());
  return null;
}

describe("router.refresh()", () => {
  it("revalidates every mounted /api SWR key and emits spa:refresh", () => {
    const ev = vi.fn();
    window.addEventListener("spa:refresh", ev);
    useRouter().refresh();
    expect(reval).toHaveBeenCalledWith(0);
    expect(ev).toHaveBeenCalledTimes(1);
    window.removeEventListener("spa:refresh", ev);
  });
});

describe("history.replaceState keeps useSearchParams in step (as Next does)", () => {
  it("re-renders with the new query and keeps react-router's history.state when null is passed", () => {
    window.history.replaceState({ usr: null, key: "k1", idx: 3 }, "", "/transactions");
    const seen: string[] = [];
    render(<MemoryRouter initialEntries={["/transactions"]}><Probe onSearch={(s) => seen.push(s)} /></MemoryRouter>);
    expect(seen.at(-1)).toBe("");
    act(() => { window.history.replaceState(null, "", "/transactions?q=grab&sel=7"); });
    expect(seen.at(-1)).toBe("q=grab&sel=7");
    expect(window.history.state).toMatchObject({ key: "k1", idx: 3 });
    act(() => { window.history.pushState({ usr: null, key: "k2", idx: 4 }, "", "/transactions?sel=new"); });
    expect(seen.at(-1)).toBe("sel=new");
  });
  it("subscribeLocation unsubscribes", () => {
    const cb = vi.fn();
    const off = subscribeLocation(cb);
    window.history.replaceState(null, "", "/a");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    window.history.replaceState(null, "", "/b");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
