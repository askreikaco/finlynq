"use client";

/**
 * /settings shared layout — the left-nav shell lives in
 * src/components/settings-shell.tsx so /connect can render it too.
 */

import { SettingsShell } from "@/components/settings-shell";
import { isNavV2Enabled } from "@/lib/nav-v2/flag";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsShell hubBackHref={isNavV2Enabled() ? "/settings" : undefined}>
      {children}
    </SettingsShell>
  );
}
