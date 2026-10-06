"use client";

import React, { useRef } from "react";
import { DevModeGuard } from "@/components/dev-mode-guard";
import { useSizeClass } from "@/components/ui/size-class";
import { PageHeader } from "@/components/mobile/page-header";
import { SectionCard } from "@/components/mobile/section-card";
import { SectionLabel } from "@/components/mobile/section-label";
import { ListRow } from "@/components/mobile/list-row";
import { StatTile } from "@/components/mobile/stat-tile";
import { Amount } from "@/components/mobile/amount";
import { PillButton } from "@/components/mobile/pill-button";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  PiggyBank,
} from "lucide-react";

/**
 * Inner component that uses the ref and hook.
 * Mounted only after DevModeGuard confirms dev mode is enabled.
 */
function GalleryContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeClass = useSizeClass(containerRef as React.RefObject<HTMLElement>);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, [sizeClass]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-background"
      style={{ minWidth: "100%" }}
    >
        <div className="space-y-8 p-4">
          <PageHeader
            title="Component Gallery"
            subtitle={`Current size class: ${sizeClass}`}
          />

          {/* Mobile Primitives Section */}
          <section className="space-y-4">
            <SectionLabel>Mobile Primitives</SectionLabel>

            {/* ListRow Examples */}
            <SectionCard>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold px-4 pt-3">ListRow</h3>
                <ListRow
                  title="Checking Account"
                  value="$2,500.00"
                  icon={Wallet}
                  href="/accounts"
                />
                <ListRow
                  title="Savings Account"
                  value="$10,000.00"
                  secondary="Primary"
                  icon={PiggyBank}
                  href="/accounts"
                />
                <ListRow
                  title="Investment Account"
                  value="$15,500.50"
                  secondary="Portfolio"
                  icon={TrendingUp}
                  href="/portfolio"
                  chevron
                />
              </div>
            </SectionCard>

            {/* StatTile Examples */}
            <SectionCard>
              <div className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">StatTile</h3>
                <div className="grid grid-cols-2 gap-2">
                  <StatTile label="Net Worth" value="$125,000.00" />
                  <StatTile label="Monthly Income" value="$5,200.00" />
                  <StatTile label="Savings Rate" value="32%" />
                  <StatTile label="Debt" value="$12,500.00" />
                </div>
              </div>
            </SectionCard>

            {/* Amount Component */}
            <SectionCard>
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">Amount</h3>
                <div className="space-y-2">
                  <Amount value={1234.56} />
                  <Amount value={-100.50} />
                  <Amount value={0} />
                  <Amount value={5000000} currency="USD" />
                </div>
              </div>
            </SectionCard>

            {/* PillButton Examples */}
            <SectionCard>
              <div className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">PillButton</h3>
                <div className="flex flex-wrap gap-2">
                  <PillButton>All</PillButton>
                  <PillButton className="bg-primary/80">Expenses</PillButton>
                  <PillButton>Income</PillButton>
                  <PillButton>Transfers</PillButton>
                </div>
              </div>
            </SectionCard>
          </section>

          {/* UI Primitives Section */}
          <section className="space-y-4">
            <SectionLabel>UI Primitives</SectionLabel>

            {/* MetricCard Examples */}
            <SectionCard>
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-semibold mb-4">MetricCard</h3>
                <div className="grid grid-cols-1 gap-4">
                  <MetricCard
                    label="Balance"
                    icon={DollarSign}
                    tone="indigo"
                    value={25000}
                    sub="Checking Account"
                  />
                  <MetricCard
                    label="Portfolio"
                    icon={TrendingUp}
                    tone="emerald"
                    value={150000}
                    sub="Total invested"
                    badgePct={8.5}
                  />
                  <MetricCard
                    label="Net Worth"
                    icon={Wallet}
                    tone="violet"
                    value={275000}
                    sub="As of today"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Button Examples */}
            <SectionCard>
              <div className="space-y-2 p-4">
                <h3 className="text-sm font-semibold mb-4">Button</h3>
                <div className="space-y-2">
                  <Button className="w-full">Primary Button</Button>
                  <Button variant="secondary" className="w-full">
                    Secondary Button
                  </Button>
                  <Button variant="outline" className="w-full">
                    Outline Button
                  </Button>
                  <Button variant="ghost" className="w-full">
                    Ghost Button
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* Card Examples */}
            <SectionCard>
              <div className="space-y-3 p-4">
                <h3 className="text-sm font-semibold mb-4">Card</h3>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm">Standard card with content</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="pt-6">
                    <p className="text-sm">Muted card variant</p>
                  </CardContent>
                </Card>
              </div>
            </SectionCard>
          </section>

          {/* Size Class Reference */}
          <section className="space-y-4">
            <SectionLabel>Size Class Reference</SectionLabel>
            <SectionCard>
              <div className="space-y-2 p-4 text-sm">
                <p>
                  <strong>Compact:</strong> &lt; 640px
                </p>
                <p>
                  <strong>Regular:</strong> 640px - 1024px
                </p>
                <p>
                  <strong>Wide:</strong> &gt; 1024px
                </p>
                <div className="mt-4 p-3 bg-muted/50 rounded text-xs space-y-1">
                  <p>
                    Current container width: {width || "calculating..."}px
                  </p>
                  <p>Current size class: {sizeClass}</p>
                </div>
              </div>
            </SectionCard>
          </section>

          <div className="pb-8" />
        </div>
      </div>
  );
}

/**
 * Dev gallery page — displays mobile and ui primitives at 3 size classes.
 * Hidden unless user enables dev mode via DevModeGuard.
 */
export default function GalleryPage() {
  return (
    <DevModeGuard>
      <GalleryContent />
    </DevModeGuard>
  );
}
