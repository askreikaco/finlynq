"use client";

/**
 * Data section — CSV Import/Export, data management, backfill, rebuild balance history,
 * and danger zone (Clear All Data, Delete Account).
 *
 * Extracted from the old /settings/data page. Renders as an accordion section
 * inside Developer settings.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Wallet, Tag, Briefcase, ArrowLeftRight, Database, Download, AlertTriangle, Trash2, History } from "lucide-react";
import { RebuildSnapshotsButton } from "@/components/portfolio/rebuild-snapshots-button";
import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";

type ImportRow = Record<string, string>;
type ImportSection = "accounts" | "categories" | "portfolio";

const exportItems = [
  { type: "accounts", label: "Accounts", icon: Wallet, iconColor: "text-violet-500" },
  { type: "categories", label: "Categories", icon: Tag, iconColor: "text-emerald-500" },
  { type: "transactions", label: "Transactions", icon: ArrowLeftRight, iconColor: "text-amber-500" },
  { type: "portfolio", label: "Portfolio", icon: Briefcase, iconColor: "text-cyan-500" },
];

export function DataSection() {
  const [importSection, setImportSection] = useState<ImportSection | null>(null);
  const [importPreview, setImportPreview] = useState<ImportRow[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importAllRows, setImportAllRows] = useState<ImportRow[]>([]);

  const [exportStatus, setExportStatus] = useState("");

  const [clearConfirm, setClearConfirm] = useState("");
  const [clearStep, setClearStep] = useState(0);
  const [clearStatus, setClearStatus] = useState("");

  const [delStep, setDelStep] = useState(0);
  const [delPassword, setDelPassword] = useState("");
  const [delConfirm, setDelConfirm] = useState("");
  const [delMfaCode, setDelMfaCode] = useState("");
  const [delMfaRequired, setDelMfaRequired] = useState(false);
  const [delStatus, setDelStatus] = useState("");
  const [delLoading, setDelLoading] = useState(false);

  function resetDeleteAccount() {
    setDelStep(0);
    setDelPassword("");
    setDelConfirm("");
    setDelMfaCode("");
    setDelMfaRequired(false);
    setDelStatus("");
    setDelLoading(false);
  }

  async function handleDeleteAccount() {
    if (delStep === 0) {
      setDelStep(1);
      return;
    }
    if (delStep === 1) {
      setDelStep(2);
      return;
    }
    if (delConfirm !== "DELETE") {
      setDelStatus("Type DELETE to confirm");
      return;
    }
    if (!delPassword) {
      setDelStatus("Enter your password");
      return;
    }
    setDelLoading(true);
    setDelStatus("");
    try {
      const send = (extra: Record<string, unknown> = {}) =>
        fetch("/api/auth/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: delPassword,
            confirmation: delConfirm,
            mfaCode: delMfaCode || undefined,
            ...extra,
          }),
        });
      let res = await send();
      if (res.status === 401) {
        const probe = await res.clone().json().catch(() => ({}));
        if (probe?.code === "passkey-required") {
          const step = await getPasskeyStepUp("delete-account");
          if (!step.ok) {
            setDelStatus(step.code === "cancelled" ? "Passkey confirmation was cancelled." : "Passkey confirmation failed.");
            return;
          }
          res = await send({ passkeyStepUp: step.passkeyStepUp });
        }
      }
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data?.code === "mfa-required") {
        setDelMfaRequired(true);
        setDelStatus("Enter your 6-digit authenticator code.");
      } else {
        setDelStatus(data?.error || "Failed to delete account");
      }
    } catch {
      setDelStatus("Failed to delete account");
    } finally {
      setDelLoading(false);
    }
  }

  const parseCSV = useCallback((text: string): { headers: string[]; rows: ImportRow[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: ImportRow = {};
      headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
      rows.push(row);
    }
    return { headers, rows };
  }, []);

  function handleImportFile(section: ImportSection, file: File) {
    setImportSection(section);
    setImportStatus("");
    setImportPreview([]);
    setImportAllRows([]);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (rows.length === 0) {
        setImportStatus("File appears empty or has no data rows.");
        return;
      }
      setImportHeaders(headers);
      setImportPreview(rows.slice(0, 5));
      setImportAllRows(rows);
    };
    reader.readAsText(file);
  }

  async function handleImportConfirm() {
    if (!importSection || importAllRows.length === 0) return;
    setImportLoading(true);
    setImportStatus(`Importing ${importAllRows.length} rows…`);
    let ok = 0;
    let failed = 0;
    try {
      if (importSection === "accounts") {
        for (const row of importAllRows) {
          try {
            await fetch("/api/accounts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: row.name || row.Name || "",
                type: row.type || row.Type || "A",
                group: row.group || row.Group || "Other",
                currency: row.currency || row.Currency || "CAD",
                note: row.note || row.Note || "",
              }),
            });
            ok++;
          } catch {
            failed++;
          }
        }
      } else if (importSection === "categories") {
        for (const row of importAllRows) {
          try {
            await fetch("/api/categories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: row.name || row.Name || "",
                type: row.type || row.Type || "E",
                group: row.group || row.Group || "Other",
                note: row.note || row.Note || "",
              }),
            });
            ok++;
          } catch {
            failed++;
          }
        }
      } else if (importSection === "portfolio") {
        for (const row of importAllRows) {
          try {
            await fetch("/api/holdings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: row.symbol || row.Symbol || "",
                name: row.name || row.Name || "",
                assetClass: row.assetClass || row.AssetClass || "Other",
                currency: row.currency || row.Currency || "CAD",
              }),
            });
            ok++;
          } catch {
            failed++;
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setImportLoading(false);
      setImportStatus(`${ok} imported, ${failed} failed.`);
      if (failed === 0) {
        setTimeout(() => {
          setImportSection(null);
          setImportPreview([]);
          setImportAllRows([]);
          setImportFileName("");
          setImportStatus("");
        }, 1000);
      }
    }
  }

  const handleExport = async (type: string) => {
    setExportStatus("Preparing download…");
    try {
      const res = await fetch(`/api/export?type=${type}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finlynq-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setExportStatus("Downloaded successfully.");
      setTimeout(() => setExportStatus(""), 3000);
    } catch (e) {
      setExportStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  async function handleClearData() {
    if (clearStep === 0) {
      setClearStep(1);
      return;
    }
    if (clearStep === 1) {
      setClearStep(2);
      return;
    }
    if (clearConfirm !== "DELETE") {
      setClearStatus("Type DELETE to confirm");
      return;
    }
    setClearStatus("Clearing data…");
    try {
      const res = await fetch("/api/settings/clear-all-data", { method: "POST" });
      if (res.ok) {
        setClearStatus("All data cleared. Refreshing…");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setClearStatus(`Failed: ${res.statusText}`);
      }
    } catch (e) {
      setClearStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Data Import</CardTitle>
              <CardDescription>Import accounts, categories, or portfolio holdings from CSV</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {importSection === null ? (
            <div className="grid grid-cols-3 gap-3">
              {[
                { section: "accounts" as const, label: "Accounts", icon: Wallet, color: "bg-violet-100 text-violet-600" },
                { section: "categories" as const, label: "Categories", icon: Tag, color: "bg-emerald-100 text-emerald-600" },
                { section: "portfolio" as const, label: "Portfolio", icon: Briefcase, color: "bg-cyan-100 text-cyan-600" },
              ].map(({ section, label, icon: Icon, color }) => (
                <label key={section} className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImportFile(section, e.target.files[0])}
                  />
                  <div className={`${color} rounded-lg p-4 text-center flex flex-col items-center justify-center gap-2 border-2 border-dashed border-current cursor-pointer hover:opacity-80 transition-opacity`}>
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{importFileName}</p>
                  <p className="text-xs text-muted-foreground">Preview ({importPreview.length} of {importAllRows.length} rows)</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setImportSection(null)}>
                  Change file
                </Button>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="text-sm w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {importHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        {importHeaders.map((h) => (
                          <td key={h} className="px-3 py-2 max-w-40 truncate text-xs">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleImportConfirm} disabled={importLoading}>
                  {importLoading ? "Importing…" : `Import ${importAllRows.length} rows`}
                </Button>
                <Button variant="outline" onClick={() => setImportSection(null)} disabled={importLoading}>
                  Cancel
                </Button>
              </div>

              {importStatus && <p className="text-xs text-muted-foreground">{importStatus}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Data Export</CardTitle>
              <CardDescription>Export your data as CSV files</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {exportItems.map((item) => (
              <Button key={item.type} variant="outline" className="justify-start h-auto py-3 px-4" onClick={() => handleExport(item.type)}>
                <item.icon className={`h-4 w-4 mr-2 ${item.iconColor}`} />
                <div className="text-left">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">Download CSV</p>
                </div>
              </Button>
            ))}
          </div>
          {exportStatus && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Download className="h-3 w-3" /> {exportStatus}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Backfill transactions</CardTitle>
              <CardDescription>Canonicalize legacy or imported transactions so realized gains and lot tracking work</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => { window.location.href = "/settings/backfill"; }}>
            Open backfill wizard
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Reviews proposals before applying. Won&apos;t change account balances. <Link href="/settings/backfill" className="underline">Learn more</Link>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Rebuild balance history</CardTitle>
              <CardDescription>
                Recompute daily balance snapshots — cash and investments — from your
                first transaction to today. Run this if the "Net Worth Over
                Time" chart looks stale after a back-dated edit or after
                deleting transactions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RebuildSnapshotsButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Data Management</CardTitle>
              <CardDescription>Danger zone - destructive actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearStep === 0 && (
            <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleClearData}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
          )}

          {clearStep === 1 && (
            <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium text-destructive">Are you sure? This will permanently delete all your data.</p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleClearData}>Yes, I want to delete everything</Button>
                <Button variant="ghost" size="sm" onClick={() => setClearStep(0)}>Cancel</Button>
              </div>
            </div>
          )}

          {clearStep === 2 && (
            <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium text-destructive">Type DELETE to confirm permanent deletion of all data:</p>
              <div className="flex gap-2">
                <Input
                  value={clearConfirm}
                  onChange={(e) => setClearConfirm(e.target.value)}
                  placeholder="Type DELETE"
                  className="max-w-40"
                />
                <Button variant="destructive" size="sm" onClick={handleClearData} disabled={clearConfirm !== "DELETE"}>Confirm</Button>
                <Button variant="ghost" size="sm" onClick={() => { setClearStep(0); setClearConfirm(""); setClearStatus(""); }}>Cancel</Button>
              </div>
            </div>
          )}

          {clearStatus && (
            <p className={`text-xs ${clearStatus.includes("success") ? "text-emerald-600" : "text-destructive"}`}>
              {clearStatus}
            </p>
          )}

          <div className="pt-3 mt-1 border-t border-border/60 space-y-3">
            {delStep === 0 && (
              <div className="space-y-1.5">
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleDeleteAccount}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
                <p className="text-xs text-muted-foreground">Permanently deletes your account, login, and all data.</p>
              </div>
            )}

            {delStep === 1 && (
              <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">This permanently deletes your account and all of your data, including your login. This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>Continue</Button>
                  <Button variant="ghost" size="sm" onClick={resetDeleteAccount}>Cancel</Button>
                </div>
              </div>
            )}

            {delStep === 2 && (
              <div className="space-y-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Confirm permanent account deletion:</p>
                <div className="space-y-2">
                  <Input
                    type="password"
                    value={delPassword}
                    onChange={(e) => setDelPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    className="max-w-xs"
                  />
                  <Input
                    value={delConfirm}
                    onChange={(e) => setDelConfirm(e.target.value)}
                    placeholder="Type DELETE"
                    className="max-w-40"
                  />
                  {delMfaRequired && (
                    <Input
                      value={delMfaCode}
                      onChange={(e) => setDelMfaCode(e.target.value)}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      maxLength={6}
                      className="max-w-40"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={delLoading || delConfirm !== "DELETE" || !delPassword}>
                    {delLoading ? "Deleting…" : "Delete my account"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetDeleteAccount} disabled={delLoading}>Cancel</Button>
                </div>
              </div>
            )}

            {delStatus && (
              <p className="text-xs text-destructive">{delStatus}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
