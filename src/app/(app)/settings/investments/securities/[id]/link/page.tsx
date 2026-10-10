"use client";

/** /settings/investments/securities/[id]/link — add this security to an account. */

import { FormPage } from "@/components/templates/form-page";
import { INVESTMENTS_HOME, symbolLabel, type Security } from "../../../_components/shared";
import { LinkFormBody, linkStates, useSecurityLinkLoad, type LinkExtra } from "../../../_components/link-page";

export default function LinkSecurityRoute() {
  return (
    <FormPage<unknown, Security, unknown, LinkExtra>
      rootTestId="investments-security-link"
      id="investments-security-link"
      title="Add to an account"
      subtitle={(security) => (security ? symbolLabel(security) : undefined)}
      fallbackReturn={INVESTMENTS_HOME}
      form="external"
      width="form"
      padBottom="none"
      header={{ actions: null }}
      useLoad={useSecurityLinkLoad}
      states={linkStates("security")}
    >
      {(ctx) =>
        ctx.record && ctx.extra ? (
          <LinkFormBody
            kind="security"
            record={ctx.record}
            extra={ctx.extra}
            returnTo={ctx.returnTo}
            router={ctx.router}
          />
        ) : null
      }
    </FormPage>
  );
}
