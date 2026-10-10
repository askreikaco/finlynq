"use client";

/** /settings/investments/securities/new — add a security (bare catalog entry). */

import { FormPage } from "@/components/templates/form-page";
import { AddSecurityForm } from "../../_components/add-security-form";
import { INVESTMENTS_HOME, returnHref } from "../../_components/shared";

export default function NewSecurityRoute() {
  return (
    <FormPage
      rootTestId="investments-security-new"
      id="investments-security-new"
      title="Add security"
      fallbackReturn={INVESTMENTS_HOME}
      form="external"
      width="form"
      padBottom="none"
      header={{ actions: null }}
    >
      {(ctx) => (
        <AddSecurityForm
          onCancel={() => ctx.router.push(ctx.returnTo)}
          onSaved={(notice) => ctx.router.push(returnHref(ctx.returnTo, notice))}
        />
      )}
    </FormPage>
  );
}
