/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";

afterEach(cleanup);

let mounts = 0;
function Probe() {
  React.useEffect(() => { mounts++; }, []);
  return <p>probe body</p>;
}

function ui() {
  return (
    <Accordion>
      <AccordionItem value="a" title="Alpha" description="first"><Probe /></AccordionItem>
      <AccordionItem value="b" title="Beta" description="second"><p>beta body</p></AccordionItem>
    </Accordion>
  );
}

describe("Accordion", () => {
  it("starts collapsed with aria-expanded=false", () => {
    render(ui());
    expect(screen.getByRole("button", { name: /Alpha/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("is single-open: opening B closes A", () => {
    render(ui());
    const a = screen.getByRole("button", { name: /Alpha/ });
    const b = screen.getByRole("button", { name: /Beta/ });
    fireEvent.click(a);
    expect(a.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("clicking the open header collapses it", () => {
    render(ui());
    const a = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.click(a);
    fireEvent.click(a);
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("wires aria-controls to a region labelled by the button", () => {
    render(ui());
    const a = screen.getByRole("button", { name: /Alpha/ });
    fireEvent.click(a);
    const region = screen.getByRole("region");
    expect(a.getAttribute("aria-controls")).toBe(region.id);
    expect(region.getAttribute("aria-labelledby")).toBe(a.id);
  });

  it("mounts panel content lazily, only when opened", () => {
    mounts = 0;
    render(ui());
    expect(mounts).toBe(0);
    expect(screen.queryByText("probe body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(screen.getByText("probe body")).toBeTruthy();
    expect(mounts).toBe(1);
  });

  it("supports controlled value", () => {
    render(
      <Accordion value="b"><AccordionItem value="a" title="Alpha"><p>x</p></AccordionItem>
        <AccordionItem value="b" title="Beta"><p>y</p></AccordionItem></Accordion>,
    );
    expect(screen.getByRole("button", { name: /Beta/ }).getAttribute("aria-expanded")).toBe("true");
  });
});
