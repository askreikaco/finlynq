"use client";

/**
 * /settings/bank-feeds — Redirect to Integrations with bank-feeds section open.
 *
 * This page now renders the Integrations page with the bank-feeds accordion
 * section open. Users visiting this old URL will see the content they expect
 * with the settings nav highlighting Integrations.
 */

import IntegrationsPage from "@/app/(app)/settings/integrations/page";

export default function BankFeedsRedirectPage() {
  return <IntegrationsPage initialSection="bank-feeds" />;
}
