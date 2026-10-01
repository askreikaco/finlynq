/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock currency provider
vi.mock("@/components/currency-provider", () => ({
  useDisplayCurrency: () => ({
    setDisplayCurrency: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { OnboardingWizard } from "@/components/onboarding-wizard";

describe("OnboardingWizard", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Budget step", () => {
    it("renders budget amounts with default value 0", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // Click through to budget step (click Continue 4 times: welcome -> currency -> accounts -> data -> budget)
      const continueButtons = screen.getAllByText("Continue");
      fireEvent.click(continueButtons[0]); // welcome -> currency
      await waitFor(() => {
        expect(screen.getByText("Which currency should we show your money in?")).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText("Continue")[0]); // currency -> accounts
      await waitFor(() => {
        expect(screen.getByText("Add accounts")).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText("Continue")[0]); // accounts -> data
      await waitFor(() => {
        expect(screen.getByText("Import your data")).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText("Continue")[0]); // data -> budget
      await waitFor(() => {
        expect(screen.getByText("Set a starter budget")).toBeInTheDocument();
      });

      // Check that all budget inputs have value 0
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      expect(inputs.length).toBeGreaterThan(0);
      inputs.forEach((input) => {
        expect(input.value).toBe("0");
      });
    });

    it("does not create budget rows with amount 0 when finishing", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // Navigate to budget step
      let continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton); // welcome -> currency
      await waitFor(() => {
        expect(screen.getByText("Which currency should we show your money in?")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton); // currency -> accounts
      await waitFor(() => {
        expect(screen.getByText("Add accounts")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton); // accounts -> data
      await waitFor(() => {
        expect(screen.getByText("Import your data")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton); // data -> budget
      await waitFor(() => {
        expect(screen.getByText("Set a starter budget")).toBeInTheDocument();
      });

      // Keep all budgets at 0 and click Continue
      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton); // budget -> mcp
      await waitFor(() => {
        expect(screen.getByText("Connect your AI assistant")).toBeInTheDocument();
      });

      // Click Finish
      const finishButton = screen.getByText("Finish Setup");
      fireEvent.click(finishButton);
      await waitFor(() => {
        // Check that no budget seed calls were made
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const budgetCalls = fetchMock.mock.calls.filter((call: any[]) =>
          call[0]?.includes("/api/budgets/seed")
        );
        expect(budgetCalls.length).toBe(0);
      });
    });
  });

  describe("Mutation tests for budget defaults", () => {
    it("fails if budget amounts are not set to 0", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // Navigate to budget step
      let continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Which currency should we show your money in?")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Add accounts")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Import your data")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Set a starter budget")).toBeInTheDocument();
      });

      // Verify all budget inputs default to 0 (not some preset value)
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      inputs.forEach((input) => {
        // This test verifies the default is 0, not a preset value like 600, 300, etc.
        expect(input.value).toBe("0");
        expect(input.value).not.toBe("600");
        expect(input.value).not.toBe("300");
        expect(input.value).not.toBe("200");
        expect(input.value).not.toBe("150");
      });
    });

    it("fails if skip zero-amount budgets on submission", async () => {
      // This test verifies that the code correctly skips zero amounts
      // If the code is broken and tries to create budgets with 0 amount,
      // this test will fail
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // Navigate to budget step and set one budget to non-zero
      let continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Which currency should we show your money in?")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Add accounts")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Import your data")).toBeInTheDocument();
      });

      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Set a starter budget")).toBeInTheDocument();
      });

      // Get the first budget input and set it to 500
      const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
      const firstInput = inputs[0];
      fireEvent.change(firstInput, { target: { value: "500" } });

      // Navigate to finish and check that only one budget is created
      continueButton = screen.getByText("Continue");
      fireEvent.click(continueButton);
      await waitFor(() => {
        expect(screen.getByText("Connect your AI assistant")).toBeInTheDocument();
      });

      const finishButton = screen.getByText("Finish Setup");
      fireEvent.click(finishButton);

      await waitFor(() => {
        // Check that exactly one budget seed call was made (for the one non-zero amount)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const budgetCalls = fetchMock.mock.calls.filter((call: any[]) =>
          call[0]?.includes("/api/budgets/seed")
        );
        expect(budgetCalls.length).toBe(1);
      });
    });
  });
});
