"use client";

import React, { useEffect, useRef, useState } from "react";
import { DevModeGuard } from "@/components/dev-mode-guard";
import { useSizeClass } from "@/components/ui/size-class";
import { PageHeader } from "@/components/mobile/page-header";
import { PageToolbar } from "@/components/page-toolbar";
import type { RangeSelection } from "@/lib/metrics/period";
import { SectionCard } from "@/components/mobile/section-card";
import { CARD_ROW_GRID } from "@/components/mobile/section-card";
import { SectionLabel } from "@/components/mobile/section-label";
import { ListRow } from "@/components/mobile/list-row";
import { AccountRow } from "@/components/mobile/account-row";
import { HoldingRow } from "@/components/mobile/holding-row";
import { TxRow } from "@/components/mobile/tx-row";
import { Amount } from "@/components/mobile/amount";
import { InsetRow } from "@/components/mobile/inset-row";
import { PillButton } from "@/components/mobile/pill-button";
import { MetricGrid, metricGridClass, METRIC_GRID_CLASS } from "@/components/mobile/metric-grid";
import { MetricCard, MetricCardSkeleton, METRIC_TONES, PctBadge, type MetricCardProps, type MetricTone } from "@/components/metric-card";
import { Sparkline } from "@/components/sparkline";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { TW } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Bell, CalendarClock, DollarSign, Inbox, LogOut, Pencil, PiggyBank, Plus, Repeat, Settings, ShoppingCart, TrendingUp, Trash2, Wallet } from "lucide-react";
import { Overlay } from "@/components/ui/overlay";
import { COLOR_TOKENS, GALLERY_SECTIONS } from "./sections";
import { FieldsGallery } from "./fields";
import { Field } from "@/components/ui/field";

const SPARK = [10, 12, 11, 15, 14, 18, 17, 21, 20, 24];
const SPARK_LABELS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const TONES = Object.keys(METRIC_TONES) as MetricTone[];

/** Section wrapper: anchor id, title, source-file label. */
function Group({ id, title, file, span, children }: { id: string; title: string; file: string; span?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} data-gallery-section={id} className={cn("scroll-mt-16 min-w-0 space-y-3", span && "col-span-full")}>
      <div>
        <SectionLabel>{title}</SectionLabel>
        <p className="px-1 text-[11px] text-muted-foreground">{file}</p>
      </div>
      {children}
    </section>
  );
}

/** Small caption + live example. */
function Item({ name, file, children }: { name: string; file?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium">
        {name} {file && <span className="font-normal text-muted-foreground">· {file}</span>}
      </p>
      {children}
    </div>
  );
}

function Swatch({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState("");
  useEffect(() => {
    const read = () => {
      if (ref.current) setVal(getComputedStyle(ref.current).getPropertyValue(`--${name}`).trim());
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, [name]);
  return (
    <div ref={ref} className="min-w-0">
      <div className="h-10 rounded-lg border border-border" style={{ background: `var(--${name})` }} />
      <p className="mt-1 truncate text-[11px] font-medium">--{name}</p>
      <p className="truncate text-[10px] text-muted-foreground">{val || "n/a"}</p>
    </div>
  );
}

/** Every optional part of the one MetricCard, as a switch. */
const METRIC_PARTS = [
  ["info", "Info tip"],
  ["action", "Action"],
  ["hero", "Hero size"],
  ["delta", "Delta"],
  ["sub", "Sub-line"],
  ["note", "Note"],
  ["spark", "Sparkline"],
  ["progress", "Progress"],
  ["href", "Link"],
  ["loading", "Loading"],
] as const;
type MetricPart = (typeof METRIC_PARTS)[number][0];

/** Switches in, ONE MetricCard out: each part shows only when its prop is given. */
function MetricPlayground() {
  const [parts, setParts] = useState<Record<MetricPart, boolean>>({
    info: false, action: false, hero: false, delta: true, sub: true, note: false, spark: true, progress: false, href: false, loading: false,
  });
  const toggle = (k: MetricPart) => setParts((p) => ({ ...p, [k]: !p[k] }));
  const card: MetricCardProps = {
    label: "Net worth",
    icon: Wallet,
    tone: "indigo",
    value: 125000,
    ...(parts.info ? { info: "Assets minus liabilities." } : {}),
    ...(parts.action ? { action: <Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil className="size-3.5" /></Button> } : {}),
    ...(parts.hero ? { size: "hero" as const } : {}),
    ...(parts.delta ? { delta: { pct: 1.9, text: "+$2,300 vs last month" } } : {}),
    ...(parts.sub && !parts.delta ? { sub: "As of today" } : {}),
    ...(parts.note ? { note: "Second note line" } : {}),
    ...(parts.spark ? { sparkData: SPARK, sparkLabels: SPARK_LABELS, sparkColor: "#6366f1" } : {}),
    ...(parts.progress ? { progress: { value: 64, caption: "64% of goal" } } : {}),
    ...(parts.href ? { href: "/dashboard" } : {}),
    ...(parts.loading ? { loading: true } : {}),
  };
  return (
    <div className="grid gap-4 regular:grid-cols-[14rem_minmax(0,1fr)]" data-testid="metric-playground">
      <div className="space-y-2 rounded-xl border border-border/50 p-3">
        {METRIC_PARTS.map(([k, name]) => (
          <Field key={k} control="switch" label={name} checked={parts[k]} onCheckedChange={() => toggle(k)} />
        ))}
      </div>
      <div className="min-w-0 self-start">
        <MetricCard {...card} />
      </div>
    </div>
  );
}

function GalleryContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeClass = useSizeClass(containerRef as React.RefObject<HTMLElement>);
  const [width, setWidth] = useState(0);
  const [overlay, setOverlay] = useState<"confirm" | "confirm-neutral" | "form" | "form-dialog" | "form-sheet" | "detail" | "picker" | null>(null);
  const closeOverlay = () => setOverlay(null);
  const [on, setOn] = useState(true);
  const [acc, setAcc] = useState<string | null>("one");

  useEffect(() => {
    if (containerRef.current) setWidth(containerRef.current.clientWidth);
  }, [sizeClass]);

  const metrics = [
    { id: "g1", label: "Net worth", icon: Wallet, value: 125000, currency: "USD", tone: "indigo" as const, sub: "+$1,200 vs last month", delta: { pct: 1.9 }, sparkData: SPARK, sparkColor: "#6366f1" },
    { id: "g2", label: "Income", icon: TrendingUp, value: 5200, currency: "USD", tone: "emerald" as const, valueTone: "pos" as const },
    { id: "g3", label: "Spent", icon: DollarSign, value: 3100, currency: "USD", tone: "rose" as const, delta: { pct: 4.2, invert: true } },
    { id: "g4", label: "Savings", icon: PiggyBank, value: "32%", tone: "amber" as const },
  ];

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-background" style={{ minWidth: "100%" }}>
      <div className="w-full space-y-6 p-4">
        <PageHeader title="Component Gallery" info={`Size class: ${sizeClass}`} />

        <nav
          aria-label="Gallery index"
          data-testid="gallery-index"
          className="glass-bar sticky top-0 z-20 -mx-1 flex flex-wrap gap-1.5 rounded-xl border border-border/50 px-2 py-2"
        >
          {GALLERY_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted/70">
              {s.label}
            </a>
          ))}
        </nav>

        <div className={TW.grid3}>
          <Group id="metric" title="MetricCard" file="components/metric-card.tsx · mobile/metric-grid.tsx" span>
            <Item name="One component, every part optional" file="switch a part on / off">
              <MetricPlayground />
            </Item>
            <Item name="Combinations" file="same MetricCard, different props">
              <div className="grid gap-3 regular:grid-cols-2 wide:grid-cols-3">
                <MetricCard label="Value only" icon={Wallet} tone="indigo" value={25000} />
                <MetricCard label="Value + sub" icon={Wallet} tone="cyan" value={25000} sub="Checking" />
                <MetricCard label="Delta (less is better)" icon={DollarSign} tone="rose" value={3100} delta={{ pct: 4.2, text: "+$124 vs last month", invert: true }} note="Second note line" />
                <MetricCard label="Sparkline + delta + link" icon={TrendingUp} tone="emerald" value={150000} delta={{ pct: 8.5, text: "+$4,000 vs last month" }} sparkData={SPARK} sparkLabels={SPARK_LABELS} sparkColor="#10b981" href="/portfolio" />
                <MetricCard label="Progress" icon={PiggyBank} tone="amber" value={800} sub="of $1,000" progress={{ value: 80, tone: "warning", caption: "80% spent" }} />
                <MetricCard label="Info + action" icon={Wallet} tone="violet" value={4200} info="Shown in the label row." action={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil className="size-3.5" /></Button>} />
                <MetricCard label="Loading" icon={Wallet} tone="cyan" value={0} loading />
                <MetricCardSkeleton />
              </div>
            </Item>
            <Item name="Hero size" file="size=&quot;hero&quot;">
              <MetricCard label="Hero" icon={Wallet} tone="violet" value={275000} size="hero" delta={{ pct: 3.4, text: "+$9,200 vs last month" }} sparkData={SPARK} sparkLabels={SPARK_LABELS} sparkColor="#8b5cf6" progress={{ value: 55, caption: "55% of goal" }} />
            </Item>
            <Item name="Tones" file="METRIC_TONES">
              <div className="grid grid-cols-2 gap-3 regular:grid-cols-4 wide:grid-cols-7">
                {TONES.map((t) => (
                  <MetricCard key={t} label={t} icon={Wallet} tone={t} value={t} />
                ))}
              </div>
            </Item>
            <Item name="MetricGrid (4 items)" file="mobile/metric-grid.tsx">
              <MetricGrid metrics={metrics} />
            </Item>
            <Item name="MetricGrid columns=3, 3 items">
              <MetricGrid metrics={metrics.slice(0, 3)} columns={3} />
            </Item>
            <Item name="PctBadge">
              <div className="flex gap-3">
                <PctBadge pct={5.2} />
                <PctBadge pct={-3.1} />
                <PctBadge pct={5.2} invert />
              </div>
            </Item>
          </Group>

          <Group id="section-card" title="SectionCard / ListRow" file="mobile/section-card.tsx · mobile/list-row.tsx · mobile/inset-row.tsx" span>
            <div className={TW.grid3}>
              <Item name="Label inside (default)" file="labelPlacement">
                <SectionCard label="Label inside" icon={Wallet} tone="indigo">
                  <p className="text-sm">Body content. The label is the card&apos;s first row.</p>
                </SectionCard>
              </Item>
              <Item name="Label outside" file='labelPlacement="outside"'>
                <SectionCard label="Label outside" labelPlacement="outside">
                  <p className="text-sm">The label sits above the card box (px-4).</p>
                </SectionCard>
              </Item>
              <Item name="Outside + bare" file="bare">
                <SectionCard label="Bare" labelPlacement="outside" bare>
                  <p className="px-4 text-sm">No card surface; label and body sit on the page.</p>
                </SectionCard>
              </Item>
              <Item name="Description inside" file="description">
                <SectionCard label="Plan" description="Billed monthly, renews on the 1st.">
                  <p className="text-sm">Follows the label: inside the card.</p>
                </SectionCard>
              </Item>
              <Item name="Description outside" file='labelPlacement="outside"'>
                <SectionCard label="Plan" labelPlacement="outside" description="Billed monthly, renews on the 1st.">
                  <p className="text-sm">Follows the label: under the heading.</p>
                </SectionCard>
              </Item>
              <Item name="Description placement override" file="descriptionPlacement">
                <SectionCard label="Plan" labelPlacement="outside" description="Billed monthly." descriptionPlacement="inside">
                  <p className="text-sm">Outside label, description inside the card.</p>
                </SectionCard>
              </Item>
              <Item name="InfoTip inside" file="info">
                <SectionCard label="Budget" info="Resets on the first of each month." icon={PiggyBank} tone="amber">
                  <p className="text-sm">(i) next to the label.</p>
                </SectionCard>
              </Item>
              <Item name="InfoTip outside" file="info">
                <SectionCard label="Budget" labelPlacement="outside" info="Resets on the first of each month.">
                  <p className="text-sm">(i) next to the outside label.</p>
                </SectionCard>
              </Item>
              <Item name="Description + InfoTip + action" file="description, info, action">
                <SectionCard label="Everything" info="Tap the icon for help." description="One line under the label." action={<Button size="sm" variant="ghost">Edit</Button>}>
                  <p className="text-sm">All options together.</p>
                </SectionCard>
              </Item>
              <Item name="No label" file="plain card">
                <SectionCard>
                  <p className="text-sm">No label (padded body only).</p>
                </SectionCard>
              </Item>
            </div>
            <Item name="list, label inside (ListRow)" file="list">
              <SectionCard label="Accounts" list icon={Wallet} tone="indigo">
                <ListRow title="Checking" value={<Amount value={2500} />} icon={Wallet} href="/accounts" />
                <ListRow title="Savings" subtitle="Primary" value={<Amount value={10000} />} secondary="+1.2%" secondaryTone="pos" icon={PiggyBank} href="/accounts" />
                <ListRow title="Card" value={<Amount value={-420.5} />} secondary="due" secondaryTone="neg" initials="CC" onPress={() => setOverlay("detail")} />
              </SectionCard>
            </Item>
            <div className={TW.grid3}>
              <Item name="list, label outside, edge-to-edge InsetRow" file="list + InsetRow">
                <SectionCard label="Explore" labelPlacement="outside" list>
                  <InsetRow href="/reports" label="Reports" icon={TrendingUp} />
                  <InsetRow href="/goals" label="Goals" icon={PiggyBank} badge={2} />
                  <InsetRow href="/settings" label="Settings" icon={Inbox} value="On" />
                </SectionCard>
              </Item>
              <Item name="list, label inside, InsetRow" file="list + InsetRow">
                <SectionCard label="Tools" list description="Descriptions fit lists too." icon={Plus} tone="amber">
                  <InsetRow href="/import" label="Import" icon={Inbox} />
                  <InsetRow destructive icon={Wallet} label="Log out" onClick={() => {}} />
                </SectionCard>
              </Item>
            </div>
            <Item name="CARD_ROW_GRID" file="regular: 2 columns, wide: 3">
              <SectionCard label="CARD_ROW_GRID" list className={CARD_ROW_GRID}>
                {["A", "B", "C", "D"].map((n) => (
                  <ListRow key={n} title={`Row ${n}`} value={<Amount value={100} />} initials={n} />
                ))}
              </SectionCard>
            </Item>
            <Item name="Amount / PillButton">
              <div className="flex flex-wrap items-center gap-3">
                <Amount value={1234.56} />
                <Amount value={-100.5} />
                <Amount value={0} />
                <Amount value={5000000} currency="EUR" />
                <PillButton>All</PillButton>
                <PillButton>Income</PillButton>
              </div>
            </Item>
          </Group>

          <Group id="list-row" title="ListRow" file="mobile/list-row.tsx" span>
            <p className="text-xs text-muted-foreground">
              One row for every list. Each part shows when its prop is given: leading (icon tile, initials, status dot), title, subtitle,
              value + secondary, chart, progress bar + label, delta, count, badge, unread, trailing, actions, chevron, link / button,
              selected, size, shape. AccountRow, HoldingRow and TxRow only map data to these props.
            </p>
            <div className="grid grid-cols-1 items-start gap-6 regular:grid-cols-2">
              <SectionCard label="Leading" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <ListRow icon={Wallet} title="Icon tile" subtitle="icon" />
                <ListRow icon={ShoppingCart} tile="neg" title="Tile tone neg" subtitle="tile=&quot;neg&quot;" />
                <ListRow initials="CC" title="Initials" subtitle="initials (avatar)" />
                <ListRow dot="var(--pos)" title="Status dot" subtitle="dot=var(--pos)" />
                <ListRow title="No leading" subtitle="title and subtitle only" />
              </SectionCard>
              <SectionCard label="Trailing" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <ListRow icon={Wallet} title="Value" value={<Amount value={2500} />} />
                <ListRow icon={PiggyBank} title="Value + secondary" subtitle="Primary" value={<Amount value={10000} />} secondary="+1.2%" secondaryTone="pos" />
                <ListRow icon={Bell} title="Quiet value" value="Pro plan" quietValue />
                <ListRow icon={Bell} title="Unread" unread={3} href="/dev/gallery" />
                <ListRow title="Count and badge" count={4} badge={<Badge variant="outline" className="text-xs">new</Badge>} />
                <ListRow icon={Settings} title="Trailing node" trailing={<Field control="switch" checked={on} onCheckedChange={setOn} aria-label="Demo switch" />} />
              </SectionCard>
              <SectionCard label="Behaviour" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <ListRow icon={Wallet} title="Link row (href)" subtitle="chevron by default" href="/dev/gallery" />
                <ListRow icon={PiggyBank} title="Button row (onPress)" subtitle="opens the sheet" onPress={() => setOverlay("detail")} />
                <ListRow icon={Wallet} title="Selected (split view)" subtitle="selected" selected onPress={() => {}} />
                <ListRow icon={Wallet} title="Disabled" disabled onPress={() => {}} />
                <ListRow icon={Wallet} title="Dimmed (archived)" dimmed href="/dev/gallery" chevron={false} />
                <ListRow icon={Plus} tone="accent" title="Accent action" onPress={() => {}} chevron={false} />
                <ListRow icon={LogOut} tone="destructive" title="Destructive action" onPress={() => {}} />
                <ListRow icon={Trash2} title="Row with actions" subtitle="buttons sit outside the link" actions={<Button size="sm" variant="outline">Delete</Button>} />
                <ListRow title="Select" subtitle="click toggles the checkbox" select={{ checked: on, onToggle: () => setOn((v) => !v), label: "Select demo row" }} />
              </SectionCard>
              <SectionCard label="Size and shape" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <ListRow icon={Wallet} title="Regular (56px, 44px compact)" value={<Amount value={100} />} />
                <ListRow size="dense" icon={Wallet} title="Dense (44px)" value={<Amount value={100} />} />
                <div className="space-y-2 p-3">
                  <ListRow shape="rounded" icon={Wallet} title="Rounded" className="bg-muted/40" value={<Amount value={100} />} />
                  <ListRow icon={Wallet} title="Square (default)" className="bg-muted/40" value={<Amount value={100} />} />
                </div>
              </SectionCard>
              <SectionCard label="Chart, progress, delta" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <ListRow
                  dot="var(--primary)"
                  title="Category row"
                  trend={SPARK}
                  trendLabels={SPARK_LABELS}
                  trendColor="#6366f1"
                  currency="EUR"
                  value="$400.00"
                  delta="+$50.00 (+14%)"
                  deltaTone="text-destructive"
                  progress={{ pct: 80, tone: "warning", label: "Left $100.00", aria: "Budget used" }}
                  count={3}
                  href="/dev/gallery"
                />
                <ListRow
                  dot="var(--primary)"
                  title="Goal row"
                  subtitle="Due 2026-12-31"
                  trend={null}
                  value="$2,000.00"
                  delta="of $5,000.00"
                  progress={{ pct: 40, tone: "warning", label: "40%", aria: "Goal saved" }}
                  chevron={false}
                  onPress={() => {}}
                />
                <ListRow
                  dot="var(--pos)"
                  title="Loan row (paid off)"
                  subtitle="4.5% · $350.00 monthly"
                  strike
                  trend={SPARK}
                  trendColor="#f43f5e"
                  value="$0.00"
                  delta="Paid off"
                  progress={{ pct: 100, tone: "pos", label: "100%", aria: "Loan paid" }}
                  chevron={false}
                  onPress={() => {}}
                />
              </SectionCard>
              <SectionCard label="Domain wrappers" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                <AccountRow accountId={1} accountName="Checking" alias="TCB" currency="EUR" balance={2500} displayCurrency="EUR" type="asset" />
                <AccountRow accountId={2} accountName="Credit card" currency="GBP" balance={-420.5} convertedBalance={-495} displayCurrency="EUR" type="liability" />
                <HoldingRow name="AAPL" marketValue={5000} unrealizedPct={5.5} currency="EUR" onPress={() => setOverlay("detail")} />
                <TxRow icon={ShoppingCart} tile="muted" title="Groceries" subtitle="Food · Checking" amount={-54.3} currency="EUR" />
                <TxRow icon={Repeat} tile="warn" title="Netflix" subtitle="monthly · next Nov 1" amount={-15.99} currency="EUR" meta="per month" onPress={() => {}} />
                <TxRow icon={CalendarClock} tile="pos" title="Salary" subtitle="Income" amount={3200} currency="EUR" amountTone="pos" showSign />
              </SectionCard>
              <SectionCard label="CARD_ROW_GRID" padded={false} className={cn("[&>*:not(:last-child)]:shadow-[var(--list-divider)] ", CARD_ROW_GRID)}>
                {["A", "B", "C", "D"].map((n) => (
                  <ListRow key={n} title={`Row ${n}`} value={<Amount value={100} />} initials={n} />
                ))}
              </SectionCard>
            </div>
          </Group>

          <Group id="shadow" title="Card shadow token" file="ui/card.tsx · .surface-card · --shadow-card">
            <Card>
              <CardHeader><CardTitle>Card</CardTitle></CardHeader>
              <CardContent className="text-sm">Standard Card: surface-card + var(--shadow-card).</CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="pt-4 text-sm">Muted variant</CardContent>
            </Card>
            <div className="surface-card rounded-xl border border-border/50 p-4 text-sm">.surface-card utility</div>
          </Group>

          <Group id="buttons" title="Buttons / Badges" file="ui/button.tsx · ui/badge.tsx">
            <Item name="Button variants">
              <div className="flex flex-wrap gap-2">
                {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map((v) => (
                  <Button key={v} variant={v}>{v}</Button>
                ))}
              </div>
            </Item>
            <Item name="Button sizes">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs">xs</Button><Button size="sm">sm</Button><Button>default</Button><Button size="lg">lg</Button>
                <Button size="icon" aria-label="Add"><Plus /></Button>
                <Button disabled>disabled</Button>
              </div>
            </Item>
            <Item name="Badge variants">
              <div className="flex flex-wrap gap-2">
                {(["default", "secondary", "destructive", "outline", "ghost", "link"] as const).map((v) => (
                  <Badge key={v} variant={v}>{v}</Badge>
                ))}
              </div>
            </Item>
          </Group>

          <Group id="forms" title="Field" file="ui/field/ · one component for every form input" span>
            <FieldsGallery />
          </Group>

          <Group id="overlays" title="Overlay" file="ui/overlay.tsx (variant: confirm | form | detail | picker; presentation: auto | dialog | sheet-right)">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOverlay("confirm")}>Confirm (destructive)</Button>
              <Button variant="outline" onClick={() => setOverlay("confirm-neutral")}>Confirm (neutral)</Button>
              <Button variant="outline" onClick={() => setOverlay("form")}>Form (auto)</Button>
              <Button variant="outline" onClick={() => setOverlay("form-dialog")}>Form (dialog)</Button>
              <Button variant="outline" onClick={() => setOverlay("form-sheet")}>Form (sheet-right)</Button>
              <Button variant="outline" onClick={() => setOverlay("detail")}>Detail</Button>
              <Button variant="outline" onClick={() => setOverlay("picker")}>Picker</Button>
            </div>
            <Overlay
              variant="confirm"
              open={overlay === "confirm"}
              onClose={closeOverlay}
              title="Delete item"
              message="This cannot be undone."
              onConfirm={closeOverlay}
            />
            <Overlay
              variant="confirm"
              destructive={false}
              open={overlay === "confirm-neutral"}
              onClose={closeOverlay}
              title="Switch display currency?"
              message="Reports are recalculated in the background."
              confirmLabel="Switch"
              onConfirm={closeOverlay}
            />
            <Overlay
              open={overlay === "form" || overlay === "form-dialog" || overlay === "form-sheet"}
              onClose={closeOverlay}
              presentation={overlay === "form-dialog" ? "dialog" : overlay === "form-sheet" ? "sheet-right" : "auto"}
              title="Edit rule"
              info="The info tip is the only place explanatory text goes."
              actions={[
                { label: "Cancel" },
                { label: "Save", kind: "primary", onClick: closeOverlay },
              ]}
            >
              <div className="space-y-1.5">
                <Field label="Name" placeholder="Rule name" />
              </div>
            </Overlay>
            <Overlay
              variant="detail"
              open={overlay === "detail"}
              onClose={closeOverlay}
              title="Checking"
              subtitle="Account"
              items={[{ label: "Account", value: "Checking" }, { label: "Balance", value: <Amount value={2500} /> }]}
            >
              <Button variant="outline">Edit</Button>
              <Button variant="outline" className="text-destructive">Delete</Button>
            </Overlay>
            <Overlay
              variant="picker"
              open={overlay === "picker"}
              onClose={closeOverlay}
              title="Select currency"
              toolbar={<Field aria-label="Search currency" placeholder="Search currency..." />}
              bodyClassName="py-4"
            >
              {["USD", "EUR", "VND"].map((c) => (
                <Button key={c} variant="ghost" className="w-full justify-start" onClick={closeOverlay}>
                  {c}
                </Button>
              ))}
            </Overlay>
          </Group>

          <Group id="topbar" title="Top bar" file="mobile/page-header.tsx (PageHeader) · .glass-bar · .page-header-bleed" span>
            <p className="px-1 text-xs text-muted-foreground" data-testid="topbar-anatomy">
              One component on every page. Left to right: [Back] [Title (i)] ........ [More + Filter or Bulk edit] [Primary]. Back
              shows on every non-root page. Title is required; the (i) tooltip is the <code>info</code> prop. Actions are props
              only: <code>primary</code> (one Add / Edit / Save), <code>more</code>, <code>filter</code>, <code>bulkEdit</code>.
            </p>
            <TopBarDemos />
            <p className="px-1 text-[11px] text-muted-foreground">Live PageHeader: top of this page (the gallery is a child of More, so it shows the automatic back).</p>
          </Group>

          <Group id="toolbar" title="Page toolbar" file="page-toolbar.tsx" span>
            <ToolbarDemo />
            <p className="px-1 text-[11px] text-muted-foreground">
              Toolbar: range, month, search, filter. A separate component below the top bar. The top bar's own actions
              (primary, More, Filter / Bulk edit) are shown in the Top bar section.
            </p>
          </Group>

          <Group id="pages" title="Page patterns" file="components/templates/*.tsx">
            <SectionCard label="Templates">
              <ul className="space-y-1 text-sm">
                <li>SectionPage: section-page.tsx (width/stack/grid; TW.grid3 body)</li>
                <li>FormPage: form-page.tsx (load/save/delete, dirty guard)</li>
                <li>HubPage: hub-page.tsx (grouped rows)</li>
                <li>ListPage, DetailPage, ReportPage: templates/</li>
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">Listed only: they need routing, data and nav context to mount.</p>
            </SectionCard>
          </Group>

          <Group id="charts" title="Sparkline / Progress" file="components/sparkline.tsx · ui/progress.tsx">
            <Item name="Sparkline (hover tooltip)">
              <Sparkline data={SPARK} labels={SPARK_LABELS} color="#6366f1" currency="USD" />
            </Item>
            <Item name="Sparkline tall">
              <Sparkline data={SPARK} color="#10b981" height={80} className="h-[80px] w-full" />
            </Item>
            <Progress value={65}><ProgressLabel>Progress</ProgressLabel><ProgressValue /></Progress>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-8 flex-1 rounded-md" style={{ background: `var(--chart-${n})` }} />
              ))}
            </div>
          </Group>

          <Group id="states" title="Empty / Error / Alert" file="empty-state.tsx · error-state.tsx · ui/alert.tsx">
            <SectionCard><EmptyState icon={Inbox} title="Nothing here" description="Add your first item." action={{ label: "Add", onClick: () => {} }} /></SectionCard>
            <SectionCard><ErrorState onRetry={() => {}} /></SectionCard>
            <Alert><AlertTitle>Alert</AlertTitle><AlertDescription>Default alert.</AlertDescription></Alert>
            <Alert variant="destructive"><AlertTitle>Alert</AlertTitle><AlertDescription>Destructive alert.</AlertDescription></Alert>
          </Group>

          <Group id="controls" title="Tabs / Toggles / Accordion" file="ui/tabs.tsx · switch.tsx · accordion.tsx · separator.tsx">
            <Tabs defaultValue="one">
              <TabsList><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList>
              <TabsContent value="one" className="text-sm">Panel one</TabsContent>
              <TabsContent value="two" className="text-sm">Panel two</TabsContent>
            </Tabs>
            <Tabs defaultValue="one">
              <TabsList variant="line"><TabsTrigger value="one">Line</TabsTrigger><TabsTrigger value="two">Tabs</TabsTrigger></TabsList>
            </Tabs>
            <Field control="switch" label="Switch" checked={on} onCheckedChange={setOn} />
            <Separator />
            <Accordion value={acc} onValueChange={setAcc}>
              <AccordionItem value="one" title="Accordion item">Content</AccordionItem>
              <AccordionItem value="two" title="Second item">More content</AccordionItem>
            </Accordion>
          </Group>

          <Group id="info-tip" title="InfoTip" file="ui/info-tip.tsx">
            <div className="flex items-center gap-1 text-sm font-semibold">
              Standalone
              <InfoTip label="About standalone" text="Tap, click or focus the icon to read the help text." />
            </div>
            <SectionCard label="On a card label" info="Pass `info` to SectionCard to put it next to the label.">
              <p className="text-sm">See the SectionCard group for every placement.</p>
            </SectionCard>
          </Group>

          <Group id="skeleton" title="Skeleton / Shimmer" file="page-skeleton.tsx · .animate-shimmer">
            <div className="h-6 w-2/3 animate-shimmer rounded-md" />
            <div className="h-16 w-full animate-shimmer rounded-xl" />
            <PageSkeleton variant="list" rows={2} />
          </Group>

          <Group id="colors" title="Color tokens" file="app/globals.css :root / .dark" span>
            <div className="grid grid-cols-3 gap-3 regular:grid-cols-6 wide:grid-cols-8">
              {COLOR_TOKENS.map((n) => <Swatch key={n} name={n} />)}
            </div>
          </Group>

          <Group id="type" title="Typography" file="Tailwind scale · .hero-number · .tabular-nums">
            <div className="space-y-1">
              <p className="hero-number tabular-nums">$1,234.56 hero-number</p>
              {(["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-xs"] as const).map((c) => (
                <p key={c} className={c}>{c} The quick brown fox</p>
              ))}
              <p className="text-sm font-semibold">font-semibold</p>
              <p className="text-sm text-muted-foreground">text-muted-foreground</p>
              <p className="text-sm text-pos">text-pos</p><p className="text-sm text-neg">text-neg</p>
              <p className="font-mono text-sm">font-mono 0123456789</p>
            </div>
          </Group>

          <Group id="scale" title="Spacing / Radius / Shadow" file="globals.css --radius-* · --spacing-row* · --shadow-card">
            <Item name="Radius">
              <div className="flex flex-wrap gap-2">
                {["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-3xl", "rounded-group"].map((r) => (
                  <div key={r} className={cn("flex size-16 items-center justify-center border border-border bg-muted text-[9px]", r)}>{r.replace("rounded-", "")}</div>
                ))}
              </div>
            </Item>
            <Item name="Spacing (1,2,3,4,6,8) and row heights">
              <div className="space-y-1">
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <div key={n} className="flex items-center gap-2 text-[10px]"><div className="h-2 bg-primary" style={{ width: `${n * 0.25}rem` }} />{n}</div>
                ))}
                <div className="flex items-center rounded-md border border-border px-2 text-xs min-h-row">{TW.row} (--spacing-row)</div>
                <div className="flex items-center rounded-md border border-border px-2 text-xs min-h-row-tall">{TW.rowTall}</div>
              </div>
            </Item>
            <Item name="Shadow">
              <div className="flex gap-3">
                <div className="surface-card flex size-16 items-center justify-center rounded-xl text-[10px]">card</div>
                <div className="flex size-16 items-center justify-center rounded-xl bg-card text-[10px] shadow-sm">sm</div>
                <div className="flex size-16 items-center justify-center rounded-xl bg-card text-[10px] shadow-md">md</div>
              </div>
            </Item>
          </Group>

          <Group id="grids" title="Grid helpers" file="metric-grid.tsx · section-card.tsx · lib/design/tokens.ts" span>
            {([
              ["metricGridClass(4)", metricGridClass(4), 4],
              ["metricGridClass(3)", metricGridClass(3), 3],
              ["metricGridClass(6)", metricGridClass(6), 6],
              ["METRIC_GRID_CLASS", METRIC_GRID_CLASS, 4],
              ["TW.grid3", TW.grid3, 4],
            ] as const).map(([name, cls, n]) => (
              <Item key={name} name={name}>
                <div className={cls}>
                  {Array.from({ length: n }).map((_, i) => (
                    <div key={i} className="flex h-10 items-center justify-center rounded-lg border border-border bg-muted text-xs">{i + 1}</div>
                  ))}
                </div>
              </Item>
            ))}
          </Group>

          <Group id="size-class" title="Size class" file="ui/size-class.ts">
            <SectionCard>
              <div className="space-y-1 text-sm">
                <p>compact &lt; 640 · regular 640-1024 · wide &gt; 1024</p>
                <p className="text-xs text-muted-foreground">Container width: {width || "..."}px · class: {sizeClass}</p>
              </div>
            </SectionCard>
          </Group>
        </div>
        <div className="pb-8" />
      </div>
    </div>
  );
}

/**
 * Dev gallery: review catalogue of the global components and styles.
 * Hidden unless the user enables dev mode (DevModeGuard).
 */
/** A bar inside a bordered box: not sticky and not full-bleed, so several fit on one page. */
function BarFrame({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Item name={name}>
      <div
        data-testid="topbar-demo"
        className="w-full overflow-hidden rounded-xl border border-border/50 bg-background [&_[data-slot=page-header]]:static! [&_[data-slot=page-header]]:mx-0! [&_[data-slot=page-header]]:px-3!"
      >
        {children}
      </div>
    </Item>
  );
}

/** The anatomy in its combinations: root page, detail page (back + edit), filter + more, bulk edit state. */
function TopBarDemos() {
  const [bulk, setBulk] = useState(false);
  const noop = () => {};
  return (
    <div className="grid grid-cols-1 gap-3 regular:grid-cols-2">
      <BarFrame name="Root page: title + tooltip, no back, primary Add">
        <PageHeader title="Accounts" info="Overview of your assets, liabilities, and net worth" back={false} primary={{ kind: "add", label: "Add account", onSelect: noop }} />
      </BarFrame>
      <BarFrame name="Detail page: back + title + primary Edit">
        <PageHeader title="Checking" back={{ onBack: noop }} primary={{ kind: "edit", label: "Edit account", onSelect: noop }} />
      </BarFrame>
      <BarFrame name="Filter + More + primary Add">
        <PageHeader
          title="Goals"
          back={{ onBack: noop }}
          info="Track your savings targets"
          filter={{ href: "/filter/goals?returnTo=%2Fdev%2Fgallery", activeCount: 2 }}
          more={[{ label: "Manage groups", onSelect: noop }, { label: "Export CSV", onSelect: noop }]}
          primary={{ kind: "add", label: "Add goal", onSelect: noop }}
        />
      </BarFrame>
      <BarFrame name={bulk ? "Bulk edit on: Filter moves into More" : "Bulk edit off (tap the list button)"}>
        <PageHeader
          title="Transactions"
          back={false}
          bulkEdit={{ onToggle: () => setBulk((v) => !v), active: bulk }}
          filter={{ href: "/filter/transactions?returnTo=%2Fdev%2Fgallery" }}
          more={[{ label: "Export CSV", onSelect: noop }]}
          primary={{ kind: "add", label: "Add transaction", onSelect: noop }}
        />
      </BarFrame>
      <BarFrame name="Form page: back + title + primary Save (busy)">
        <PageHeader title="Edit transaction" back={{ onBack: noop }} primary={{ kind: "save", label: "Save", onSelect: noop, busy: true }} />
      </BarFrame>
      <BarFrame name="Long title truncates before the actions">
        <PageHeader
          title="A very long page title that must truncate before it reaches the action buttons"
          back={{ onBack: noop }}
          more={[{ label: "Export CSV", onSelect: noop }]}
          primary={{ kind: "edit", label: "Edit", onSelect: noop }}
        />
      </BarFrame>
    </div>
  );
}

function ToolbarDemo() {
  const [sel, setSel] = useState<RangeSelection>({ range: "this_month" });
  const [q, setQ] = useState("");
  return (
    <PageToolbar
      range={{ selection: sel, onChange: setSel }}
      search={{ value: q, onChange: setQ }}
      filter={{ href: "/filter/goals?returnTo=%2Fdev%2Fgallery", activeCount: 2 }}
    />
  );
}

export default function GalleryPage() {
  return (
    <DevModeGuard>
      <GalleryContent />
    </DevModeGuard>
  );
}
