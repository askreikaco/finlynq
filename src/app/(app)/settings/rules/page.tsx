"use client";

/**
 * /settings/rules — Redirect to Reconciliation with rules section open.
 *
 * This page now renders the Reconciliation page with the rules accordion
 * section open. Users visiting this old URL will see the content they expect
 * with the settings nav highlighting Reconciliation.
 */

import ReconciliationPage from "@/app/(app)/settings/reconciliation/page";

export default function RulesRedirectPage() {
  return <ReconciliationPage initialSection="rules" />;
}
