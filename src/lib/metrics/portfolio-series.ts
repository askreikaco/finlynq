import type { MonthPoint } from "./period";
import { cumulate, monthEndBalances, sumByMonth, valueAt } from "./series";

export type PerfSeries = { currency: string; series: ReadonlyArray<{ date: string; marketValue: number; costBasis: number }> };
export type DividendSeriesRow = { date: string; reportingAmount: number | null; reportingCurrency: string | null };
export type GainSeriesRow = { closeDate: string; realizedGainInBase?: number | null };

export type PortfolioMetricSeries = {
  value: MonthPoint[];
  cost: MonthPoint[];
  unrealized: MonthPoint[];
  realized: MonthPoint[];
  dividends: MonthPoint[];
  totalReturn: MonthPoint[];
};

/**
 * Monthly (month-end) series for the /portfolio summary cards, in the display currency:
 *  - total value / cost basis / unrealized G/L from the stored daily portfolio snapshots (/api/portfolio/performance),
 *    only when they were built in the display currency;
 *  - realized G/L and dividends as lifetime totals at each month end (running sum of the closed lots / dividend rows),
 *    only when every row carries a display-currency figure (a partial total would be a fake series);
 *  - total return = unrealized + realized + dividends, only when all three are known.
 * A series that cannot be derived honestly is [] (the card shows its value only).
 */
export function buildPortfolioSeries(input: {
  perf: PerfSeries | null;
  dividends: readonly DividendSeriesRow[] | null;
  gains: readonly GainSeriesRow[] | null;
  displayCurrency: string;
  throughMonth: string;
}): PortfolioMetricSeries {
  const { perf, dividends, gains, displayCurrency, throughMonth } = input;
  const ccy = displayCurrency.toUpperCase();
  const usable = !!perf && perf.currency.toUpperCase() === ccy && perf.series.length > 0;
  const value = usable ? monthEndBalances(perf!.series.map((p) => ({ date: p.date, value: p.marketValue })), throughMonth) : [];
  const cost = usable ? monthEndBalances(perf!.series.map((p) => ({ date: p.date, value: p.costBasis })), throughMonth) : [];
  const costByMonth = new Map(cost.map((p) => [p.month, p.value]));
  const unrealized = value.map((p) => ({ month: p.month, value: Math.round((p.value - (costByMonth.get(p.month) ?? 0)) * 100) / 100 }));

  const divOk = dividends != null && dividends.every((r) => r.reportingAmount != null && (r.reportingCurrency ?? ccy).toUpperCase() === ccy);
  const divFlow = divOk ? sumByMonth(dividends, (r) => r.date, (r) => r.reportingAmount ?? 0, throughMonth) : [];
  const dividendsCum = cumulate(divFlow);
  const gainOk = gains != null && gains.every((r) => r.realizedGainInBase != null);
  const gainFlow = gainOk ? sumByMonth(gains, (r) => r.closeDate, (r) => r.realizedGainInBase ?? 0, throughMonth) : [];
  const realizedCum = cumulate(gainFlow);

  const totalReturn =
    usable && divOk && gainOk
      ? unrealized.map((p) => ({
          month: p.month,
          value: Math.round((p.value + valueAt(realizedCum, p.month) + valueAt(dividendsCum, p.month)) * 100) / 100,
        }))
      : [];
  return { value, cost, unrealized, realized: realizedCum, dividends: dividendsCum, totalReturn };
}
