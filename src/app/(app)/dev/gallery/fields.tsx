"use client";

/**
 * Gallery: the ONE Field. Every control type, then the parts around it shown and hidden (label placement, info,
 * hint, error, required/optional, prefix/suffix, compact, disabled), then FieldGroup rows, then the same group at the
 * 25%-wide pane width (container queries, not viewport breakpoints).
 */

import React, { useState } from "react";
import { Banknote, Calendar, Mail, Moon, Monitor, Sun, Tag, Wallet } from "lucide-react";

import { Field, FieldGroup } from "@/components/ui/field";
import { SectionCard } from "@/components/mobile/section-card";

const CURRENCIES = [
  { value: "USD", label: "USD — US dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "VND", label: "VND — Vietnamese dong" },
];

function Cell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1" data-gallery-field={name}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</div>
      {children}
    </div>
  );
}

export function FieldsGallery() {
  const [text, setText] = useState("Groceries");
  const [num, setNum] = useState("12");
  const [date, setDate] = useState("2026-10-15");
  const [note, setNote] = useState("A longer note that wraps and grows with its content until it reaches the maximum height.");
  const [amount, setAmount] = useState("1250.5");
  const [select, setSelect] = useState("a");
  const [combo, setCombo] = useState("EUR");
  const [group, setGroup] = useState("Checking");
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(true);
  const [seg, setSeg] = useState("expense");
  const [pill, setPill] = useState("all");
  const [count, setCount] = useState("3");
  const [theme, setTheme] = useState("system");

  return (
    <div className="space-y-6">
      <SectionCard label="Control types" className="@container">
        <div className="grid gap-4 @[40rem]:grid-cols-2">
          <Cell name="text">
            <Field label="Payee" value={text} onChange={(e) => setText(e.target.value)} placeholder="Payee" />
          </Cell>
          <Cell name="number">
            <Field control="number" label="Quantity" value={num} onChange={(e) => setNum(e.target.value)} min={0} />
          </Cell>
          <Cell name="date">
            <Field control="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Cell>
          <Cell name="amount">
            <Field
              control="amount"
              label="Amount"
              value={amount}
              onValueChange={setAmount}
              prefix={<span className="text-muted-foreground">$</span>}
            />
          </Cell>
          <Cell name="textarea (auto-grow)">
            <Field control="textarea" label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Cell>
          <Cell name="select">
            <Field
              control="select"
              label="Category"
              value={select}
              onValueChange={setSelect}
              options={[
                { value: "a", label: "Food" },
                { value: "b", label: "Transport" },
                { value: "c", label: "Rent" },
              ]}
            />
          </Cell>
          <Cell name="combobox">
            <Field control="combobox" label="Currency" value={combo} onValueChange={setCombo} options={CURRENCIES} />
          </Cell>
          <Cell name="group-combobox">
            <Field
              control="group-combobox"
              label="Group"
              value={group}
              onValueChange={setGroup}
              options={["Checking", "Savings", "Emergency fund"]}
            />
          </Cell>
          <Cell name="segmented">
            <Field
              control="segmented"
              fill
              label="Type"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: "income", label: "Income", selectedClassName: "bg-pos/10 text-pos" },
                { value: "expense", label: "Expense", selectedClassName: "bg-neg/10 text-neg" },
                { value: "transfer", label: "Transfer" },
              ]}
            />
          </Cell>
          <Cell name="segmented (pills)">
            <Field
              control="segmented"
              pills
              label="Person"
              value={pill}
              onValueChange={setPill}
              options={[
                { value: "all", label: "All", ariaLabel: "Everyone" },
                { value: "a", label: "AB", ariaLabel: "Alex B" },
                { value: "c", label: "CD", ariaLabel: "Chris D" },
              ]}
            />
          </Cell>
          <Cell name="stepper">
            <Field control="stepper" label="Splits" value={count} onValueChange={setCount} min={0} max={20} stepLabel="splits" />
          </Cell>
          <Cell name="picker">
            <Field control="picker" label="Account" value="Everyday checking" onClick={() => {}} aria-haspopup="dialog" />
          </Cell>
          <Cell name="switch (inline)">
            <Field control="switch" label="Business" checked={on} onCheckedChange={setOn} />
          </Cell>
          <Cell name="checkbox (inline)">
            <Field control="checkbox" label="Select all" checked={check} onCheckedChange={setCheck} />
          </Cell>
          <Cell name="custom (slot)">
            <Field control="custom" label="Total amount">
              <span className="font-mono font-semibold">$1,250.50</span>
            </Field>
          </Cell>
        </div>
      </SectionCard>

      <SectionCard label="Parts: show / hide" className="@container">
        <div className="grid gap-4 @[40rem]:grid-cols-2">
          <Cell name="label top (default)">
            <Field label="Name" value="Alex" onChange={() => {}} />
          </Cell>
          <Cell name="label left">
            <Field label="Name" labelPlacement="left" value="Alex" onChange={() => {}} />
          </Cell>
          <Cell name="label inline">
            <Field label="Currency" labelPlacement="inline" control="combobox" controlWidth="w-44" value="USD" onValueChange={() => {}} options={CURRENCIES} />
          </Cell>
          <Cell name="no label">
            <Field aria-label="Search" placeholder="Search" value="" onChange={() => {}} />
          </Cell>
          <Cell name="icon + hidden label">
            <Field icon={Mail} label="Email" hideLabel placeholder="Email" labelPlacement="left" value="" onChange={() => {}} />
          </Cell>
          <Cell name="info (i) tip">
            <Field label="Alias" info="Short nickname used when matching transactions, e.g. the last 4 digits of a card." value="" onChange={() => {}} />
          </Cell>
          <Cell name="hint (one short line)">
            <Field label="Amount" hint="Converted at today's rate" control="amount" value="10" onValueChange={() => {}} />
          </Cell>
          <Cell name="warning">
            <Field label="Alias" warning="Another account uses this alias" value="Visa4242" onChange={() => {}} />
          </Cell>
          <Cell name="error">
            <Field label="Account name" error="Name is required" value="" onChange={() => {}} />
          </Cell>
          <Cell name="required">
            <Field label="Payee" required value="" onChange={() => {}} />
          </Cell>
          <Cell name="optional">
            <Field label="Note" optional value="" onChange={() => {}} />
          </Cell>
          <Cell name="prefix / suffix">
            <Field label="Rate" prefix={<Banknote className="size-4 text-muted-foreground" />} suffix={<span className="text-muted-foreground">%</span>} value="4.5" onChange={() => {}} />
          </Cell>
          <Cell name="compact (table cell)">
            <Field compact aria-label="Compact" value="Compact" onChange={() => {}} />
          </Cell>
          <Cell name="pill (toolbar)">
            <Field pill aria-label="Pill" prefix={<Calendar className="size-4 text-muted-foreground" />} placeholder="This month" value="" onChange={() => {}} />
          </Cell>
          <Cell name="disabled">
            <Field label="Locked" disabled value="Cannot edit" onChange={() => {}} />
          </Cell>
          <Cell name="invalid, no message">
            <Field label="Date" control="date" invalid value="2026-10-15" onChange={() => {}} />
          </Cell>
        </div>
      </SectionCard>

      <SectionCard label="FieldGroup (divider rows)" className="@container">
        <div className="grid gap-4 @[40rem]:grid-cols-2">
          <FieldGroup label="Account" icon={Wallet} tone="indigo">
            <Field label="Name" placeholder="e.g. TD Chequing" value="Everyday" onChange={() => { }} />
            <Field label="Type" control="select" value="a" onValueChange={() => { }} options={[{ value: "a", label: "Asset" }, { value: "l", label: "Liability" }]} />
            <Field label="Opening balance" control="amount" optional info="A single starting-balance entry." value="0" onValueChange={() => { }} />
            <Field label="Date" control="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Field label="Invisible" control="switch" info="Hidden from net worth and reports." checked={on} onCheckedChange={setOn} />
          </FieldGroup>
          <FieldGroup
            label="Entry rows"
            icon={Tag}
            tone="violet"
            panel={<div className="py-3 text-sm text-muted-foreground">A panel below the rows (repeat options, split rows).</div>}
          >
            <Field icon={Calendar} label="Date" hideLabel control="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Field icon={Wallet} label="Account" hideLabel control="picker" value="Everyday checking" onClick={() => { }} />
            <Field icon={Tag} label="Category" hideLabel control="picker" placeholder="Category" invalid onClick={() => { }} />
            <Field control="segmented" label="Theme" labelPlacement="inline" value={theme} onValueChange={setTheme} options={[
              { value: "system", label: "System", icon: Monitor },
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
            ]} />
          </FieldGroup>
        </div>
      </SectionCard>

      <SectionCard label="In the 25% pane (container width 360px)">
        <div className="w-[360px] max-w-full">
          <FieldGroup>
            <Field label="Account Name" info="The account's display name." value="Everyday" onChange={() => { }} />
            <Field label="Currency" control="combobox" value="USD" onValueChange={() => { }} options={CURRENCIES} />
            <Field label="Opening balance" control="amount" value="1200" onValueChange={() => { }} />
            <Field label="Investment account" control="switch" info="Every transaction must reference a holding." checked={false} onCheckedChange={() => { }} />
          </FieldGroup>
        </div>
      </SectionCard>
    </div>
  );
}
