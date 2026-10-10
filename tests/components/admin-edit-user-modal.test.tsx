/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditUserModal } from "@/components/admin/edit-user-modal";

const user = {
  id: "user-1", username: "testuser", email: "test@example.com", displayName: "Test User",
  role: "user", emailVerified: 1, mfaEnabled: 0, plan: "free", planExpiresAt: null,
};

function setup(over: Partial<typeof user> = {}, onSave = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  render(<EditUserModal user={{ ...user, ...over }} open onOpenChange={onOpenChange} onSave={onSave} />);
  return { onSave, onOpenChange };
}
const save = () => fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

describe("EditUserModal", () => {
  it("is an accessible dialog with a title, description and labelled fields", () => {
    setup();
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAccessibleName(/edit user/i);
    expect(dlg).toHaveAccessibleDescription();
    for (const l of [/display name/i, /username/i, /^email$/i, /plan expires at/i]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
    expect(screen.getByRole("switch", { name: /email verified/i })).toBeInTheDocument();
  });

  it("changing only the display name sends ONLY {displayName}", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "New Name" } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ displayName: "New Name" });
  });

  it("untouched form sends nothing and shows 'No changes'", async () => {
    const { onSave } = setup();
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no changes/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("null displayName/email/plan-expiry are not reported as changes", async () => {
    const { onSave } = setup({ displayName: null, email: null } as never);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "other" } });
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ username: "other" });
  });

  it("changing email + verified sends exactly those two keys", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("switch", { name: /email verified/i }));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ email: "new@example.com", emailVerified: false });
  });

  it("Reset 2FA is only offered when the user has 2FA, and sends disableMfa", async () => {
    const { onSave } = setup({ mfaEnabled: 1 });
    fireEvent.click(screen.getByRole("button", { name: /reset 2fa/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ disableMfa: true }));
  });

  it("no Reset 2FA button when 2FA is off", () => {
    setup({ mfaEnabled: 0 });
    expect(screen.queryByRole("button", { name: /reset 2fa/i })).not.toBeInTheDocument();
  });

  it("MFA_REQUIRED from the server reveals the code field; resubmit includes mfaCode", async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("MFA code required"), { code: "MFA_REQUIRED" }))
      .mockResolvedValue(undefined);
    setup({ mfaEnabled: 1 }, onSave);
    fireEvent.click(screen.getByRole("button", { name: /reset 2fa/i }));
    const input = await screen.findByLabelText(/authenticator code/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/mfa code required/i);
    fireEvent.change(input, { target: { value: "12a3456" } });
    expect(input).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: /reset 2fa/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ disableMfa: true, mfaCode: "123456" });
  });

  it("server error (409) is shown inline in a role=alert and the dialog stays open", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Email already taken."));
    const { onOpenChange } = setup({}, onSave);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "x" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Email already taken.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("successful save closes the dialog", async () => {
    const { onOpenChange } = setup();
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "x" } });
    save();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
