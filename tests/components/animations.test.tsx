/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import {
  AnimationProvider,
  useAnimations,
  useAnimationPreference,
  ANIMATIONS_STORAGE_KEY,
} from "@/components/animation-provider";

function AnimationConsumer() {
  const animationsEnabled = useAnimations();
  const { setAnimationsEnabled } = useAnimationPreference();
  return (
    <div>
      <span data-testid="status">{animationsEnabled ? "enabled" : "disabled"}</span>
      <button
        data-testid="toggle-on"
        onClick={() => setAnimationsEnabled(true)}
      >
        Enable
      </button>
      <button
        data-testid="toggle-off"
        onClick={() => setAnimationsEnabled(false)}
      >
        Disable
      </button>
    </div>
  );
}

describe("Animation preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to false / disabled", () => {
    render(
      <AnimationProvider>
        <AnimationConsumer />
      </AnimationProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("disabled");
  });

  it("toggling updates state and persists in localStorage", () => {
    render(
      <AnimationProvider>
        <AnimationConsumer />
      </AnimationProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("disabled");

    // Enable animations
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-on"));
    });

    expect(screen.getByTestId("status").textContent).toBe("enabled");
    expect(localStorage.getItem(ANIMATIONS_STORAGE_KEY)).toBe("true");

    // Disable animations
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-off"));
    });

    expect(screen.getByTestId("status").textContent).toBe("disabled");
  });

  it("loads true if previously saved in localStorage", () => {
    localStorage.setItem(ANIMATIONS_STORAGE_KEY, "true");

    render(
      <AnimationProvider>
        <AnimationConsumer />
      </AnimationProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("enabled");
  });

  it("works outside provider with safe fallback", () => {
    function Standalone() {
      const enabled = useAnimations();
      return <span data-testid="standalone-status">{enabled ? "on" : "off"}</span>;
    }

    render(<Standalone />);
    expect(screen.getByTestId("standalone-status").textContent).toBe("off");
  });
});
