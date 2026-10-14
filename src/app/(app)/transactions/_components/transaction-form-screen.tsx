"use client";

/**
 * TransactionFormScreen: THE transaction create / edit form. /transactions/new, /transactions/[id]/edit and
 * /transactions/transfer/[linkId]/edit render it as a page; the /transactions split view renders it `embedded` in the
 * pane. Both mount the same TransactionEntryScreen (marker `data-form="transaction"`), so fields, validation, requests,
 * the offline queue and the delete confirm are one code path. Rows the entry screen cannot represent faithfully keep
 * the old TransactionEditForm on the pages; the pane offers a link to that full editor instead.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { TransactionEntryScreen, type EntryEmbedded } from "@/components/transactions/entry/transaction-entry-screen";
import { canEditInEntryScreen } from "@/lib/transactions/edit-flow";
import { toEntryMode } from "@/lib/transactions/entry-mode";
import { useEditSource, type EditTarget } from "./use-edit-source";
import { TransactionEditForm } from "./transaction-edit-form";

const TX_RETURN_FALLBACK = "/transactions";

export interface TransactionFormScreenProps {
  mode: "create" | "edit" | "edit-transfer";
  /** edit: the transaction id; edit-transfer: the link id. */
  id?: string | number;
  /** Same-app path the page returns to (already validated). Pane: ignored. */
  returnTo?: string;
  /** Split-view pane: callbacks replace every navigation. */
  embedded?: EntryEmbedded;
}

function Missing({ message, returnTo, title, embedded }: { message: string; returnTo: string; title: string; embedded: boolean }) {
  if (embedded) {
    return (
      <div data-testid="tx-edit-missing" className="space-y-2 text-sm text-foreground">
        <p>{message}</p>
      </div>
    );
  }
  return (
    <div className={"w-full space-y-3"}>
      <PageHeader title={title} backHref={returnTo} backLabel="Back" />
      <p className="text-sm text-foreground">{message}</p>
      <Link href={returnTo} className="text-sm text-primary underline">
        Back to transactions
      </Link>
    </div>
  );
}

function EditPanel({ mode, id, returnTo, embedded }: TransactionFormScreenProps & { returnTo: string }) {
  const router = useRouter();
  const isPane = !!embedded;
  const initial: EditTarget =
    mode === "edit-transfer"
      ? { kind: "transfer", linkId: String(id ?? ""), returnTo }
      : { kind: "transaction", id: Number(id), returnTo };
  // A pane can be redirected by the loader (a transfer pair opened from one leg): follow it inside the pane.
  const [target, setTarget] = useState<EditTarget>(initial);
  const title = target.kind === "transfer" ? "Edit transfer" : "Edit transaction";
  const source = useEditSource(target, { redirect: isPane ? "report" : "navigate" });

  // Adjust state while rendering (not in an effect): follow the loader's redirect to the transfer / single-row editor.
  if (source.status === "redirect" && source.transferLinkId && !(target.kind === "transfer" && target.linkId === source.transferLinkId)) {
    setTarget({ kind: "transfer", linkId: source.transferLinkId, returnTo });
  } else if (source.status === "redirect" && source.transactionId && !(target.kind === "transaction" && target.id === source.transactionId)) {
    setTarget({ kind: "transaction", id: source.transactionId, returnTo });
  }

  const invalid =
    target.kind === "transfer" ? !target.linkId : !Number.isInteger(target.id) || target.id <= 0;
  if (invalid) {
    return (
      <Missing
        title={title}
        embedded={isPane}
        returnTo={returnTo}
        message={target.kind === "transfer" ? "That transfer link is not valid." : "That transaction link is not valid."}
      />
    );
  }
  if (source.status === "loading" || (source.status === "redirect" && (source.transferLinkId || source.transactionId))) {
    return isPane ? (
      <div data-testid="tx-edit-loading" className="text-sm text-muted-foreground">Loading…</div>
    ) : (
      <div className={"w-full"}>
        <PageHeader title={title} backHref={returnTo} backLabel="Back" />
        <div data-testid="tx-edit-loading" className="mt-3 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (source.status === "redirect") {
    // A portfolio row: its operation page is the editor.
    return (
      <div data-testid="tx-edit-redirect" className="space-y-2 text-sm">
        <p>This is an investment transaction. It is edited on its own page.</p>
        <button type="button" className="text-primary underline" onClick={() => router.push(source.href)}>
          Open the investment editor
        </button>
      </div>
    );
  }
  if (source.status === "missing") {
    return <Missing title={title} embedded={isPane} returnTo={returnTo} message={source.message} />;
  }
  // The same entry screen as New, prefilled. Rows it cannot represent faithfully keep the old edit form.
  if (canEditInEntryScreen(source.initialState, source)) {
    return <TransactionEntryScreen mode={toEntryMode(source.initialState, source.splits ?? [], returnTo)} embedded={embedded} />;
  }
  if (isPane) {
    const full = source.initialState.kind === "transfer-edit"
      ? `/transactions/transfer/${encodeURIComponent(source.initialState.linkId)}/edit`
      : `/transactions/${source.initialState.tx.id}/edit`;
    return (
      <div data-testid="tx-edit-full-editor" className="space-y-2 text-sm">
        <p>This transaction has details the quick editor cannot show.</p>
        <Link href={`${full}?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary underline">
          Open the full editor
        </Link>
      </div>
    );
  }
  return (
    <TransactionEditForm
      initialState={source.initialState}
      accounts={source.accounts}
      categories={source.categories}
      holdings={source.holdings}
      returnTo={returnTo}
    />
  );
}

export function TransactionFormScreen(props: TransactionFormScreenProps) {
  const returnTo = props.returnTo ?? TX_RETURN_FALLBACK;
  if (props.mode === "create") return <TransactionEntryScreen mode={{ kind: "create" }} embedded={props.embedded} />;
  return <EditPanel {...props} returnTo={returnTo} />;
}
