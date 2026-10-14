"use client";

/** Client twin of src/app/(app)/settings/layout.tsx (server layout): the env flags come from /api/config/flags. */
import { SettingsShell } from "@/components/settings-shell";
import { ColumnShell } from "@/components/mobile/column-nav";
import { useFlags } from "../../flags";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { instanceAdmin, categoriesMerged } = useFlags();
  return (
    <ColumnShell instanceAdminEnabled={instanceAdmin} categoriesMerged={categoriesMerged}>
      <SettingsShell>{children}</SettingsShell>
    </ColumnShell>
  );
}
