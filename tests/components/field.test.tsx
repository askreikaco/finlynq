/**
 * @vitest-environment jsdom
 */
// Field: the one form-input component. Behaviour of every control, and of the parts around it (label placement,
// info tip, hint / warning / error, required / optional, adornments, FieldGroup rows).
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Banknote } from "lucide-react";

let locale = "en-CA";
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale }) }));

import { Field, FieldGroup } from "@/components/ui/field";
import { fitTextareaToContent } from "@/components/ui/field/controls";
import { setActiveDisplayLocale } from "@/lib/locale";

afterEach(() => {
  cleanup();
  locale = "en-CA";
  setActiveDisplayLocale("en-CA");
});

let scrollH = 0;
Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => scrollH });

function Controlled({ initial = "", ...rest }: { initial?: string } & Record<string, unknown>) {
  const [v, setV] = React.useState(initial);
  return <Field value={v} onChange={(e) => setV(e.target.value)} {...(rest as object)} />;
}

describe("Field chrome", () => {
  it("names the input with its label and forwards native attributes", () => {
    render(<Field label="Payee" placeholder="Merchant" inputMode="text" autoComplete="off" name="payee" value="" onChange={() => {}} />);
    const el = screen.getByLabelText("Payee") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("text");
    expect(el.getAttribute("autocomplete")).toBe("off");
    expect(el.getAttribute("name")).toBe("payee");
    expect(el.placeholder).toBe("Merchant");
  });

  it("shows required and optional markers after the label", () => {
    render(
      <>
        <Field label="Name" required value="" onChange={() => {}} />
        <Field label="Note" optional value="" onChange={() => {}} />
      </>,
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).required).toBe(true);
    expect(screen.getByText("*")).toBeTruthy();
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  it("puts descriptions in the (i) tip, never in a paragraph", () => {
    render(<Field label="Alias" info="Short nickname used when matching" value="" onChange={() => {}} />);
    const tip = screen.getByRole("button", { name: "About alias" });
    expect(tip).toBeTruthy();
    expect(screen.queryByText("Short nickname used when matching")).toBeNull();
    fireEvent.click(tip);
    expect(screen.getByText("Short nickname used when matching")).toBeTruthy();
  });

  it("error marks the input invalid, is announced and described", () => {
    render(<Field label="Name" error="Name is required" value="" onChange={() => {}} />);
    const el = screen.getByLabelText("Name");
    expect(el.getAttribute("aria-invalid")).toBe("true");
    const err = screen.getByRole("alert");
    expect(err.textContent).toBe("Name is required");
    expect(el.getAttribute("aria-describedby")).toBe(err.id);
  });

  it("hint and warning describe the input; an error wins over both", () => {
    const { rerender } = render(<Field label="A" hint="short hint" value="" onChange={() => {}} />);
    const el = screen.getByLabelText("A");
    expect(screen.getByText("short hint").id).toBe(el.getAttribute("aria-describedby"));
    rerender(<Field label="A" hint="short hint" warning="careful" value="" onChange={() => {}} />);
    expect(screen.queryByText("short hint")).toBeNull();
    expect(screen.getByText("careful").className).toContain("text-warning");
    rerender(<Field label="A" hint="short hint" warning="careful" error="bad" value="" onChange={() => {}} />);
    expect(screen.queryByText("careful")).toBeNull();
    expect(screen.getByText("bad")).toBeTruthy();
  });

  it("hideLabel keeps the label as the accessible name only", () => {
    render(<Field label="Tags" hideLabel icon={Banknote} value="" onChange={() => {}} />);
    const el = screen.getByLabelText("Tags");
    expect(el).toBeTruthy();
    expect(screen.getByText("Tags").className).toContain("sr-only");
  });

  it("renders prefix and suffix adornments around the control", () => {
    render(<Field label="Rate" prefix={<span>PRE</span>} suffix={<span>SUF</span>} value="" onChange={() => {}} />);
    const surface = document.querySelector('[data-slot="field-surface"]')!;
    expect(within(surface as HTMLElement).getByText("PRE")).toBeTruthy();
    expect(within(surface as HTMLElement).getByText("SUF")).toBeTruthy();
  });

  it("label placement: top by default, left and inline on request; toggles are inline", () => {
    render(
      <>
        <Field label="A" value="" onChange={() => {}} testId="top" />
        <Field label="B" labelPlacement="left" value="" onChange={() => {}} testId="left" />
        <Field label="C" control="switch" checked={false} testId="toggle" />
      </>,
    );
    expect(screen.getByTestId("top").getAttribute("data-placement")).toBe("top");
    expect(screen.getByTestId("left").getAttribute("data-placement")).toBe("left");
    expect(screen.getByTestId("toggle").getAttribute("data-placement")).toBe("inline");
  });

  it("sizes the control box to 44px, compact to 32px with a 44px touch floor", () => {
    render(
      <>
        <Field aria-label="Std" value="" onChange={() => {}} />
        <Field aria-label="Cmp" compact value="" onChange={() => {}} />
      </>,
    );
    const [std, cmp] = Array.from(document.querySelectorAll('[data-slot="field-surface"]')) as HTMLElement[];
    expect(std.className).toContain("h-11");
    expect(cmp.className).toContain("h-8");
    expect(cmp.className).toContain("pointer-coarse:h-11");
  });
});

describe("Field controls", () => {
  it("number and date use the matching native type and constraints", () => {
    render(
      <>
        <Field control="number" label="Qty" min={0} max={9} value="3" onChange={() => {}} />
        <Field control="date" label="On" min="2026-01-01" max="2026-12-31" value="2026-03-29" onChange={() => {}} />
      </>,
    );
    const q = screen.getByLabelText("Qty") as HTMLInputElement;
    const d = screen.getByLabelText("On") as HTMLInputElement;
    expect(q.type).toBe("number");
    expect(q.min).toBe("0");
    expect(d.type).toBe("date");
    expect(d.value).toBe("2026-03-29");
    expect(d.min).toBe("2026-01-01");
  });

  it("date reports the change event", () => {
    const onChange = vi.fn();
    render(<Field control="date" label="On" value="2026-03-29" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("On"), { target: { value: "2026-04-01" } });
    expect(onChange).toHaveBeenCalled();
  });

  describe("textarea (auto-grow)", () => {
    it("is a two-row textarea that wraps long words and never scrolls sideways", () => {
      render(<Field control="textarea" aria-label="Note" value="" onChange={() => {}} />);
      const el = screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
      expect(el.tagName).toBe("TEXTAREA");
      expect(el.getAttribute("rows")).toBe("2");
      expect(el.className).toContain("resize-none");
      expect(el.className).toContain("whitespace-pre-wrap");
      expect(el.className).toContain("break-words");
    });

    it("height follows scrollHeight as the value changes", () => {
      scrollH = 48;
      render(<Controlled control="textarea" aria-label="Note" />);
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

    it("Enter is not prevented (inserts a newline)", () => {
      const onKeyDown = vi.fn();
      render(<Field control="textarea" aria-label="Note" value="" onChange={() => {}} onKeyDown={onKeyDown} />);
      const prevented = !fireEvent.keyDown(screen.getByRole("textbox", { name: "Note" }), { key: "Enter" });
      expect(prevented).toBe(false);
      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe("amount (follows the Language preference)", () => {
    function Harness({ initial = "" }: { initial?: string }) {
      const [v, setV] = React.useState(initial);
      return (
        <>
          <Field control="amount" data-testid="in" step="0.01" value={v} onValueChange={setV} />
          <span data-testid="out">{v}</span>
        </>
      );
    }

    it("en: native number input, canonical passthrough", () => {
      render(<Harness />);
      const el = screen.getByTestId("in") as HTMLInputElement;
      expect(el.type).toBe("number");
      fireEvent.change(el, { target: { value: "1234.5" } });
      expect(screen.getByTestId("out").textContent).toBe("1234.5");
    });

    it("vi: text input, '1.234.567' and '1,5' emit canonical strings", () => {
      locale = "vi-VN";
      render(<Harness />);
      const el = screen.getByTestId("in") as HTMLInputElement;
      expect(el.type).toBe("text");
      expect(el.inputMode).toBe("decimal");
      fireEvent.change(el, { target: { value: "1.234.567" } });
      expect(screen.getByTestId("out").textContent).toBe("1234567");
      fireEvent.change(el, { target: { value: "1,5" } });
      expect(screen.getByTestId("out").textContent).toBe("1.5");
      expect(el.value).toBe("1,5");
    });

    it("vi: canonical initial value displays with a decimal comma; a numeric value is accepted", () => {
      locale = "vi-VN";
      render(<Field control="amount" data-testid="in" value={12.5} onValueChange={() => {}} />);
      expect((screen.getByTestId("in") as HTMLInputElement).value).toBe("12,5");
    });
  });

  it("select shows the option label (not the raw value) and lists options", () => {
    render(
      <Field
        control="select"
        label="Type"
        value="E"
        onValueChange={() => {}}
        options={[
          { value: "E", label: "Expense" },
          { value: "I", label: "Income" },
        ]}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Type" });
    expect(trigger.textContent).toContain("Expense");
  });

  it("select placeholder shows while nothing is picked", () => {
    render(<Field control="select" label="Type" value="" onValueChange={() => {}} placeholder="Pick one" options={[{ value: "E", label: "Expense" }]} />);
    expect(screen.getByRole("combobox", { name: "Type" }).textContent).toContain("Pick one");
  });

  it("combobox shows the selected label, or the placeholder", () => {
    const options = [
      { value: "usd", label: "USD" },
      { value: "eur", label: "EUR" },
    ];
    const { rerender } = render(<Field control="combobox" label="Currency" value="eur" onValueChange={() => {}} options={options} />);
    expect(screen.getByRole("combobox", { name: "Currency" }).textContent).toContain("EUR");
    rerender(<Field control="combobox" label="Currency" value="" onValueChange={() => {}} options={options} placeholder="Pick" />);
    expect(screen.getByRole("combobox", { name: "Currency" }).textContent).toContain("Pick");
  });

  describe("group-combobox", () => {
    it("filters existing values, offers Add for new text and picks with the keyboard", () => {
      const onValueChange = vi.fn();
      render(<Field control="group-combobox" label="Group" value="Chec" onValueChange={onValueChange} options={["Checking", "Savings"]} />);
      const input = screen.getByRole("combobox", { name: "Group" });
      fireEvent.focus(input);
      const rows = screen.getAllByRole("option").map((o) => o.textContent);
      expect(rows).toEqual(["No group", "Checking", 'Add "Chec"']);
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onValueChange).toHaveBeenCalledWith("Checking");
    });
  });

  it("switch toggles from its label and reports the new state", () => {
    const onCheckedChange = vi.fn();
    render(<Field control="switch" label="Business" checked={false} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Business" });
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("checkbox reports a boolean through onCheckedChange and onChange", () => {
    const onCheckedChange = vi.fn();
    const onChange = vi.fn();
    render(<Field control="checkbox" label="Select all" checked={false} onCheckedChange={onCheckedChange} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Select all"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalled();
  });

  describe("segmented", () => {
    const options = [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C" },
    ];

    it("is a labelled radiogroup with one tab stop", () => {
      render(<Field control="segmented" label="Mode" value="a" onValueChange={() => {}} options={options} />);
      const group = screen.getByRole("radiogroup", { name: "Mode" });
      const radios = within(group).getAllByRole("radio");
      expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
      expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    });

    it("arrow keys move the selection and skip disabled options", () => {
      const onValueChange = vi.fn();
      render(<Field control="segmented" aria-label="Mode" value="a" onValueChange={onValueChange} options={options} />);
      fireEvent.keyDown(screen.getByRole("radio", { name: "A" }), { key: "ArrowRight" });
      expect(onValueChange).toHaveBeenCalledWith("c");
    });

    it("a click picks an option", () => {
      const onValueChange = vi.fn();
      render(<Field control="segmented" aria-label="Mode" value="a" onValueChange={onValueChange} options={options} />);
      fireEvent.click(screen.getByRole("radio", { name: "C" }));
      expect(onValueChange).toHaveBeenCalledWith("c");
    });
  });

  describe("stepper", () => {
    it("steps by one within min and max, with named buttons", () => {
      const onValueChange = vi.fn();
      render(<Field control="stepper" label="Months" stepLabel="months" min={1} max={3} value="3" onValueChange={onValueChange} data-testid="m" />);
      expect((screen.getByRole("button", { name: "Increase months" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Decrease months" }));
      expect(onValueChange).toHaveBeenCalledWith("2");
      expect(screen.getByTestId("m-decrease")).toBeTruthy();
      expect(screen.getByTestId("m-increase")).toBeTruthy();
    });

    it("keeps digits only and honours a custom step rule", () => {
      const onValueChange = vi.fn();
      render(<Field control="stepper" aria-label="Splits" stepLabel="splits" value="" onValueChange={onValueChange} onStep={() => "2"} />);
      fireEvent.change(screen.getByLabelText("Splits"), { target: { value: "1a2" } });
      expect(onValueChange).toHaveBeenLastCalledWith("12");
      fireEvent.click(screen.getByRole("button", { name: "Increase splits" }));
      expect(onValueChange).toHaveBeenLastCalledWith("2");
    });
  });

  describe("picker", () => {
    it("is a button named by its label and value; click opens", () => {
      const onClick = vi.fn();
      render(<Field control="picker" label="Category" value="Food" onClick={onClick} />);
      const btn = screen.getByRole("button", { name: /Category Food/ });
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalled();
    });

    it("shows the placeholder, or Required when invalid and empty", () => {
      const { rerender } = render(<Field control="picker" label="Account" placeholder="Pick an account" />);
      expect(screen.getByRole("button", { name: /Account/ }).textContent).toContain("Pick an account");
      rerender(<Field control="picker" label="Account" placeholder="Pick an account" invalid />);
      expect(screen.getByRole("button", { name: /Account/ }).textContent).toContain("Required");
    });
  });

  it("custom slot gets the label as <label for> when htmlFor is given", () => {
    render(
      <Field control="custom" label="Date" htmlFor="x-date">
        <input id="x-date" type="date" />
      </Field>,
    );
    expect(screen.getByLabelText("Date")).toBe(document.getElementById("x-date"));
  });
});

describe("FieldGroup", () => {
  it("renders Fields as divider rows with the label on the left", () => {
    render(
      <FieldGroup label="Account" data-testid="g">
        <Field label="Name" value="" onChange={() => {}} testId="r1" />
        <Field label="Active" control="switch" checked testId="r2" />
      </FieldGroup>,
    );
    const group = screen.getByTestId("g");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.innerHTML).toContain("shadow-[var(--list-divider)]");
    expect(screen.getByTestId("r1").getAttribute("data-placement")).toBe("left");
    expect(screen.getByTestId("r2").getAttribute("data-placement")).toBe("inline");
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
  });

  it("shows a panel below the rows", () => {
    render(
      <FieldGroup panel={<div>panel body</div>}>
        <Field label="On" control="switch" checked />
      </FieldGroup>,
    );
    expect(screen.getByText("panel body")).toBeTruthy();
  });
});
