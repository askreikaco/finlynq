import type { Metadata } from "next";
import { ManageAccounts } from "@/components/manage-accounts";

export const metadata: Metadata = { title: "Manage accounts" };

export default function ManageAccountsPage() {
  return <ManageAccounts />;
}
