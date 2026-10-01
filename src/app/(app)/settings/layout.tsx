"use client";

/**
 * /settings shared layout — the left-nav shell lives in
 * src/components/settings-shell.tsx so /connect can render it too.
 */

import { SettingsShell } from "@/components/settings-shell";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
