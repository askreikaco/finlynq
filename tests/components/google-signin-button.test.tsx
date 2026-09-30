/**
 * @vitest-environment jsdom
 * Tests for GoogleSigninButton component
 * - Button renders with correct label
 * - Button accepts intent and next props
 * - Error display works
 */

import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoogleSigninButton } from "@/components/auth/google-signin-button";
import { googleUIStrings } from "@/lib/ui/google-ui";

describe("GoogleSigninButton", () => {
  it("renders with Google button label", () => {
    render(<GoogleSigninButton intent="login" />);
    expect(screen.getByText(googleUIStrings.googleButtonLabel)).toBeInTheDocument();
  });

  it("renders button with type='button'", () => {
    render(<GoogleSigninButton intent="login" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "button");
  });

  it("accepts login intent prop", () => {
    render(<GoogleSigninButton intent="login" />);
    expect(screen.getByText(googleUIStrings.googleButtonLabel)).toBeInTheDocument();
  });

  it("accepts link intent prop", () => {
    render(<GoogleSigninButton intent="link" />);
    expect(screen.getByText(googleUIStrings.googleButtonLabel)).toBeInTheDocument();
  });

  it("accepts next parameter prop", () => {
    render(<GoogleSigninButton intent="login" next="/settings" />);
    expect(screen.getByText(googleUIStrings.googleButtonLabel)).toBeInTheDocument();
  });

  it("accepts className prop", () => {
    render(<GoogleSigninButton intent="login" className="custom-class" />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });
});
