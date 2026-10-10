"use client";

/** /settings/investments/securities/[id]/link — add this security to an account. */

import { LinkRoute } from "../../../_components/link-page";

export default function LinkSecurityRoute() {
  return <LinkRoute kind="security" />;
}
