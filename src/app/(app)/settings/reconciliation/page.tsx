"use client";

/**
 * /settings/reconciliation — fuzzy-match thresholds, Import settings and Rules
 * cards, and the Import Templates accordion section.
 *
 * Old /settings/import and /settings/rules render this page in place scrolled
 * to their card. Legacy ?tab=email|migrate|statements (and connect, ?provider=)
 * links now live on Integrations, so they are forwarded there.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { SlidersHorizontal, Zap } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { useOpenSection } from "@/components/settings/use-open-section";
import { movedImportHref } from "@/components/settings/moved-import";
import { RulesSection } from "@/components/settings/sections/rules-section";
import {
  ImportSettingsCard,
  ImportTemplatesItem,
} from "@/components/settings/sections/import-section";
import { Field } from "@/components/ui/field";
import { SectionPage } from "@/components/templates";

interface Thresholds {
  dateToleranceDays: number;
  amountTolerancePct: number;
  amountToleranceFloor: number;
  scoreThreshold: number;
}

const DEFAULTS: Readonly<Thresholds> = {
  dateToleranceDays: 7,
  amountTolerancePct: 0.07,
  amountToleranceFloor: 50,
  scoreThreshold: 0.6,
};

// Old folded URLs render this page in place: /settings/rules scrolls to the
// Rules card, /settings/import to Import settings; ?tab=templates opens Import
// Templates.
const OPEN_SECTIONS = {
  byPath: [
    { prefix: "/settings/rules", section: "rules" },
    { prefix: "/settings/import", section: "import-settings" },
  ],
  valid: ["rules", "import-settings", "templates"],
  alias: { import: "import-settings" },
};

export default function ReconciliationSettingsPage() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULTS);
  const [isDefault, setIsDefault] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useOpenSection(OPEN_SECTIONS);
  const router = useRouter();

  useEffect(() => {
    const href = movedImportHref(window.location.search, window.location.hash);
    if (href) router.replace(href);
  }, [router]);

  // ─── Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/reconcile-thresholds");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        if (body?.success && body?.data?.thresholds) {
          setThresholds(body.data.thresholds);
          setIsDefault(Boolean(body.data.isDefault));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Save ──────────────────────────────────────────────────────────
  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/reconcile-thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thresholds),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      if (body?.data?.thresholds) {
        setThresholds(body.data.thresholds);
        setIsDefault(false);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [thresholds]);

  const onReset = useCallback(() => {
    setThresholds({ ...DEFAULTS });
  }, []);

  return (
    <SectionPage
      id="settings-reconciliation"
      title="Reconciliation"
      padBottom="none"
      minW0={false}
      suspense={false}
      grid
    >

      <Card>
        <CardHeader>
          <CardTitle icon={SlidersHorizontal} tone="indigo">
            Fuzzy match
            <InfoTip
              label="About fuzzy match"
              text={
                <>
                  Tunes how <Link href="/reconcile" className="underline">/reconcile</Link> pairs bank rows with
                  transactions. A pair matches when amount and date are within the windows and the score passes the
                  threshold. Exact-hash matches always show.
                </>
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <NumberKnob
            label="Date window (days)"
            description="Maximum date gap between a transaction and a bank row. Most settlement lag fits in 3–7 days."
            value={thresholds.dateToleranceDays}
            min={0}
            max={30}
            step={1}
            disabled={loading}
            onChange={(v) =>
              setThresholds((t) => ({ ...t, dateToleranceDays: v }))
            }
          />
          <NumberKnob
            label="Amount window (%)"
            description="Maximum percentage gap between amounts. Catches FX spread and rounding. 0 = exact."
            value={thresholds.amountTolerancePct * 100}
            min={0}
            max={100}
            step={0.5}
            disabled={loading}
            onChange={(v) =>
              setThresholds((t) => ({
                ...t,
                amountTolerancePct: v / 100,
              }))
            }
          />
          <NumberKnob
            label="Amount floor"
            description="Minimum window in the transaction currency: max(amount × %, floor)."
            value={thresholds.amountToleranceFloor}
            min={0}
            max={10000}
            step={0.5}
            disabled={loading}
            onChange={(v) =>
              setThresholds((t) => ({ ...t, amountToleranceFloor: v }))
            }
          />
          <NumberKnob
            label="Min score"
            description="Pairs below this score are hidden. Higher = fewer, more precise matches. Default 0.6; 0.7+ is strict."
            value={thresholds.scoreThreshold}
            min={0}
            max={1}
            step={0.05}
            disabled={loading}
            onChange={(v) =>
              setThresholds((t) => ({ ...t, scoreThreshold: v }))
            }
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={onSave} disabled={saving || loading}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={saving || loading}>
              Reset
            </Button>
            {isDefault && !loading && (
              <span className="text-xs text-muted-foreground" data-keep="status">
                Defaults
              </span>
            )}
            {savedAt && (
              <span className="text-xs text-pos">Saved.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <ImportSettingsCard />

      <Card id="rules" className="scroll-mt-6">
        <CardHeader>
          <CardTitle icon={Zap} tone="amber">
            Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RulesSection />
        </CardContent>
      </Card>

      <div className="col-span-full">
      <Accordion value={tab} onValueChange={setTab}>
        <ImportTemplatesItem />
      </Accordion>
      </div>
    </SectionPage>
  );
}

function NumberKnob({
  label,
  description,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <Field
          label={label}
          info={description}
          infoLabel={`About ${label.toLowerCase()}`}
          control="amount"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          onValueChange={(nv) => {
            const n = parseFloat(nv);
            if (Number.isFinite(n)) onChange(n);
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-28"
          controlClassName="text-right font-mono"
        />
      </div>
    </div>
  );
}
