/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";

// Mock the PageHeader component (heading level 1 so it can be found by role)
vi.mock("@/components/mobile", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// Each Card renders as a <section> so a row can be scoped to its own section.
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

// Badges are tagged so each one can be counted and read per row.
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="source-badge">{children}</span>
  ),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

import InstanceAdminPage from "@/app/(app)/admin/instance/page";

// Every row gets its own displayValue and a RAW- value that must never render.
// Sources are deliberately mixed so a swap between any two rows is visible:
// env: clientId, clientSecret, email.enabled
// db: google.enabled, captcha.enabled
// default: passkey.enabled, registration.allowOpen
const mockConfig = {
  google: {
    clientId: { displayValue: "gid-display", value: "RAW-google-clientId", source: "env" as const },
    clientSecret: { displayValue: "***", value: "RAW-google-secret", source: "env" as const },
    enabled: { displayValue: "google-on-display", value: "RAW-google-enabled", source: "db" as const },
  },
  passkey: {
    enabled: { displayValue: "passkey-display", value: "RAW-passkey-enabled", source: "default" as const },
  },
  registration: {
    allowOpen: { displayValue: "registration-display", value: "RAW-registration-allow", source: "default" as const },
  },
  email: {
    enabled: { displayValue: "email-display", value: "RAW-email-enabled", source: "env" as const },
  },
  captcha: {
    enabled: { displayValue: "captcha-display", value: "RAW-captcha-enabled", source: "db" as const },
  },
};

// [section title, description, [row label, displayValue, badge text][]]
const EXPECTED: Array<[string, string, Array<[string, string, string]>]> = [
  [
    "Google OAuth",
    "Third-party OIDC provider for sign-in",
    [
      ["Client ID", "gid-display", "Environment"],
      ["Client Secret", "***", "Environment"],
      ["Enabled", "google-on-display", "Database"],
    ],
  ],
  [
    "Passkey (WebAuthn)",
    "Native security key and biometric sign-in",
    [["Enabled", "passkey-display", "Default"]],
  ],
  ["Registration", "Sign-up configuration", [["Allow open sign-up", "registration-display", "Default"]]],
  ["Email", "Outbound email integration", [["Enabled", "email-display", "Environment"]]],
  ["CAPTCHA", "Bot protection on forms", [["Enabled", "captcha-display", "Database"]]],
];

function mockOk(config: unknown = mockConfig) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => config });
}

async function renderLoaded() {
  mockOk();
  render(<InstanceAdminPage />);
  await screen.findByRole("heading", { name: "Google OAuth" });
}

function getSection(title: string): HTMLElement {
  const section = screen.getByRole("heading", { name: title }).closest("section");
  if (!section) throw new Error(`no section for ${title}`);
  return section as HTMLElement;
}

function getRow(section: HTMLElement, label: string): HTMLElement {
  const row = within(section).getByText(label).closest(".border-b");
  if (!row) throw new Error(`no row for ${label}`);
  return row as HTMLElement;
}

describe("InstanceAdminPage", () => {
  it("displays 'Loading configuration...' while fetching and shows no sections", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    render(<InstanceAdminPage />);

    expect(await screen.findByText("Loading configuration...")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Instance config" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Google OAuth" })).toBeNull();
    expect(screen.queryAllByTestId("source-badge")).toHaveLength(0);
  });

  it("renders the 'Instance config' heading and hides the loading text once loaded", async () => {
    await renderLoaded();

    expect(screen.getByRole("heading", { level: 1, name: "Instance config" })).toBeTruthy();
    expect(screen.queryByText("Loading configuration...")).toBeNull();
    expect(screen.queryByText("Error loading configuration")).toBeNull();
  });

  it("renders the five sections in order", async () => {
    await renderLoaded();

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(EXPECTED.map(([title]) => title));
  });

  describe.each(EXPECTED)("section %s", (title, description, rows) => {
    it("shows its description and exactly its own rows and badges", async () => {
      await renderLoaded();
      const section = getSection(title);

      expect(within(section).getByText(description)).toBeTruthy();
      expect(within(section).getAllByTestId("source-badge")).toHaveLength(rows.length);
      expect(section.querySelectorAll(".border-b")).toHaveLength(rows.length);
    });

    it.each(rows)("row %s shows displayValue %s with source badge %s", async (label, display, badge) => {
      await renderLoaded();
      const row = getRow(getSection(title), label);

      // The row's value cell and its own badge, nothing else.
      const valueEl = within(row).getByText(display);
      expect(valueEl.textContent).toBe(display);
      const badges = within(row).getAllByTestId("source-badge");
      expect(badges).toHaveLength(1);
      expect(badges[0].textContent).toBe(badge);
      expect(within(row).getByText(label).textContent).toBe(label);
    });
  });

  it("labels the Google rows Client ID, Client Secret and Enabled, one each", async () => {
    await renderLoaded();
    const google = getSection("Google OAuth");

    expect(within(google).getAllByText("Client ID")).toHaveLength(1);
    expect(within(google).getAllByText("Client Secret")).toHaveLength(1);
    expect(within(google).getAllByText("Enabled")).toHaveLength(1);
    // Client ID row carries the client id value, the secret row the masked value.
    expect(within(getRow(google, "Client ID")).queryByText("***")).toBeNull();
    expect(within(getRow(google, "Client Secret")).queryByText("gid-display")).toBeNull();
  });

  it("renders exact badge counts per source kind across the page", async () => {
    await renderLoaded();

    expect(screen.getAllByTestId("source-badge")).toHaveLength(7);
    expect(screen.getAllByText("Environment")).toHaveLength(3);
    expect(screen.getAllByText("Database")).toHaveLength(2);
    expect(screen.getAllByText("Default")).toHaveLength(2);
  });

  it("never renders raw values (only displayValues)", async () => {
    await renderLoaded();

    const html = document.body.innerHTML;
    expect(html).not.toContain("RAW-");
    for (const raw of [
      "RAW-google-clientId",
      "RAW-google-secret",
      "RAW-google-enabled",
      "RAW-passkey-enabled",
      "RAW-registration-allow",
      "RAW-email-enabled",
      "RAW-captcha-enabled",
    ]) {
      expect(html).not.toContain(raw);
    }
  });

  it("calls fetch with the correct URL", async () => {
    await renderLoaded();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/instance/config");
  });

  it("displays the exact error message on non-OK response and no sections", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: "Internal Server Error" });

    render(<InstanceAdminPage />);

    expect(
      await screen.findByText("Failed to fetch config: Internal Server Error"),
    ).toBeTruthy();
    expect(screen.getByText("Error loading configuration")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("Loading configuration...")).toBeNull();
    });
    expect(screen.queryByRole("heading", { name: "Google OAuth" })).toBeNull();
    expect(screen.queryAllByTestId("source-badge")).toHaveLength(0);
  });

  it("displays the thrown message when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    render(<InstanceAdminPage />);

    expect(await screen.findByText("network down")).toBeTruthy();
    expect(screen.getByText("Error loading configuration")).toBeTruthy();
  });
});
