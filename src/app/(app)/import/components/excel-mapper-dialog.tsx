"use client";

import { useState, useEffect } from "react";
import { Overlay } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/badge";
import { ListRow, SectionCard } from "@/components/mobile";
import { Field } from "@/components/ui/field";
import { ArrowRight, FileSpreadsheet, Table2 } from "lucide-react";

interface SheetInfo {
  name: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

interface ExcelMapperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheets: SheetInfo[];
  file: File;
  onMapped: (sheetName: string, mapping: Record<string, string>, hasHeaders: boolean) => void;
  isMapping: boolean;
}

const FIELD_OPTIONS = [
  { value: "", label: "Skip" },
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "account", label: "Account" },
  { value: "payee", label: "Payee / Description" },
  { value: "category", label: "Category" },
  { value: "currency", label: "Currency" },
  { value: "note", label: "Note" },
  { value: "tags", label: "Tags" },
  { value: "quantity", label: "Quantity" },
  { value: "portfolioHolding", label: "Portfolio Holding" },
];

function autoDetectField(header: string): string {
  const h = header.toLowerCase();
  if (h.includes("date") || h.includes("posted")) return "date";
  if (h.includes("amount") || h.includes("total") || h.includes("debit") || h.includes("credit")) return "amount";
  if (h.includes("account")) return "account";
  if (h.includes("payee") || h.includes("description") || h.includes("merchant") || h.includes("memo")) return "payee";
  if (h.includes("category") || h.includes("categorization")) return "category";
  if (h.includes("currency")) return "currency";
  if (h.includes("note") || h.includes("reference")) return "note";
  if (h.includes("tag")) return "tags";
  return "";
}

export function ExcelMapperDialog({
  open,
  onOpenChange,
  sheets,
  file,
  onMapped,
  isMapping,
}: ExcelMapperDialogProps) {
  const [selectedSheet, setSelectedSheet] = useState(sheets[0]?.name ?? "");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [hasHeaders, setHasHeaders] = useState(true);

  const sheet = sheets.find((s) => s.name === selectedSheet);

  // Auto-detect mappings when sheet changes
  useEffect(() => {
    if (!sheet) return;
    const auto: Record<string, string> = {};
    sheet.headers.forEach((h) => {
      const field = autoDetectField(h);
      if (field) auto[h] = field;
    });
    setMapping(auto);
  }, [selectedSheet, sheet]);

  const updateMapping = (header: string, field: string | null) => {
    setMapping((prev) => ({ ...prev, [header]: field ?? "" }));
  };

  const hasDate = Object.values(mapping).includes("date");
  const hasAmount = Object.values(mapping).includes("amount");
  const isValid = hasDate && hasAmount;

  const handleSubmit = () => {
    // Convert to the format expected by the API: { date: "Column Name", amount: "Column Name" }
    const apiMapping: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field) apiMapping[field] = header;
    }
    onMapped(selectedSheet, apiMapping, hasHeaders);
  };

  if (!sheet) return null;

  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="xl"
      title="Map Excel Columns"
      info={<>Map your spreadsheet columns to transaction fields.</>}
      actions={[
        { label: "Cancel", onClick: () => onOpenChange(false), disabled: isMapping },
        { label: isMapping ? "Processing..." : "Preview Import", kind: "primary", onClick: handleSubmit, disabled: !isValid || isMapping },
      ]}
    >
        {/* Sheet selector */}
        {sheets.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sheet:</span>
            <Field
              control="select"
              value={selectedSheet}
              onValueChange={(v) => setSelectedSheet(v ?? "")}
              className="w-48"
              options={sheets.map((s) => ({ value: s.name, label: <>{s.name} ({s.totalRows} rows)</> }))}
            />
          </div>
        )}

        {/* Headers toggle */}
        <Field
          label="First row contains headers"
          control="switch"
          checked={hasHeaders}
          onCheckedChange={(v) => setHasHeaders(v)}
        />

        {/* Column mapping */}
        <div className="space-y-2 overflow-auto flex-1">
          <p data-keep="label" className="text-xs text-muted-foreground font-medium">Column Mapping</p>
          {sheet.headers.map((header) => (
            <div key={header} className="flex items-center gap-2">
              <Badge variant="outline" className="min-w-[120px] justify-center font-mono text-xs">
                {header}
              </Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Field
                control="select"
                value={mapping[header] ?? ""}
                onValueChange={(v) => updateMapping(header, v)}
                placeholder="Skip"
                compact
                className="w-48"
                options={FIELD_OPTIONS.map((opt) => ({ value: opt.value || "_skip", label: opt.label }))}
              />
            </div>
          ))}
        </div>

        {/* Sample data preview: one list row per sample row (no table). */}
        {sheet.sampleRows.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            <SectionCard label="Sample rows" icon={Table2} tone="muted" list>
              {sheet.sampleRows.map((row, i) => (
                <ListRow
                  key={i}
                  title={String(row[0] ?? "") || `Row ${i + 1}`}
                  subtitle={sheet.headers.slice(1).map((h, k) => `${h}: ${row[k + 1] ?? ""}`).join(" · ")}
                />
              ))}
            </SectionCard>
          </div>
        )}

        {/* Validation */}
        {!isValid && (
          <p className="text-xs text-warning">
            {!hasDate && "Date mapping is required. "}
            {!hasAmount && "Amount mapping is required."}
          </p>
        )}
    </Overlay>
  );
}
