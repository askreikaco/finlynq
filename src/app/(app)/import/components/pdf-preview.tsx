"use client";

import { useState, useEffect } from "react";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/mobile/list-row";
import { Badge } from "@/components/ui/badge";
import { File, Eye, ArrowRight } from "lucide-react";
import type { RawTransaction } from "@/lib/import-pipeline";
import { formatCurrency } from "@/lib/currency";
import { Field } from "@/components/ui/field";
import { useDisplayCurrency } from "@/components/currency-provider";

interface PdfPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: RawTransaction[];
  confidence: number;
  rawText: string;
  accounts: string[];
  onConfirm: (rows: RawTransaction[]) => void;
}

export function PdfPreview({
  open,
  onOpenChange,
  rows,
  confidence,
  rawText,
  accounts,
  onConfirm,
}: PdfPreviewProps) {
  const { displayCurrency } = useDisplayCurrency();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [showRawText, setShowRawText] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedAccount("");
      setShowRawText(false);
    }
  }, [open]);

  const confidencePct = Math.round(confidence * 100);
  const confidenceColor =
    confidencePct >= 70 ? "bg-pos/10 text-pos" :
    confidencePct >= 40 ? "bg-warning/10 text-warning" :
    "bg-destructive/10 text-destructive";

  const handleConfirm = () => {
    // Assign the selected account to all rows that don't have one
    const mapped = rows.map((r) => ({
      ...r,
      account: r.account || selectedAccount,
    }));
    onConfirm(mapped);
  };

  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="xl"
      title="PDF Import Preview"
      info={<>{rows.length} transactions extracted from the PDF.</>}
      actions={[
        { label: "Cancel", onClick: () => onOpenChange(false) },
        { label: !selectedAccount ? "Select an account first" : `Preview ${rows.length} transactions`, kind: "primary", onClick: handleConfirm, disabled: rows.length === 0 || !selectedAccount },
      ]}
    >
        {/* Confidence + account selector */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={confidenceColor}>
            Confidence: {confidencePct}%
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Assign to account:</span>
            <Field
              control="select"
              value={selectedAccount}
              onValueChange={(v) => setSelectedAccount(v ?? "")}
              placeholder="Select account"
              compact
              className="w-48"
              options={accounts.map((acc) => ({ value: acc, label: acc }))}
            />
          </div>
        </div>

        {/* Toggle between parsed and raw */}
        <div className="flex items-center gap-2">
          <Button
            variant={showRawText ? "outline" : "default"}
            size="sm"
            onClick={() => setShowRawText(false)}
          >
            Parsed ({rows.length})
          </Button>
          <Button
            variant={showRawText ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRawText(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Raw Text
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto flex-1 rounded-lg border">
          {showRawText ? (
            <pre className="p-3 text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
              {rawText}
            </pre>
          ) : (
            <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
              {rows.slice(0, 100).map((row, i) => (
                <ListRow
                  key={i}
                  size="dense"
                  title={row.payee}
                  subtitle={row.date}
                  value={
                    <span className={`font-mono ${row.amount < 0 ? "text-destructive" : "text-pos"}`}>
                      {formatCurrency(row.amount, row.currency ?? displayCurrency)}
                    </span>
                  }
                />
              ))}
              {rows.length > 100 && (
                <div className="text-center text-xs text-muted-foreground py-3">
                  Showing first 100 of {rows.length} rows
                </div>
              )}
              {rows.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No transactions could be extracted. Check the raw text tab.
                </div>
              )}
            </div>
          )}
        </div>
    </Overlay>
  );
}
