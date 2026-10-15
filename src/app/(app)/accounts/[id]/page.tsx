"use client";

import { useParams } from "next/navigation";
import { AccountDetail } from "../_components/account-detail";

/** /accounts/[id]: the account detail page. The content is AccountDetail, shared with the /accounts split-view pane. */
export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AccountDetail id={id} />;
}
