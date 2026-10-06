import type { Metadata } from "next";
import { MoreMenu } from "@/components/more-menu";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  const instanceAdminEnabled = isInstanceAdminEnabled();
  return <MoreMenu instanceAdminEnabled={instanceAdminEnabled} />;
}
