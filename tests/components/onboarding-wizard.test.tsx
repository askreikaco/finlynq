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
  useSearchParams: () => new URLSearchParams(),
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

  describe("Skip setup button", () => {
    it("renders Skip setup button on welcome step", () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      expect(screen.getByText("Skip setup")).toBeInTheDocument();
    });

    it("renders Skip setup button on budget step", async () => {
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

      expect(screen.getByText("Skip setup")).toBeInTheDocument();
    });

    it("does not show Skip setup on done step", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // Navigate to done step by clicking through
      let continueButton = screen.getByText("Continue");
      for (let i = 0; i < 6; i++) {
        fireEvent.click(continueButton);
        await waitFor(() => {
          const buttons = screen.getAllByText("Continue");
          continueButton = buttons[0];
        }, { timeout: 100 }).catch(() => {
          // Might not have more Continue buttons
        });
      }

      // Try to find Skip setup - should not exist on done step
      const skipButtons = screen.queryAllByText("Skip setup");
      expect(skipButtons.length).toBe(0);
    });
  });

  describe("Skip confirmation dialog", () => {
    it("shows confirmation dialog when Skip setup is clicked", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });
    });

    it("closes dialog when Keep going is clicked", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });

      const keepGoingButton = screen.getByText("Keep going");
      fireEvent.click(keepGoingButton);

      await waitFor(() => {
        expect(screen.queryByText("Skip setup?")).not.toBeInTheDocument();
      });

      // Verify no POST was made
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completeCalls = fetchMock.mock.calls.filter((call: any[]) =>
        call[0]?.includes("/api/onboarding/complete")
      );
      expect(completeCalls.length).toBe(0);
    });

    it("POSTs /api/onboarding/complete and calls onComplete when Skip is confirmed", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });

      const skipConfirmButton = screen.getByText("Skip");
      fireEvent.click(skipConfirmButton);

      await waitFor(() => {
        // Verify onComplete was called
        expect(onComplete).toHaveBeenCalled();
      });

      // Verify the POST was made
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completeCalls = fetchMock.mock.calls.filter((call: any[]) =>
        call[0]?.includes("/api/onboarding/complete") && call[1]?.method === "POST"
      );
      expect(completeCalls.length).toBeGreaterThan(0);
    });

    it("does not create accounts or budgets when skipping", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      // First select an account and add some budget amounts
      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });

      const skipConfirmButton = screen.getByText("Skip");
      fireEvent.click(skipConfirmButton);

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      // Verify no account creation calls were made
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountCalls = fetchMock.mock.calls.filter((call: any[]) =>
        call[0]?.includes("/api/accounts") && call[1]?.method === "POST"
      );
      expect(accountCalls.length).toBe(0);

      // Verify no budget seed calls were made
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const budgetCalls = fetchMock.mock.calls.filter((call: any[]) =>
        call[0]?.includes("/api/budgets/seed")
      );
      expect(budgetCalls.length).toBe(0);

      // Verify no sample data calls were made
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sampleDataCalls = fetchMock.mock.calls.filter((call: any[]) =>
        call[0]?.includes("/api/onboarding/sample-data")
      );
      expect(sampleDataCalls.length).toBe(0);
    });
  });

  describe("Mutation tests", () => {
    it("fails if POST /api/onboarding/complete throws", async () => {
      // Create a mock that throws when calling the complete endpoint
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const limitedFetchMock: any = vi.fn((url: any) => {
        if (url?.includes("/api/onboarding/complete")) {
          // Simulate a network error
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).fetch = limitedFetchMock;

      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });

      const skipConfirmButton = screen.getByText("Skip");
      fireEvent.click(skipConfirmButton);

      // Should see an error message
      await waitFor(() => {
        expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
      });
    });

    it("does not close wizard if Skip is clicked without confirmation", async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          userEmail="test@example.com"
          onComplete={onComplete}
        />
      );

      const skipButton = screen.getByText("Skip setup");
      fireEvent.click(skipButton);

      await waitFor(() => {
        expect(screen.getByText("Skip setup?")).toBeInTheDocument();
      });

      // Click Keep going to dismiss dialog without confirming
      const keepGoingButton = screen.getByText("Keep going");
      fireEvent.click(keepGoingButton);

      await waitFor(() => {
        expect(screen.queryByText("Skip setup?")).not.toBeInTheDocument();
      });

      // Verify onComplete was NOT called
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
