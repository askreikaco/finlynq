/**
 * @vitest-environment jsdom
 * Tests for GoogleUnlockForm component
 * - Form renders with masked email and prompt
 * - Password input and submit button work
 * - Button disabled when password empty
 */

import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GoogleUnlockForm } from "@/components/auth/google-unlock-form";
import { googleUIStrings } from "@/lib/ui/google-ui";

describe("GoogleUnlockForm", () => {
  it("renders form with heading", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    expect(screen.getByText(googleUIStrings.unlockHeading)).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    expect(screen.getByText(googleUIStrings.unlockDescription)).toBeInTheDocument();
  });

  it("renders masked email in prompt", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    expect(screen.getByText(/u\*{3}@example\.com/)).toBeInTheDocument();
  });

  it("renders password input field", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    const input = screen.getByPlaceholderText("Enter your password");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "password");
  });

  it("renders submit button with label", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    expect(screen.getByText(googleUIStrings.unlockButtonLabel)).toBeInTheDocument();
  });

  it("disables submit button when password is empty", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    const button = screen.getByText(googleUIStrings.unlockButtonLabel) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables submit button when password is entered", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    const input = screen.getByPlaceholderText("Enter your password") as HTMLInputElement;
    const button = screen.getByText(googleUIStrings.unlockButtonLabel) as HTMLButtonElement;

    fireEvent.change(input, { target: { value: "password" } });

    expect(button.disabled).toBe(false);
  });

  it("is a form element with submit type", () => {
    render(<GoogleUnlockForm email="user@example.com" />);
    const form = screen.getByText(googleUIStrings.unlockHeading).closest("form");
    expect(form).toBeInTheDocument();
    expect(form?.tagName).toBe("FORM");
  });

  it("renders with different email addresses", () => {
    render(<GoogleUnlockForm email="alice@domain.co.uk" />);
    expect(screen.getByText(/a\*{4}@domain\.co\.uk/)).toBeInTheDocument();
  });
});
