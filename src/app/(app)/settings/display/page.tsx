"use client";

/**
 * /settings/display — Redirect to General with display section open.
 *
 * This page now renders the General page, which shows the Dropdown Ordering
 * link as a row. Users visiting this old URL will see the content they expect
 * with the settings nav highlighting General.
 */

import GeneralPage from "@/app/(app)/settings/general/page";

export default function DisplayRedirectPage() {
  return <GeneralPage />;
}
