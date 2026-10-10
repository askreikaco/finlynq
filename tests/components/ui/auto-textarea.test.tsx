/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AutoTextarea, fitTextareaToContent } from "@/components/ui/auto-textarea";

afterEach(() => cleanup());

let scrollH = 0;
beforeAllScroll();
function beforeAllScroll() {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollH,
  });
}

function Controlled({ initial = "" }: { initial?: string }) {
  const [v, setV] = React.useState(initial);
  return <AutoTextarea aria-label="Note" value={v} onChange={(e) => setV(e.target.value)} />;
}

describe("AutoTextarea", () => {
  it("is a textarea with a two-row minimum", () => {
    render(<AutoTextarea aria-label="Note" value="" onChange={() => {}} />);
    const el = screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
    expect(el.tagName).toBe("TEXTAREA");
    expect(el.getAttribute("rows")).toBe("2");
    expect(el.className).toContain("resize-none");
    expect(el.className).toContain("whitespace-pre-wrap");
    expect(el.className).toContain("break-words");
  });

  it("height follows scrollHeight as the value changes", () => {
    scrollH = 48;
    render(<Controlled />);
    const el = screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
    expect(el.style.height).toBe("48px");
    scrollH = 120;
    fireEvent.change(el, { target: { value: "a long note\nwith lines" } });
    expect(el.style.height).toBe("120px");
    expect(el.style.overflowY).toBe("hidden");
  });

  it("caps at the computed max-height and scrolls inside", () => {
    scrollH = 400;
    const el = document.createElement("textarea");
    el.style.maxHeight = "192px";
    document.body.appendChild(el);
    fitTextareaToContent(el);
    expect(el.style.height).toBe("192px");
    expect(el.style.overflowY).toBe("auto");
    el.remove();
  });

  it("Enter inserts a newline (no submit, default not prevented)", () => {
    const onKeyDown = vi.fn();
    render(<AutoTextarea aria-label="Note" value="" onChange={() => {}} onKeyDown={onKeyDown} />);
    const el = screen.getByRole("textbox", { name: "Note" });
    const notPrevented = fireEvent.keyDown(el, { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(onKeyDown).toHaveBeenCalled();
  });

  it("forwards the ref to the textarea", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<AutoTextarea ref={ref} aria-label="Note" value="" onChange={() => {}} />);
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Note" }));
  });
});
