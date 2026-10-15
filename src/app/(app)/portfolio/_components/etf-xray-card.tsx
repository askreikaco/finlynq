"use client";

/**
 * ETF X-Ray sub-surface (FINLYNQ-118 Phase 3, dev-only).
 *
 * Extracted verbatim from portfolio/page.tsx. The look-through tabs
 * (Stocks / Regions / Sectors / Per ETF). The tab + stocks-page state stay
 * on the page (passed in) so the page keeps a single source of view-state;
 * the derived region/sector arrays are computed on the page and passed in.
 */

import { useState } from "react";
import { BarChart3, Building2, ChevronLeft, ChevronRight, Download, Globe2, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRow, SectionCard } from "@/components/mobile";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { Chart } from "@/components/chart";
import { exportStocksToCSV } from "./csv";
import { type EtfXrayTab, type OverviewData } from "../_types";
import { formatPercent, getDisplayLocale } from "@/lib/locale";

type ExposureRow = { name: string; pct: number; color: string };

/** Aggregated look-through stocks as native rows (one page at a time). A tap opens the stock's sheet. */
type EtfStock = {
  ticker: string;
  name: string;
  sector: string;
  country: string;
  effectiveWeight: number;
  effectiveValueDisplay: number;
  contributingEtfs: { symbol: string; weight: number }[];
};

function EtfStockRows({ rows, startIndex, displayCurrency }: { rows: EtfStock[]; startIndex: number; displayCurrency: string }) {
  const [open, setOpen] = useState<{ stock: EtfStock; index: number } | null>(null);
  return (
    <>
      <SectionCard list>
        {rows.map((s, i) => (
          <ListRow
            key={s.ticker}
            title={s.name}
            subtitle={[s.ticker !== "OTHER" ? s.ticker : null, s.sector, s.country].filter(Boolean).join(" · ")}
            value={<span className="tabular-nums text-sm font-semibold">{formatPercent(s.effectiveWeight, 1)}</span>}
            secondary={formatCurrency(s.effectiveValueDisplay, displayCurrency)}
            onPress={() => setOpen({ stock: s, index: startIndex + i })}
          />
        ))}
      </SectionCard>
      {open && (
        <Overlay
          variant="detail"
          open
          onClose={() => setOpen(null)}
          title={open.stock.name}
          subtitle={`#${open.index + 1}${open.stock.ticker !== "OTHER" ? ` · ${open.stock.ticker}` : ""}`}
          items={[
            { label: "Sector", value: open.stock.sector },
            { label: "Country", value: open.stock.country || "—" },
            { label: "Weight", value: formatPercent(open.stock.effectiveWeight, 1) },
            { label: "Value", value: formatCurrency(open.stock.effectiveValueDisplay, displayCurrency) },
            {
              label: "Via ETFs",
              value: open.stock.contributingEtfs.length
                ? open.stock.contributingEtfs.map((e) => `${e.symbol} ${e.weight}%`).join(", ")
                : "—",
            },
          ]}
        />
      )}
    </>
  );
}

export function EtfXrayCard({
  etfXray,
  etfXrayTab,
  setEtfXrayTab,
  stocksPage,
  setStocksPage,
  stocksPerPage,
  regionData,
  sectorData,
  displayCurrency,
}: {
  etfXray: OverviewData["etfXray"];
  etfXrayTab: EtfXrayTab;
  setEtfXrayTab: (t: EtfXrayTab) => void;
  stocksPage: number;
  setStocksPage: React.Dispatch<React.SetStateAction<number>>;
  stocksPerPage: number;
  regionData: ExposureRow[];
  sectorData: ExposureRow[];
  displayCurrency: string;
}) {
  const STOCKS_PER_PAGE = stocksPerPage;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col regular:flex-row regular:items-center justify-between gap-3">
          <div>
            <CardTitle
              icon={Layers}
              tone="violet"
              infoLabel="About ETF X-Ray"
              info={`Effective exposure across ${etfXray.etfCount} ETF${etfXray.etfCount !== 1 ? "s" : ""} in your portfolio. Stocks: your effective stock exposure across all ETFs, weighted by each ETF's portfolio allocation. ETFs: your ETF holdings and their weight in the ETF portfolio.`}
            >
              ETF X-Ray
            </CardTitle>
          </div>
          <div className="flex gap-1">
            {([
              { key: "stocks" as const, label: "Stocks", icon: BarChart3 },
              { key: "regions" as const, label: "Regions", icon: Globe2 },
              { key: "sectors" as const, label: "Sectors", icon: Building2 },
              { key: "etfs" as const, label: "Per ETF", icon: Layers },
            ]).map(tab => (
              <Button
                key={tab.key}
                variant={etfXrayTab === tab.key ? "primary" : "outline"}
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => setEtfXrayTab(tab.key)}
              >
                <tab.icon className="h-3 w-3 mr-1" />
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* ── Stocks Tab: Aggregated look-through ── */}
        {etfXrayTab === "stocks" && (
          <div className="space-y-4">
            <EtfStockRows
              rows={etfXray.aggregatedStocks.slice((stocksPage - 1) * STOCKS_PER_PAGE, stocksPage * STOCKS_PER_PAGE)}
              startIndex={(stocksPage - 1) * STOCKS_PER_PAGE}
              displayCurrency={displayCurrency}
            />
            {etfXray.aggregatedStocks.length > 0 && (() => {
              const totalPages = Math.ceil(etfXray.aggregatedStocks.length / STOCKS_PER_PAGE);
              const totalWeight = etfXray.aggregatedStocks.reduce((s, x) => s + x.effectiveWeight, 0);
              return (
                <div className="flex flex-col regular:flex-row items-start regular:items-center justify-between gap-2">
                  <p data-keep="data" className="text-xs text-muted-foreground">
                    {etfXray.aggregatedStocks.length} stocks · Total weight: {formatPercent(totalWeight, 1)}
                  </p>
                  <div className="flex items-center gap-2">
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button aria-label="Previous page"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={stocksPage <= 1}
                          onClick={() => setStocksPage(p => p - 1)}
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-1">
                          {stocksPage} / {totalPages}
                        </span>
                        <Button aria-label="Next page"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={stocksPage >= totalPages}
                          onClick={() => setStocksPage(p => p + 1)}
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => exportStocksToCSV(etfXray.aggregatedStocks, etfXray.etfTotalValueDisplay, displayCurrency)}
                    >
                      <Download className="h-3 w-3" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Regions Tab ── */}
        {etfXrayTab === "regions" && (
          <div className="space-y-4">
            {regionData.length > 0 ? (
              <Chart kind="donut" data={regionData} valueKey="pct" size="lg" formatValue={(v) => `${v}%`} breakdownList breakdownBars />
            ) : (
              <p data-keep="empty" className="text-sm text-muted-foreground text-center py-8">No region data available.</p>
            )}
          </div>
        )}

        {/* ── Sectors Tab ── */}
        {etfXrayTab === "sectors" && (
          <div className="space-y-4">
            {sectorData.length > 0 ? (
              <Chart kind="donut" data={sectorData} valueKey="pct" size="lg" formatValue={(v) => `${v}%`} breakdownList breakdownBars />
            ) : (
              <p data-keep="empty" className="text-sm text-muted-foreground text-center py-8">No sector data available.</p>
            )}
          </div>
        )}

        {/* ── Per ETF Tab ── */}
        {etfXrayTab === "etfs" && (
          <div className="space-y-3">
            <SectionCard list>
              {etfXray.etfs.map((etf) => (
                <ListRow
                  key={`${etf.symbol}-${etf.account}`}
                  title={etf.symbol}
                  subtitle={`${etf.fullName} · ${etf.account} · ${etf.totalHoldings.toLocaleString(getDisplayLocale())} holdings`}
                  value={<span className="tabular-nums text-sm font-semibold">{etf.weightPct}%</span>}
                  secondary="of portfolio"
                />
              ))}
            </SectionCard>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
