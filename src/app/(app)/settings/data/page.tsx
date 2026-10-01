"use client";

/**
 * /settings/data — Redirect to Developer with data section open.
 *
 * This page now renders the Developer page with the data accordion
 * section open. Users visiting this old URL will see the content they expect
 * with the settings nav highlighting Developer.
 */

import DeveloperPage from "@/app/(app)/settings/developer/page";

export default function DataRedirectPage() {
  return <DeveloperPage initialSection="data" />;
}
