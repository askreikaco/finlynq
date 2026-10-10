/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";

import { FormFooter, FormGroup, FormNote } from "@/components/forms";
import { ListCard } from "@/components/transactions/entry/list-card";
import { FormRow } from "@/components/transactions/entry/form-row";

afterEach(() => cleanup());

function has(el: Element, ...classes: string[]) {
  for (const c of classes) expect(el.classList.contains(c), `class ${c}`).toBe(true);
}

describe("FormGroup", () => {
  it("carries the list card classes and passes through props", () => {
    render(<FormGroup data-testid="g">row</FormGroup>);
    has(screen.getByTestId("g"), "rounded-2xl", "border", "border-border", "bg-card", "divide-y", "divide-border", "overflow-hidden");
  });
});

describe("FormNote and FormFooter", () => {
  it("FormNote is muted by default and destructive for tone=error", () => {
    const { rerender } = render(<FormNote>Loading</FormNote>);
    has(screen.getByText("Loading"), "text-muted-foreground", "rounded-xl");
    rerender(<FormNote tone="error">Failed</FormNote>);
    has(screen.getByText("Failed"), "text-destructive");
  });

  it("FormFooter lays out children right-aligned with the safe-area pad", () => {
    render(<FormFooter data-testid="f"><button>Save</button></FormFooter>);
    has(screen.getByTestId("f"), "flex", "justify-end", "gap-2");
  });
});

describe("old transactions/new imports still resolve", () => {
  it("ListCard is the shared FormGroup", () => {
    render(<ListCard data-testid="lc">x</ListCard>);
    has(screen.getByTestId("lc"), "rounded-2xl", "divide-y");
  });

  it("transactions FormRow defaults to narrow label and tall row", () => {
    render(
      <ListCard>
        <FormRow variant="button" label="Account" value="Cash" onClick={() => {}} testId="old" />
      </ListCard>,
    );
    const row = screen.getByTestId("old");
    has(row, "min-h-12");
    has(row.querySelector("span") as Element, "w-24");
  });
});
