"use client";

/** Client twin of src/app/(app)/more/page.tsx (server wrapper): flags come from /api/config/flags. */
import { MoreMenu } from "@/components/more-menu";
import { ColumnShell } from "@/components/mobile/column-nav";
import { useFlags } from "../flags";

export const metadata = { title: "More" };

export default function MorePage() {
  const { instanceAdmin, categoriesMerged } = useFlags();
  return (
    <ColumnShell instanceAdminEnabled={instanceAdmin} categoriesMerged={categoriesMerged}>
      <MoreMenu instanceAdminEnabled={instanceAdmin} categoriesMerged={categoriesMerged} />
    </ColumnShell>
  );
}
