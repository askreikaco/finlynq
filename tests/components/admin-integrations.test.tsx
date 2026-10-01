/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/(app)/admin/(env)/integrations/page";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

const STATUS = {
  provider: "brevo",
  from: { name: "Acme", address: "noreply@acme.test" },
  configured: { brevo: true, resend: false, smtp: true },
  sources: {
    provider: "none", from: "env", brevoApiKey: "db", resendApiKey: "none",
    smtpHost: "env", smtpPort: "none", smtpUser: "none", smtpPass: "env",
  },
  values: { provider: "auto", from: "Acme <noreply@acme.test>", smtpHost: "smtp.acme.test", smtpPort: null },
  stepUp: "password",
  canRevert: false,
};

let calls: Call[];
let status: typeof STATUS;
let handlers: Record<string, () => Response>;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const h = handlers[`${method} ${url}`];
    if (h) return h();
    if (method === "GET" && url === "/api/admin/integrations/email") return Response.json(status);
    throw new Error(`unexpected fetch ${method} ${url}`);
  }));
}

beforeEach(() => {
  status = structuredClone(STATUS);
  handlers = {};
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin Integrations page", () => {
  it("renders status: provider, from, configured providers, saved hints", async () => {
    render(<Page />);
    expect(await screen.findByText("Email Transport Status")).toBeTruthy();
    expect(screen.getAllByText("Brevo").length).toBeGreaterThan(0);
    expect(screen.getByText(/Acme\s*<noreply@acme.test>/)).toBeTruthy();
    expect(screen.getByLabelText("Brevo configured")).toBeTruthy();
    expect(screen.getByLabelText("Resend not configured")).toBeTruthy();
    expect(screen.getByText("Saved ✓ (database)")).toBeTruthy(); // brevo key
    expect(screen.getByText("Saved ✓ (environment)")).toBeTruthy(); // smtp pass
    // secrets are never prefilled
    for (const l of ["Brevo API key", "Resend API key", "SMTP user", "SMTP password"]) {
      expect((screen.getByLabelText(l) as HTMLInputElement).value).toBe("");
    }
    expect((screen.getByLabelText("SMTP host") as HTMLInputElement).value).toBe("smtp.acme.test");
  });

  it("shows an error when status fails to load", async () => {
    handlers["GET /api/admin/integrations/email"] = () => Response.json({ error: "Admin access required." }, { status: 403 });
    render(<Page />);
    expect(await screen.findByText("Admin access required.")).toBeTruthy();
  });

  it("test send POSTs exactly {to}", async () => {
    handlers["POST /api/admin/integrations/email"] = () => Response.json({ ok: true, provider: "brevo" });
    const user = userEvent.setup();
    render(<Page />);
    await user.type(await screen.findByLabelText("To"), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Test email sent successfully");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/admin/integrations/email");
    expect(post.body).toEqual({ to: "me@example.com" });
  });

  it("test send shows the (sanitized) server error", async () => {
    handlers["POST /api/admin/integrations/email"] = () => Response.json({ ok: false, error: "Send failed (401)" }, { status: 502 });
    const user = userEvent.setup();
    render(<Page />);
    await user.type(await screen.findByLabelText("To"), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Send failed (401)");
  });

  it("settings form sends ONLY changed fields (+ step-up), nothing else", async () => {
    handlers["PUT /api/admin/integrations/email/settings"] = () =>
      Response.json({ fields: {}, canRevert: true });
    const user = userEvent.setup();
    render(<Page />);
    await user.type(await screen.findByLabelText("Resend API key"), "re_newkey");
    await user.clear(screen.getByLabelText("SMTP host"));
    await user.type(screen.getByLabelText("SMTP host"), "mail.acme.test");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.type(screen.getByLabelText(/password/i, { selector: "#email-step-up" }), "pw-1234");
    await user.click(screen.getByRole("button", { name: "Confirm save" }));
    await screen.findByText("Settings saved");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ resendApiKey: "re_newkey", smtpHost: "mail.acme.test", password: "pw-1234" });
  });

  it("Clear sends null for that secret only; an untouched secret is omitted", async () => {
    handlers["PUT /api/admin/integrations/email/settings"] = () => Response.json({ fields: {}, canRevert: true });
    const user = userEvent.setup();
    render(<Page />);
    await user.click(await screen.findByRole("button", { name: "Clear Brevo API key" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.type(document.querySelector("#email-step-up")!, "pw");
    await user.click(screen.getByRole("button", { name: "Confirm save" }));
    await screen.findByText("Settings saved");
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ brevoApiKey: null, password: "pw" });
  });

  it("MFA admins are asked for the authenticator code and it is sent as mfaCode", async () => {
    status.stepUp = "mfa";
    handlers["PUT /api/admin/integrations/email/settings"] = () => Response.json({ fields: {}, canRevert: true });
    const user = userEvent.setup();
    render(<Page />);
    await user.selectOptions(await screen.findByLabelText("Provider"), "resend");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/6-digit authenticator code/)).toBeTruthy();
    await user.type(document.querySelector("#email-step-up")!, "123456");
    await user.click(screen.getByRole("button", { name: "Confirm save" }));
    await screen.findByText("Settings saved");
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ provider: "resend", mfaCode: "123456" });
  });

  it("Save & send test adds testTo, shows the result, then offers Revert which POSTs the step-up", async () => {
    handlers["PUT /api/admin/integrations/email/settings"] = () => {
      status.canRevert = true;
      return Response.json({ fields: {}, canRevert: true, test: { ok: true, provider: "resend" } });
    };
    handlers["POST /api/admin/integrations/email/settings/revert"] = () => {
      status.canRevert = false;
      return Response.json({ fields: {}, canRevert: false });
    };
    const user = userEvent.setup();
    render(<Page />);
    await user.type(await screen.findByLabelText("Resend API key"), "re_newkey");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.type(document.querySelector("#email-step-up")!, "pw");
    await user.type(screen.getByLabelText("Send test to (optional)"), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Save & send test" }));
    await screen.findByText("Test email sent via Resend");
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ resendApiKey: "re_newkey", password: "pw", testTo: "me@example.com" });
    // secret input is emptied after save
    expect((screen.getByLabelText("Resend API key") as HTMLInputElement).value).toBe("");

    await user.click(await screen.findByRole("button", { name: "Revert" }));
    await user.type(document.querySelector("#email-step-up")!, "pw");
    await user.click(screen.getByRole("button", { name: "Confirm revert" }));
    await screen.findByText("Reverted to the previous settings");
    const rev = calls.find((c) => c.url.endsWith("/revert"))!;
    expect(rev.method).toBe("POST");
    expect(rev.body).toEqual({ password: "pw" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Revert" })).toBeNull());
  });

  it("does not call the API when nothing changed", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await user.type(document.querySelector("#email-step-up")!, "pw");
    await user.click(screen.getByRole("button", { name: "Confirm save" }));
    await screen.findByText("No changes to save");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("surfaces a failed save (e.g. wrong step-up) and keeps the form", async () => {
    handlers["PUT /api/admin/integrations/email/settings"] = () => Response.json({ error: "Password is incorrect." }, { status: 401 });
    const user = userEvent.setup();
    render(<Page />);
    await user.type(await screen.findByLabelText("Resend API key"), "re_newkey");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.type(document.querySelector("#email-step-up")!, "bad");
    await user.click(screen.getByRole("button", { name: "Confirm save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Password is incorrect.");
    expect((screen.getByLabelText("Resend API key") as HTMLInputElement).value).toBe("re_newkey");
  });
});
