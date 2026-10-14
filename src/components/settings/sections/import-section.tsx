"use client";

/**
 * Import management — account-agnostic pieces lifted from the old /import tabs
 * (same components and endpoints, no API changes). To upload a statement, use
 * the /import page.
 *
 * - ImportSettingsCard (card, Reconciliation; old /settings/import scrolls here)
 * - ImportTemplatesItem (accordion item, Reconciliation)
 * - ImportEmailItem, ImportMigrateItem, ImportStatementsItem (accordion items,
 *   Integrations; ?tab=email|migrate|statements, ?provider= opens Migrate)
 *
 * Accordion items must be rendered inside an <Accordion>.
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccordionItem } from "@/components/ui/accordion";
import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookTemplate, ChevronRight, Clock, Copy, Eye, EyeOff, FileCheck, FileSpreadsheet, Landmark, Link as LinkIcon, Mail, RefreshCw, Sliders, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import { TemplateManager } from "@/app/(app)/import/components/template-manager";
import { ConnectorTab } from "@/app/(app)/import/components/connector-tab";
import { MoneyProConnectorTab } from "@/app/(app)/import/components/moneypro-connector-tab";
import { GenericCsvConnectorTab } from "@/app/(app)/import/components/generic-csv-connector-tab";
import { InvestmentStatementImporter } from "@/app/(app)/import/components/investment-statement-importer";
import { EmailRulesManager } from "@/components/inbox/email-rules-manager";
import type { ImportTemplate } from "@/lib/import-templates";

type ImportProvider = "wealthposition" | "moneypro" | "generic-csv";

/** CSV/OFX mapping confirmation + reconcile dropdown visibility. */
export function ImportSettingsCard() {
  // §B (2026-06-04) — "Confirm detected column mapping before importing"
  // per-user default. Seeds NEW accounts' csv_mapping_mode; a per-account
  // override on the upload drawer (the "Don't ask again" checkbox) wins.
  const [confirmCsvMapping, setConfirmCsvMapping] = useState(true);
  const [confirmCsvLoading, setConfirmCsvLoading] = useState(false);

  // FINLYNQ-241 — count of hidden accounts, shown on the entry-point card.
  const [hiddenAccountCount, setHiddenAccountCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings/confirm-csv-mapping")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.confirmCsvMapping === "boolean") {
          setConfirmCsvMapping(data.confirmCsvMapping);
        }
      })
      .catch(() => {});

    fetch("/api/settings/reconcile-hidden-accounts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.accountIds)) {
          setHiddenAccountCount(data.accountIds.length);
        }
      })
      .catch(() => {});
  }, []);

  const toggleConfirmCsvMapping = async () => {
    const next = !confirmCsvMapping;
    // Optimistic — revert on failure.
    setConfirmCsvMapping(next);
    setConfirmCsvLoading(true);
    try {
      const res = await fetch("/api/settings/confirm-csv-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCsvMapping: next }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.confirmCsvMapping !== "boolean") {
        setConfirmCsvMapping(!next);
      } else {
        setConfirmCsvMapping(data.confirmCsvMapping);
      }
    } catch {
      setConfirmCsvMapping(!next);
    } finally {
      setConfirmCsvLoading(false);
    }
  };

  return (
    <Card id="import-settings" className="scroll-mt-6">
      <CardHeader>
        <CardTitle icon={Sliders} tone="indigo">
          <Sliders className="h-4 w-4" />
          Import settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
          <a href="/import" className="text-sm underline hover:text-foreground">
            Go to Import
          </a>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              {confirmCsvMapping ? (
                <ToggleRight className="h-5 w-5" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
            </div>
            <div>
              <CardTitle icon={FileCheck} tone="cyan">
                Confirm mapping
                <InfoTip
                  label="About confirm mapping"
                  text="When on, CSV and OFX/QFX uploads show the detected field mapping for review before rows are staged. Per-account choices in the import preview still apply."
                />
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                {confirmCsvMapping ? "On" : "Off"}
              </p>
            </div>
            <Switch
              checked={confirmCsvMapping}
              onCheckedChange={() => void toggleConfirmCsvMapping()}
              disabled={confirmCsvLoading}
              aria-label="Confirm mapping"
            />
          </div>
        </CardContent>
      </Card>

      {/* FINLYNQ-147 / FINLYNQ-241 — hide accounts from the /import reconcile
          dropdown. The full list lives on a subpage to keep this page compact. */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <CardTitle icon={Eye} tone="cyan">
                Reconcile picker
                <InfoTip label="About reconcile picker" text="Choose which accounts appear in the Import page account picker. Hidden accounts stay reachable by direct link." />
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/import/reconcile-visibility"
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            Manage visibility
            {hiddenAccountCount !== null && hiddenAccountCount > 0 && (
              <span className="ml-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                {hiddenAccountCount} hidden
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </Link>
        </CardContent>
      </Card>
      </CardContent>
    </Card>
  );
}

/** Saved CSV column mappings per bank. */
export function ImportTemplatesItem() {
  const [accountNames, setAccountNames] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAccountNames(data.map((a: { name: string }) => a.name));
        }
      })
      .catch(() => {});

    fetch("/api/import/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  return (
        <AccordionItem
          value="templates"
          icon={<BookTemplate className="h-4 w-4" />}
          title="Templates"
          info="Saved CSV column mappings per bank."
        >
          <div className="space-y-4" id="templates">
            <TemplateManager
              templates={templates}
              accounts={accountNames}
              onDeleted={(id) =>
                setTemplates((prev) => prev.filter((t) => t.id !== id))
              }
              onUpdated={(updated) => {
                if (updated.isDefault) {
                  // Server clears isDefault on every OTHER template when this one
                  // is set true; the PUT response only returns the updated row,
                  // so refetch to keep the "default" badge in sync across rows.
                  fetch("/api/import/templates")
                    .then((r) => r.json())
                    .then((data) => {
                      if (Array.isArray(data)) setTemplates(data);
                    })
                    .catch(() => {});
                } else {
                  setTemplates((prev) =>
                    prev.map((t) => (t.id === updated.id ? updated : t)),
                  );
                }
              }}
            />
          </div>
        </AccordionItem>
  );
}

/** Import address, imported-email retention and email rules. */
export function ImportEmailItem() {
  const [importEmail, setImportEmail] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // FINLYNQ-138 — per-user imported-email retention window (days). Governs how
  // long raw forwarded emails (email_inbox) are kept before the cleanup sweep
  // hard-deletes them. Bounded {7,30,60,90}; default 60.
  const [retentionDays, setRetentionDays] = useState<number>(60);
  const [retentionOptions, setRetentionOptions] = useState<number[]>([
    7, 30, 60, 90,
  ]);
  const [retentionLoading, setRetentionLoading] = useState(false);

  useEffect(() => {
    fetch("/api/import/email-config")
      .then((r) => r.json())
      .then((data) => setImportEmail(data.email))
      .catch(() => {});

    fetch("/api/settings/email-retention")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.retentionDays === "number") {
          setRetentionDays(data.retentionDays);
        }
        if (Array.isArray(data.options)) setRetentionOptions(data.options);
      })
      .catch(() => {});
  }, []);

  const updateRetentionDays = async (next: number) => {
    const prev = retentionDays;
    // Optimistic — revert on failure.
    setRetentionDays(next);
    setRetentionLoading(true);
    try {
      const res = await fetch("/api/settings/email-retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: next }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.retentionDays !== "number") {
        setRetentionDays(prev);
      } else {
        setRetentionDays(data.retentionDays);
      }
    } catch {
      setRetentionDays(prev);
    } finally {
      setRetentionLoading(false);
    }
  };

  const generateEmail = async () => {
    setEmailLoading(true);
    try {
      const res = await fetch("/api/import/email-config", { method: "POST" });
      const data = await res.json();
      if (data.email) setImportEmail(data.email);
    } catch {
      // ignore
    } finally {
      setEmailLoading(false);
    }
  };

  const copyEmail = () => {
    if (importEmail) {
      navigator.clipboard.writeText(importEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
        <AccordionItem
          value="email"
          icon={<Mail className="h-4 w-4" />}
          title="Email import"
          info="Your import address, retention and email rules."
        >
          <div className="space-y-4" id="email">
            <Card>
              <CardHeader>
                <CardTitle icon={Mail} tone="cyan">
                  <Mail className="h-5 w-5 text-info" />
                  Address
                  <InfoTip
                    label="How email import works"
                    text="Forward statements or CSVs to this address. CSVs match your saved templates. Transactions in the email body are parsed too (Import, Email tab); add an email rule to auto-record a known sender. Duplicates are skipped. Parsed imports expire after 14 days; raw emails are deleted after your retention window."
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {importEmail ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border bg-muted/50 px-4 py-2.5 font-mono text-sm">
                        {importEmail}
                      </div>
                      <Button variant="outline" size="sm" onClick={copyEmail}>
                        <Copy className="h-4 w-4 mr-1" />
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={generateEmail}
                      disabled={emailLoading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 mr-1.5 ${emailLoading ? "animate-spin" : ""}`}
                      />
                      Regenerate
                    </Button>
                  </>
                ) : (
                  <Button onClick={generateEmail} disabled={emailLoading}>
                    <Mail className="h-4 w-4 mr-2" />
                    {emailLoading
                      ? "Generating..."
                      : "Generate address"}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* FINLYNQ-138 — imported-email retention window. */}
            <Card>
              <CardHeader>
                <CardTitle icon={Clock} tone="amber">
                  Retention
                  <InfoTip label="About retention" text="How long raw forwarded emails are kept before permanent deletion. Applies to existing emails at the next cleanup. Recorded transactions are unaffected." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Keep emails for</p>
                  </div>
                  <Select
                    value={String(retentionDays)}
                    onValueChange={(v) =>
                      v && void updateRetentionDays(parseInt(v, 10))
                    }
                    disabled={retentionLoading}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue>{retentionDays} days</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {retentionOptions.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <EmailRulesManager />
          </div>
        </AccordionItem>
  );
}

/** One-time full-ledger migration from another app, per-source submenu. */
export function ImportMigrateItem() {
  const [provider, setProvider] = useState<ImportProvider | null>(null);

  // Deep-link support: ?provider=moneypro picks the provider flow. The parent
  // (Integrations, useOpenSection) opens this section.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("provider");
    if (p === "wealthposition" || p === "moneypro" || p === "generic-csv") {
      setProvider(p);
    }
  }, []);

  return (
        <AccordionItem
          value="migrate"
          icon={<LinkIcon className="h-4 w-4" />}
          title="Other apps"
          info="One-time move of your full ledger from another app. For a bank statement use the Import page."
        >
          <div className="space-y-4" id="migrate">
            {provider === null ? (
              <>
                <div className="grid gap-3 regular:grid-cols-2">
                  <div className="relative">
                  <InfoTip label="About WealthPosition" text="Import a WealthPosition export ZIP, with optional balance reconciliation." className="absolute right-2 top-2" />
                  <button
                    type="button"
                    onClick={() => setProvider("wealthposition")}
                    className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <LinkIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">WealthPosition</div>
                    </div>
                  </button>
                  </div>
                  <div className="relative">
                  <InfoTip label="About Money Pro" text="Import a Money Pro Transactions report exported as CSV." className="absolute right-2 top-2" />
                  <button
                    type="button"
                    onClick={() => setProvider("moneypro")}
                    className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Money Pro</div>
                    </div>
                  </button>
                  </div>
                  <div className="relative">
                  <InfoTip label="About Generic CSV" text="Any multi-account CSV: date, amount, account, plus optional currency, category and transfers." className="absolute right-2 top-2" />
                  <button
                    type="button"
                    onClick={() => setProvider("generic-csv")}
                    className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Generic CSV</div>
                    </div>
                  </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProvider(null)}
                >
                  ← Back
                </Button>
                {provider === "wealthposition" ? (
                  <ConnectorTab />
                ) : provider === "moneypro" ? (
                  <MoneyProConnectorTab />
                ) : (
                  <GenericCsvConnectorTab />
                )}
              </>
            )}
          </div>
        </AccordionItem>
  );
}

/** IBKR XML / multi-account OFX/QFX investment statements. */
export function ImportStatementsItem() {
  return (
        <AccordionItem
          value="statements"
          icon={<Landmark className="h-4 w-4" />}
          title="Investment statement"
          info="IBKR XML or multi-account OFX/QFX."
        >
          <div id="statements">
            <InvestmentStatementImporter />
          </div>
        </AccordionItem>
  );
}
