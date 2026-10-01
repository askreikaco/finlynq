"use client";

/**
 * /settings/import — Redirect to Reconciliation with import section open.
 *
 * This page now renders the Reconciliation page with the import accordion
 * section open. Users visiting this old URL will see the content they expect
 * with the settings nav highlighting Reconciliation.
 *
 * Deep-link support: /settings/import?tab=email, /settings/import?provider=…
 * must keep working. These are passed through URL search params to the parent.
 */

import { useSearchParams } from "next/navigation";
import ReconciliationPage from "@/app/(app)/settings/reconciliation/page";

export default function ImportRedirectPage() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  return <ReconciliationPage initialSection="import" queryString={queryString} />;
}
