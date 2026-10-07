import type { Metadata } from "next";
import { MoreMenu } from "@/components/more-menu";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  const instanceAdminEnabled = isInstanceAdminEnabled();
  const categoriesMerged = isCategoriesMergedEnabled();
  return <MoreMenu instanceAdminEnabled={instanceAdminEnabled} categoriesMerged={categoriesMerged} />;
}
