"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatDate } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import { prepareTimeSeries } from "@/lib/chart-series";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { fill } from "./section-labels";

interface Point {
  date: string;
  value: number;
}

interface Props {
  title: string;
  memberName: string;
  data: Point[];
  currency: string;
  color: string;
  gradientId: string;
}

/** Value-over-time area chart (recharts, same axis/tick helpers as the net-worth history chart). */
export function TrendChart({ title, memberName, data, currency, color, gradientId }: Props) {
  const prepared = useMemo(
    () => prepareTimeSeries<Point>(data, { dateKey: "date", valueKeys: ["value"] }),
    [data],
  );
  if (data.length < 2) return null;

  const first = data[0];
  const last = data[data.length - 1];
  // Text alternative for screen readers: the chart itself is decorative.
  const summary = fill(FAMILY_STRINGS.overview_chart_summary, {
    title,
    name: memberName,
    from: "from",
    start: `${formatDate(first.date)} ${formatCurrency(first.value, currency)}`,
    to: "to",
    end: `${formatDate(last.date)} ${formatCurrency(last.value, currency)}`,
  });

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs font-medium text-muted-foreground">{title}</figcaption>
      <div role="img" aria-label={summary} className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={prepared.data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(String(d))} minTickGap={48} tick={{ fontSize: 11 }} />
            <YAxis
              domain={prepared.domain}
              tickFormatter={(v) => formatCompactNumber(Number(v))}
              width={48}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v) => formatCurrency(Number(v), currency)}
              labelFormatter={(d) => formatDate(String(d))}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
