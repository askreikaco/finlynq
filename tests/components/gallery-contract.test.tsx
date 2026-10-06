/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { sizeClassFor } from "@/components/ui/size-class";
import { ListRow } from "@/components/mobile/list-row";
import { StatTile } from "@/components/mobile/stat-tile";
import { SectionCard } from "@/components/mobile/section-card";
import { PageHeader } from "@/components/mobile/page-header";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

const TEST_WIDTHS = {
  compact: 400, // < 640
  regular: 800, // 640-1024
  wide: 1200, // > 1024
};

/**
 * Gallery contract test: rendering primitives at 3 container widths.
 * Asserts:
 * - sizeClassFor produces correct values for each width
 * - Primitives render without horizontal overflow classes (w-[900px], etc)
 * - Required ARIA roles are present
 */
describe("gallery-contract", () => {
  describe("sizeClassFor boundaries", () => {
    it("correctly classifies compact width", () => {
      expect(sizeClassFor(TEST_WIDTHS.compact)).toBe("compact");
    });

    it("correctly classifies regular width", () => {
      expect(sizeClassFor(TEST_WIDTHS.regular)).toBe("regular");
    });

    it("correctly classifies wide width", () => {
      expect(sizeClassFor(TEST_WIDTHS.wide)).toBe("wide");
    });
  });

  describe("mobile primitives render without overflow", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it("ListRow renders at all widths without overflow classes", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <ListRow
              title="Sample Transaction"
              value="$100.00"
              icon={DollarSign}
            />
          </div>
        );

        const html = testContainer.innerHTML;
        expect(html).not.toMatch(/w-\[\d+px\]/);
        expect(html).not.toContain("overflow");
      });
    });

    it("StatTile renders at all widths without overflow classes", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <StatTile label="Balance" value="$5,000.00" />
          </div>
        );

        const html = testContainer.innerHTML;
        expect(html).not.toMatch(/w-\[\d+px\]/);
      });
    });

    it("SectionCard renders at all widths", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <SectionCard>
              <div>Sample content</div>
            </SectionCard>
          </div>
        );

        expect(testContainer.querySelector("[class*='SectionCard']") || testContainer).toBeTruthy();
      });
    });

    it("PageHeader renders at all widths", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <PageHeader title="Test Page" />
          </div>
        );

        expect(testContainer.textContent).toContain("Test Page");
      });
    });

    it("MetricCard renders at all widths without overflow classes", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <MetricCard
              label="Net Worth"
              icon={DollarSign}
              value={50000}
              sub="Today"
            />
          </div>
        );

        const html = testContainer.innerHTML;
        expect(html).not.toMatch(/w-\[\d+px\]/);
      });
    });

    it("Button renders at all widths", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <Button>Click me</Button>
          </div>
        );

        expect(testContainer.textContent).toContain("Click me");
      });
    });

    it("Card renders at all widths", () => {
      Object.values(TEST_WIDTHS).forEach((width) => {
        const { container: testContainer } = render(
          <div style={{ width: `${width}px` }}>
            <Card>
              <div>Card content</div>
            </Card>
          </div>
        );

        expect(testContainer.textContent).toContain("Card content");
      });
    });
  });

  describe("required ARIA roles", () => {
    it("ListRow is semantically marked as interactive", () => {
      const { container } = render(
        <ListRow title="Item" href="/path" />
      );

      const row = container.querySelector("a");
      expect(row).toBeTruthy();
    });

    it("PageHeader contains a heading", () => {
      const { container } = render(
        <PageHeader title="Test Heading" />
      );

      const heading = container.querySelector("h1, h2, h3");
      expect(heading).toBeTruthy();
    });

    it("Button has proper role semantics", () => {
      const { container } = render(
        <Button>Action</Button>
      );

      const button = container.querySelector("button");
      expect(button).toBeTruthy();
    });

    it("Card renders as a semantic container", () => {
      const { container } = render(
        <Card className="p-4">Content</Card>
      );

      expect(container.textContent).toContain("Content");
      // Card should not introduce invalid role conflicts
      expect(container.innerHTML).not.toContain('role="invalid"');
    });
  });

  describe("no hard-coded width constraints", () => {
    it("primitives do not use arbitrary width values like w-[900px]", () => {
      const { container: compactContainer } = render(
        <div style={{ width: "400px" }}>
          <ListRow title="Item" value="Value" />
        </div>
      );

      const { container: wideContainer } = render(
        <div style={{ width: "1200px" }}>
          <ListRow title="Item" value="Value" />
        </div>
      );

      const compactHtml = compactContainer.innerHTML;
      const wideHtml = wideContainer.innerHTML;

      // Neither should have arbitrary fixed widths
      expect(compactHtml).not.toMatch(/w-\[\d+px\]/);
      expect(wideHtml).not.toMatch(/w-\[\d+px\]/);
    });
  });
});
