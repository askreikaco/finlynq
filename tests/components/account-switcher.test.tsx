/**
 * @vitest-environment jsdom
 * Multi-account B3 UI: account switcher menu in sidebar (desktop+mobile).
 * Tests: list accounts, switch with hardReload, 409 needs_login flow, add account,
 * sign out (this/all), locked account indicator, a11y attributes.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hardReload = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/client/hard-reload", async (orig) => {
  const real = await orig<typeof import("@/lib/client/hard-reload")>();
  return { ...real, hardReload: (...a: unknown[]) => hardReload(...a) };
});

import { AccountSwitcher, type Account } from "@/components/account-switcher";

type MockResponse = { ok: boolean; status: number; data: unknown };
let mockResponses: Record<string, MockResponse> = {};

beforeEach(() => {
  cleanup();
  hardReload.mockClear();
  mockResponses = {};

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const fullKey = `${method} ${url}`;

    const mock = mockResponses[fullKey] || mockResponses[url];

    if (mock) {
      return {
        ok: mock.ok,
        status: mock.status,
        json: async () => mock.data,
      } as Response;
    }

    // Default responses
    if (url === "/api/auth/accounts") {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as Response;
    }

    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountSwitcher", () => {
  it("fetches and lists accounts from /api/auth/accounts", async () => {
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        isAdmin: false,
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "switchable",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    // Bob is only in the inactive section of the menu; open it
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("switch posts userId and calls hardReload", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "switchable",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };
    mockResponses["POST /api/auth/switch"] = {
      ok: true,
      status: 200,
      data: { status: "switched" },
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const switchBtn = screen.getByText("Bob").closest("button");
    if (switchBtn) await user.click(switchBtn);

    await waitFor(() => {
      expect(hardReload).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("409 needs_login navigates to /cloud?add=1&email=", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "locked",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };
    mockResponses["POST /api/auth/switch"] = {
      ok: false,
      status: 409,
      data: { status: "needs_login", email: "bob@example.com", hasPassword: true },
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const switchBtn = screen.getByText("Bob").closest("button");
    if (switchBtn) await user.click(switchBtn);

    await waitFor(() => {
      expect(hardReload).toHaveBeenCalledWith("/cloud?add=1&email=bob%40example.com");
    });
  });

  it("add account posts to add-intent and hardReloads to /cloud?add=1", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };
    mockResponses["POST /api/auth/add-intent"] = {
      ok: true,
      status: 200,
      data: {},
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const addBtn = screen.getByText("Add another account");
    await user.click(addBtn);

    await waitFor(() => {
      expect(hardReload).toHaveBeenCalledWith("/cloud?add=1");
    });
  });

  it("sign out posts to logout and hardReloads to /", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };
    mockResponses["POST /api/auth/logout"] = {
      ok: true,
      status: 200,
      data: {},
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const signOutBtn = screen.getByText("Sign out of this account");
    await user.click(signOutBtn);

    await waitFor(() => {
      expect(hardReload).toHaveBeenCalledWith("/");
    });
  });

  it("sign out all posts to logout?all=1 and hardReloads to /", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "switchable",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };
    mockResponses["POST /api/auth/logout?all=1"] = {
      ok: true,
      status: 200,
      data: {},
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const signOutAllBtn = screen.getByText("Sign out of all accounts");
    await user.click(signOutAllBtn);

    await waitFor(() => {
      expect(hardReload).toHaveBeenCalledWith("/");
    });
  });

  it("locked account shows 'Sign in again' indicator", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "locked",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    expect(screen.getByText("Sign in again")).toBeInTheDocument();
  });

  it("account cap shows max 5 message when disabled", async () => {
    const user = userEvent.setup();
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
      {
        userId: "u2",
        email: "bob@example.com",
        displayName: "Bob",
        active: false,
        status: "switchable",
      },
      {
        userId: "u3",
        email: "charlie@example.com",
        displayName: "Charlie",
        active: false,
        status: "switchable",
      },
      {
        userId: "u4",
        email: "diana@example.com",
        displayName: "Diana",
        active: false,
        status: "switchable",
      },
      {
        userId: "u5",
        email: "eve@example.com",
        displayName: "Eve",
        active: false,
        status: "switchable",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Eve")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.click(trigger);

    const addBtn = screen.getByText(/Add another account/).closest("button");
    expect(addBtn).toBeDisabled();
    expect(screen.getByText(/max 5/)).toBeInTheDocument();
  });

  it("renders avatar initials from display name", async () => {
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice Smith",
        active: true,
        status: "active",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("AS")).toBeInTheDocument();
    });
  });

  it("has accessible menu attributes", async () => {
    const mockAccounts: Account[] = [
      {
        userId: "u1",
        email: "alice@example.com",
        displayName: "Alice",
        active: true,
        status: "active",
      },
    ];
    mockResponses["/api/auth/accounts"] = {
      ok: true,
      status: 200,
      data: mockAccounts,
    };

    render(<AccountSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveAttribute("aria-label", "Account menu");

    expect(trigger).toBeInTheDocument();
  });
});
