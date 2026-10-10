"use client";

/** /settings/investments/accounts/[id]/link — add a security to this account. */

import { FormPage } from "@/components/templates/form-page";
import { INVESTMENTS_HOME, type Account } from "../../../_components/shared";
import { LinkFormBody, linkStates, useAccountLinkLoad, type LinkExtra } from "../../../_components/link-page";

export default function LinkAccountRoute() {
  return (
    <FormPage<unknown, Account, unknown, LinkExtra>
      rootTestId="investments-account-link"
      id="investments-account-link"
      title="Add a security"
      subtitle={(account) => account?.name}
      fallbackReturn={INVESTMENTS_HOME}
      form="external"
      width="form"
      padBottom="none"
      header={{ actions: null }}
      useLoad={useAccountLinkLoad}
      states={linkStates("account")}
    >
      {(ctx) =>
        ctx.record && ctx.extra ? (
          <LinkFormBody
            kind="account"
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
