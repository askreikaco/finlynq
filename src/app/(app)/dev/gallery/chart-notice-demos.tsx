"use client";

/**
 * Gallery demos of the two families that replaced a dozen components each: Chart (every kind, every optional part
 * behind a switch) and Notice (every variant and tone, every optional part behind a switch).
 */

import { useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Chart, type ChartKind } from "@/components/chart";
import { Notice, type NoticeTone, type NoticeVariant } from "@/components/notice";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SPARK = [10, 12, 11, 15, 14, 18, 17, 21, 20, 24];
const SPARK_LABELS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const FLOW = MONTHS.map((label, i) => ({
  label,
  income: 5000 + i * 150,
  expenses: 3600 + ((i * 7) % 5) * 220,
  breakdown: [
    { name: "Housing", value: 1800 },
    { name: "Food", value: 620 + i * 20 },
  ],
}));
const STACK = MONTHS.map((label, i) => ({ label, a: 2200 + i * 80, b: 1400 + ((i * 3) % 4) * 100, c: 800 + i * 40 }));
const DONUT = [
  { name: "Housing", value: 1800 },
  { name: "Food", value: 620 },
  { name: "Transport", value: 340 },
  { name: "Fun", value: 280 },
  { name: "Other", value: 150 },
];
const SANKEY = {
  income: [{ name: "Salary", value: 5200 }, { name: "Side income", value: 600 }],
  expenses: [{ name: "Housing", value: 1800 }, { name: "Food", value: 620 }, { name: "Transport", value: 340 }, { name: "Fun", value: 280 }, { name: "Other", value: 400 }],
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field control="switch" label={label} checked={checked} onCheckedChange={onChange} />
  );
}

function Cell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium">{name}</p>
      {children}
    </div>
  );
}

export function ChartDemos() {
  const [p, setP] = useState({ legend: true, tooltip: true, axes: true, grid: true, target: true, delta: true, list: true, center: true });
  const set = (k: keyof typeof p) => (v: boolean) => setP((s) => ({ ...s, [k]: v }));
  const common = { legend: p.legend, tooltip: p.tooltip, axes: p.axes, grid: p.grid } as const;
  const kinds: { kind: ChartKind; name: string }[] = [
    { kind: "line", name: "line" },
    { kind: "area", name: "area" },
    { kind: "bar", name: "bar" },
  ];

  return (
    <div className="space-y-4" data-testid="gallery-chart">
      <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Chart parts">
        <Toggle label="legend" checked={p.legend} onChange={set("legend")} />
        <Toggle label="tooltip" checked={p.tooltip} onChange={set("tooltip")} />
        <Toggle label="axes" checked={p.axes} onChange={set("axes")} />
        <Toggle label="grid" checked={p.grid} onChange={set("grid")} />
        <Toggle label="target line" checked={p.target} onChange={set("target")} />
        <Toggle label="delta" checked={p.delta} onChange={set("delta")} />
        <Toggle label="breakdown list" checked={p.list} onChange={set("list")} />
        <Toggle label="centre total" checked={p.center} onChange={set("center")} />
      </div>

      <div className="grid grid-cols-1 gap-4 regular:grid-cols-2">
        <Cell name="sparkline (hover = tooltip)">
          <Chart kind="sparkline" values={SPARK} labels={p.tooltip ? SPARK_LABELS : undefined} color="#6366f1" delta={p.delta} />
        </Cell>
        <Cell name="sparkline tall, status colour">
          <Chart kind="sparkline" values={SPARK} status="completed" height={80} />
        </Cell>
        {kinds.map(({ kind, name }) => (
          <Cell key={kind} name={name}>
            <Chart
              kind={kind}
              data={FLOW}
              xKey="label"
              height={200}
              {...common}
              delta={p.delta}
              lines={p.target ? [{ y: 4000, label: "Target" }] : undefined}
              series={[
                { key: "income", name: "Income", color: "#10b981", breakdownKey: "breakdown" },
                { key: "expenses", name: "Expenses", color: "#f43f5e" },
              ]}
            />
          </Cell>
        ))}
        <Cell name="stacked-bar">
          <Chart
            kind="stacked-bar"
            data={STACK}
            xKey="label"
            height={200}
            {...common}
            series={[{ key: "a", name: "Housing" }, { key: "b", name: "Food" }, { key: "c", name: "Fun" }]}
          />
        </Cell>
        <Cell name="stacked-area (total in tooltip)">
          <Chart
            kind="stacked-area"
            data={STACK}
            xKey="label"
            height={200}
            {...common}
            tooltipTotal
            series={[{ key: "a", name: "Housing" }, { key: "b", name: "Food" }, { key: "c", name: "Fun" }]}
          />
        </Cell>
        <Cell name="bar, horizontal">
          <Chart kind="bar" horizontal data={DONUT} xKey="name" height={160} {...common} legend={false} series={[{ key: "value", name: "Spent", colorByRow: true }]} />
        </Cell>
        <Cell name="donut (+ list, bars, centre total)">
          <Chart kind="donut" data={DONUT} tooltip={p.tooltip} legend={p.legend} breakdownList={p.list} breakdownBars={p.list} center={p.center ? "total" : undefined} size="sm" />
        </Cell>
        <Cell name="donut in a narrow pane (container query: list drops below)">
          <div className="w-60 max-w-full">
            <Chart kind="donut" data={DONUT} breakdownList size="xs" center="total" />
          </div>
        </Cell>
        <Cell name="line in a narrow pane (ticks adapt)">
          <div className="w-60 max-w-full">
            <Chart kind="line" data={FLOW} xKey="label" height={160} series={[{ key: "income", name: "Income" }]} />
          </div>
        </Cell>
      </div>

      <Cell name="sankey (width follows its container)">
        <Chart kind="sankey" sankey={SANKEY} tooltip={p.tooltip} />
      </Cell>

      <Card title="progress">
        <div className="space-y-3">
          <Chart kind="progress" value={65} label="Primary, with value" valueLabel ariaLabel="Primary" />
          <Chart kind="progress" value={90} tone="warning" size="lg" label="Warning, large, target at 80%" valueLabel target={p.target ? 80 : undefined} ariaLabel="Warning" />
          <Chart kind="progress" value={120} tone="destructive" size="sm" label="Destructive (clamped)" valueLabel ariaLabel="Over" />
          <Chart kind="progress" value={40} tone="pos" trackTone="destructive" size="xs" label="Paid vs remaining" ariaLabel="Paid" />
          <Chart kind="progress" value={55} status="overdue" label="Status colour" ariaLabel="Status" />
          <Chart kind="progress" value={30} color="#8b5cf6" label="Custom colour" ariaLabel="Custom" />
        </div>
      </Card>
    </div>
  );
}

const TONES: NoticeTone[] = ["info", "success", "warning", "danger", "neutral"];

export function NoticeDemos() {
  const [tone, setTone] = useState<NoticeTone>("info");
  const [parts, setParts] = useState({ icon: true, title: true, body: true, info: true, action: true, secondary: false, dismissible: true });
  const [round, setRound] = useState(0);
  const set = (k: keyof typeof parts) => (v: boolean) => setParts((s) => ({ ...s, [k]: v }));
  const common = {
    tone,
    icon: parts.icon ? undefined : null,
    title: parts.title ? "Title" : undefined,
    info: parts.info ? "Longer help lives behind the (i); the body stays one short line." : undefined,
    action: parts.action ? { label: "Action", onClick: () => {} } : undefined,
    secondaryAction: parts.secondary ? { label: "Later", onClick: () => {} } : undefined,
    dismissible: parts.dismissible,
  };
  const body = parts.body ? "Short body text." : undefined;
  const variants: NoticeVariant[] = ["inline", "banner", "card"];

  return (
    <div className="space-y-4" data-testid="gallery-notice">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tone">
        {TONES.map((t) => (
          <Button key={t} size="sm" variant={tone === t ? "primary" : "outline"} onClick={() => setTone(t)}>{t}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRound((r) => r + 1)}>Reset dismissed</Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Notice parts">
        <Toggle label="icon" checked={parts.icon} onChange={set("icon")} />
        <Toggle label="title" checked={parts.title} onChange={set("title")} />
        <Toggle label="body" checked={parts.body} onChange={set("body")} />
        <Toggle label="info (i)" checked={parts.info} onChange={set("info")} />
        <Toggle label="action" checked={parts.action} onChange={set("action")} />
        <Toggle label="secondary action" checked={parts.secondary} onChange={set("secondary")} />
        <Toggle label="dismissible" checked={parts.dismissible} onChange={set("dismissible")} />
      </div>

      <div key={round} className="grid grid-cols-1 gap-4 regular:grid-cols-2">
        {variants.map((v) => (
          <Cell key={v} name={`variant="${v}"`}>
            <Notice variant={v} {...common}>{body}</Notice>
          </Cell>
        ))}
        <Cell name={`variant="inline" · tone danger · role alert`}>
          <Notice tone="danger">Could not save. Try again.</Notice>
        </Cell>
        <Cell name="variant=&quot;empty&quot;">
          <Card>
            <Notice variant="empty" icon={Inbox} title="Nothing here" action={{ label: "Add", onClick: () => {} }} info={parts.info ? "Empty states keep one short line; anything longer goes behind the (i)." : undefined}>
              Add your first item.
            </Notice>
          </Card>
        </Cell>
        <Cell name={`variant="error" · retry`}>
          <Card>
            <Notice variant="error" retry={() => {}} />
          </Card>
        </Cell>
        <Cell name="items (onboarding tips: per-item dismiss, collapsible)">
          <Notice
            variant="card"
            icon={null}
            collapsible
            title="Tips for getting started"
            items={[
              { id: "g1", title: "First tip", body: "One short sentence.", action: { label: "Open", href: "/accounts" } },
              { id: "g2", title: "Second tip" },
            ]}
          />
        </Cell>
        <Cell name={`variant="skeleton" skeleton="list"`}>
          <Notice variant="skeleton" skeleton="list" rows={2} />
        </Cell>
        <Cell name={`variant="skeleton" skeleton="cards"`}>
          <Notice variant="skeleton" skeleton="cards" rows={2} />
        </Cell>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Fixed placements (top pill, bottom-start card, bottom-end pill) and self-fetching feeds are mounted as
        {" "}<code>{`<Notice source="announcement | currency-audit | passkey-lock | reporting-recompute | tips:dashboard" />`}</code>.
      </p>
    </div>
  );
}
