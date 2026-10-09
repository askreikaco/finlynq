/**
 * @vitest-environment jsdom
 */
// Edit account is a full page at /accounts/[id]/edit (it used to be AccountDialog).
// Covers: tabs via ?tab=, save parity with the old dialog payload, validated returnTo,
// archive / unarchive / delete from the overflow menu (confirm stays a dialog), and the
// Cash sleeves tab's hand-off to the account page.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(H.search),
  usePathname: () => "/accounts/7/edit",
}));
vi.mock("@/components/inbox/mode-picker", () => ({ ModePicker: () => <div>Mode picker</div> }));
vi.mock("@/components/inbox/import-prefs-picker", () => ({
  ImportPrefsPicker: () => <div>Import prefs picker</div>,
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["VND", "USD"] }));

import EditAccountRoute from "@/app/(app)/accounts/[id]/edit/page";

const account = {
  id: 7,
  name: "Techcombank",
  type: "A",
  group: "Banks",
  currency: "VND",
  alias: "TC1",
  note: "Main",
  archived: false,
  invisible: false,
  isInvestment: true,
  mode: "manual",
};

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let listAccount: typeof account & { archived: boolean } = { ...account };
let deleteStatus = 200;
let putError: string | null = null;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  H.search = "";
  H.push.mockReset();
  listAccount = { ...account };
  deleteStatus = 200;
  putError = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/accounts?includeArchived=1") return json([listAccount]);
      if (url === "/api/accounts?id=7" && init?.method === "DELETE") {
        return json(deleteStatus === 200 ? { ok: true } : { error: "Still linked" }, deleteStatus);
      }
      if (url === "/api/accounts" && init?.method === "PUT") {
        if (putError) return json({ error: putError }, 409);
        const body = JSON.parse(String(init.body));
        return json({ ...listAccount, ...body, name: body.name ?? listAccount.name });
      }
      if (url === "/api/portfolio") return json([]);
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string, url: string) =>
  calls.filter((c) => c.url === url && (c.init?.method ?? "GET") === method);

async function openMoreMenu() {
  await screen.findByRole("heading", { level: 1, name: "Edit account" });
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
}

describe("Edit account page: fields and tabs", () => {
  it("renders the page heading, the prefilled form and the Save button", async () => {
    render(<EditAccountRoute />);
    expect(await screen.findByRole("heading", { level: 1, name: "Edit account" })).toBeTruthy();
    expect((screen.getByLabelText("Account Name") as HTMLInputElement).value).toBe("Techcombank");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/accounts/7");
  });

  it("offers the Details, Reconciliation, Import and Cash sleeves tabs", async () => {
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    for (const name of ["Details", "Reconciliation", "Import", "Cash sleeves"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("?tab= opens that tab", async () => {
    H.search = "tab=import";
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    expect(screen.getByRole("tab", { name: "Import" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Import prefs picker")).toBeTruthy();
  });

  it("an unknown ?tab= falls back to Details", async () => {
    H.search = "tab=bogus";
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");
  });

  it("Cash sleeves: Add sleeve hands off to the account page's create dialog", async () => {
    H.search = "tab=sleeves";
    render(<EditAccountRoute />);
    fireEvent.click(await screen.findByRole("button", { name: /Add sleeve/ }));
    expect(H.push).toHaveBeenCalledWith("/accounts/7?addSleeve=1");
  });

  it("shows a not-found message for an id that is not in the list", async () => {
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    cleanup();
    listAccount = { ...account, id: 99 };
    render(<EditAccountRoute />);
    expect(await screen.findByText("Account not found.")).toBeTruthy();
  });
});

describe("Edit account page: validation and save", () => {
  it("blocks submit and shows an error when the name is empty", async () => {
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(callsTo("PUT", "/api/accounts")).toHaveLength(0);
  });

  it("PUTs the same payload as the old dialog, then returns to the account", async () => {
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    fireEvent.change(screen.getByLabelText("Account Name"), { target: { value: "Techcombank 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts/7"));
    const put = callsTo("PUT", "/api/accounts");
    expect(put).toHaveLength(1);
    expect(JSON.parse(String(put[0].init?.body))).toEqual({
      id: 7,
      name: "Techcombank 2",
      type: "A",
      group: "Banks",
      currency: "VND",
      note: "Main",
      alias: "TC1",
      isInvestment: true,
      invisible: false,
    });
  });

  it("shows the server error and stays on the page when the PUT fails", async () => {
    putError = "Name taken";
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("Edit account page: returnTo", () => {
  it("uses a same-app returnTo for Back, Cancel and success", async () => {
    H.search = "returnTo=/portfolio";
    render(<EditAccountRoute />);
    await screen.findByRole("heading", { level: 1, name: "Edit account" });
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/portfolio");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.push).toHaveBeenLastCalledWith("/portfolio");
    H.push.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/portfolio"));
    expect(H.push).not.toHaveBeenCalledWith("/accounts/7");
  });

  it.each(["//evil.example/x", "https://evil.example/x", "javascript:alert(1)"])(
    "rejects an unsafe returnTo (%s): Back and success go to the account",
    async (bad) => {
      H.search = "returnTo=" + encodeURIComponent(bad);
      render(<EditAccountRoute />);
      await screen.findByRole("heading", { level: 1, name: "Edit account" });
      expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/accounts/7");
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts/7"));
      expect(H.push).not.toHaveBeenCalledWith(bad);
    },
  );
});

describe("Edit account page: archive / unarchive / delete", () => {
  it("Archive or delete asks in a dialog, then DELETEs and leaves for the list", async () => {
    render(<EditAccountRoute />);
    await openMoreMenu();
    fireEvent.click(await screen.findByText("Archive or delete account"));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(callsTo("DELETE", "/api/accounts?id=7")).toHaveLength(1));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts"));
  });

  it("a referenced account (409) is archived instead", async () => {
    deleteStatus = 409;
    render(<EditAccountRoute />);
    await openMoreMenu();
    fireEvent.click(await screen.findByText("Archive or delete account"));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => {
      const put = callsTo("PUT", "/api/accounts");
      expect(put.length).toBeGreaterThan(0);
      expect(JSON.parse(String(put[0].init?.body))).toEqual({ id: 7, archived: true });
    });
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts"));
  });

  it("an archived account offers Unarchive (PUT archived:false) and returns to the account", async () => {
    listAccount = { ...account, archived: true };
    render(<EditAccountRoute />);
    await openMoreMenu();
    fireEvent.click(await screen.findByText("Unarchive"));
    await waitFor(() => {
      const put = callsTo("PUT", "/api/accounts");
      expect(JSON.parse(String(put[0].init?.body))).toEqual({ id: 7, archived: false });
    });
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/accounts/7"));
  });
});
