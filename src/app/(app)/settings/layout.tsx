/**
 * /settings shared layout: the cascading columns (ColumnShell: More | Settings hub | page at wide) around the detail-bar
 * shell in src/components/settings-shell.tsx, so /connect can render the shell too. SPA twin: src/spa/pages/settings/layout.tsx.
 */

import { SettingsShell } from "@/components/settings-shell";
import { ColumnShell } from "@/components/mobile/column-nav";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ColumnShell instanceAdminEnabled={isInstanceAdminEnabled()} categoriesMerged={isCategoriesMergedEnabled()}>
      <SettingsShell>{children}</SettingsShell>
    </ColumnShell>
  );
}
