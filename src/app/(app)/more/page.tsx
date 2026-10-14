import type { Metadata } from "next";
import { MoreMenu } from "@/components/more-menu";
import { ColumnShell } from "@/components/mobile/column-nav";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  const instanceAdminEnabled = isInstanceAdminEnabled();
  const categoriesMerged = isCategoriesMergedEnabled();
  return (
    <ColumnShell instanceAdminEnabled={instanceAdminEnabled} categoriesMerged={categoriesMerged}>
      <MoreMenu instanceAdminEnabled={instanceAdminEnabled} categoriesMerged={categoriesMerged} />
    </ColumnShell>
  );
}
