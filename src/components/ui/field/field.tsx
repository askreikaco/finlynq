"use client";

/**
 * Field: the ONE form-input component. Every control in the app (text, number, date, textarea, amount, select,
 * combobox, group combobox, switch, checkbox, segmented, picker) is `<Field control="..." />`; the parts around it
 * are shown or hidden with props:
 *
 *   label + labelPlacement  top (default) | left | inline (switch / checkbox default to inline)
 *   icon + hideLabel        leading icon in the label slot; hideLabel keeps the label as the accessible name only
 *   info                    the (i) InfoTip next to the label: ALL descriptions go here, never in a paragraph under the input
 *   hint                    a very short one-liner under the control
 *   error / invalid         message under the control (aria-invalid + aria-describedby are wired)
 *   required / optional     "*" or "(optional)" marker after the label
 *   prefix / suffix         adornments inside the control surface (currency code, unit, button)
 *   compact                 32px control for table cells and toolbar chips (still 44px on touch)
 *
 * Inside a <FieldGroup> a Field becomes a divider row (label left, borderless control) using the --list-divider inset
 * style. Layout reacts to the Field's own width (container queries), so it also works in the 25%-wide pane.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { CardLabel, type MetricTone } from "@/components/mobile/card-label";
import { InfoTip } from "../info-tip";
import {
  AmountControl,
  CheckboxControl,
  ComboboxControl,
  GroupComboboxControl,
  PickerControl,
  SegmentedControl,
  SelectControl,
  StepperControl,
  SwitchControl,
  TextControl,
  TextareaControl,
  type ControlState,
  type FieldOption,
} from "./controls";
import { FieldRowContext } from "./surface";

export type { FieldOption } from "./controls";

/** An option of a combobox: a plain string label so the list can filter on it. */
export type FieldComboboxOption = { value: string; label: string; disabled?: boolean };

export type FieldLabelPlacement = "top" | "left" | "inline";

/** The parts around a control. All optional; a Field with no label is just the control. */
export interface FieldChromeProps {
  label?: React.ReactNode;
  labelPlacement?: FieldLabelPlacement;
  /** Keep the label as the accessible name but do not show it (use with `icon` or a placeholder). */
  hideLabel?: boolean;
  /** Leading icon in the label slot. */
  icon?: LucideIcon;
  /** Help text for the (i) tip. Replaces any paragraph under the input. */
  info?: React.ReactNode;
  /** Accessible name of the (i) button. Default "About <label>". */
  infoLabel?: string;
  /** A very short one-liner under the control. */
  hint?: React.ReactNode;
  /** Error message under the control; also marks the control invalid. */
  error?: React.ReactNode;
  /** A non-blocking one-liner under the control (an alias that clashes, a value that will be converted). */
  warning?: React.ReactNode;
  /** Mark invalid without a message (the control shows the red state; pickers read "Required" when empty). */
  invalid?: boolean;
  required?: boolean;
  optional?: boolean;
  /** Adornments inside the control surface, before / after the value. */
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** data-testid of the Field root (the row). A native `data-testid` goes to the control itself. */
  testId?: string;
  /** Classes of the Field root: width and placement only (w-*, col-span-*, flex-1). */
  className?: string;
  /** Classes of the control element itself: typography only (text-right, font-mono, tabular-nums). */
  controlClassName?: string;
  /** Width of the control column (a Tailwind width class, e.g. "w-44"); with labelPlacement="inline" the label takes the rest. */
  controlWidth?: string;
  /** 32px control for table cells and toolbar chips (44px on touch). */
  compact?: boolean;
  /** Fully rounded control (toolbar search, range pill). */
  pill?: boolean;
  id?: string;
  disabled?: boolean;
  ref?: React.Ref<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type NativeInput = Omit<
  React.ComponentProps<"input">,
  keyof FieldChromeProps | "type" | "size" | "children" | "ref" | "prefix"
>;
type NativeTextarea = Omit<
  React.ComponentProps<"textarea">,
  keyof FieldChromeProps | "children" | "ref" | "prefix"
>;

export type TextInputType =
  | "text"
  | "email"
  | "password"
  | "search"
  | "tel"
  | "url"
  | "time"
  | "month"
  | "week"
  | "datetime-local"
  | "color"
  | "file";

export type TextFieldProps = FieldChromeProps & NativeInput & { control?: "text"; type?: TextInputType };
export type NumberFieldProps = FieldChromeProps & NativeInput & { control: "number" };
export type DateFieldProps = FieldChromeProps & NativeInput & { control: "date" };
export type TextareaFieldProps = FieldChromeProps & NativeTextarea & { control: "textarea" };
export type AmountFieldProps = FieldChromeProps &
  Omit<NativeInput, "value" | "onChange" | "defaultValue"> & {
    control: "amount";
    /** Canonical dot-decimal string ("1234.5") or number. */
    value: string | number | null | undefined;
    /** Receives the canonical dot-decimal string whatever the Language preference types. */
    onValueChange: (canonical: string) => void;
    /** Large type for the amount screen. */
    size?: "hero";
  };
export type SelectFieldProps = FieldChromeProps & {
  control: "select";
  value?: string | null;
  onValueChange?: (value: string) => void;
  options: readonly FieldOption[];
  placeholder?: string;
  name?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};
export type ComboboxFieldProps = FieldChromeProps & {
  control: "combobox";
  value?: string;
  onValueChange?: (value: string) => void;
  options: ReadonlyArray<FieldComboboxOption>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};
export type GroupComboboxFieldProps = FieldChromeProps & {
  control: "group-combobox";
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<string>;
  placeholder?: string;
  noneLabel?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};
export type SwitchFieldProps = FieldChromeProps & {
  control: "switch";
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  title?: string;
  role?: string;
  "aria-label"?: string;
  "aria-controls"?: string;
  "data-testid"?: string;
};
export type CheckboxFieldProps = FieldChromeProps &
  NativeInput & {
    control: "checkbox";
    onCheckedChange?: (checked: boolean) => void;
  };
export type SegmentedFieldProps = FieldChromeProps & {
  control: "segmented";
  value: string;
  onValueChange: (value: string) => void;
  options: readonly FieldOption[];
  /** Equal-width columns across the whole row. */
  fill?: boolean;
  /** Separate round chips instead of one bordered bar. */
  pills?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
};
export type StepperFieldProps = FieldChromeProps &
  Omit<NativeInput, "value" | "onChange" | "min" | "max" | "step" | "defaultValue"> & {
    control: "stepper";
    value: string | number;
    /** The next text (digits only). */
    onValueChange: (next: string) => void;
    min?: number;
    max?: number;
    /** Noun for the button names: "Decrease {stepLabel}". */
    stepLabel?: string;
    /** Custom stepping rule (direction, current text) -> next text. */
    onStep?: (delta: 1 | -1, current: string) => string;
    /** Called on focus and before a step. */
    onInteract?: () => void;
  };
export type PickerFieldProps = FieldChromeProps & {
  control: "picker";
  /** What is picked (shown in the button); empty shows the placeholder. */
  value?: React.ReactNode;
  placeholder?: string;
  onClick?: () => void;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-label"?: string;
  "data-testid"?: string;
};
export type CustomFieldProps = FieldChromeProps & {
  control: "custom";
  /** Id of the control inside `children`; makes the label a <label htmlFor>. */
  htmlFor?: string;
  children: React.ReactNode;
};

export type FieldProps =
  | TextFieldProps
  | NumberFieldProps
  | DateFieldProps
  | TextareaFieldProps
  | AmountFieldProps
  | SelectFieldProps
  | ComboboxFieldProps
  | GroupComboboxFieldProps
  | SwitchFieldProps
  | CheckboxFieldProps
  | SegmentedFieldProps
  | StepperFieldProps
  | PickerFieldProps
  | CustomFieldProps;

/** Controls whose label names a group (a radiogroup, a picker button) rather than a single <input>. */
const NAMED_BY_ID = new Set(["segmented", "picker", "custom"]);
/** Controls that sit on one line with their label by default. */
const TOGGLES = new Set(["switch", "checkbox"]);

const NOTE = "text-xs";

export function Field(props: FieldProps) {
  const {
    label,
    labelPlacement,
    hideLabel,
    icon: Icon,
    info,
    infoLabel,
    hint,
    error,
    warning,
    invalid: invalidProp,
    required,
    optional,
    prefix,
    suffix,
    testId,
    className,
    controlClassName,
    controlWidth,
    compact = false,
    pill = false,
    id: idProp,
    disabled,
    ref,
    ...rest
  } = props as FieldChromeProps & { control?: string } & Record<string, unknown>;
  const control = (rest.control as string | undefined) ?? "text";
  delete (rest as { control?: string }).control;

  const row = React.useContext(FieldRowContext);
  const autoId = React.useId();
  const id = idProp ?? (control === "custom" && typeof rest.htmlFor === "string" ? rest.htmlFor : autoId);
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const valueId = `${id}-value`;

  const invalid = !!error || !!invalidProp;
  const hasLabel = label !== undefined && label !== null && label !== false && label !== "";
  const toggle = TOGGLES.has(control);
  const placement: FieldLabelPlacement = labelPlacement ?? (toggle ? "inline" : row ? "left" : "top");
  const describedBy = error ? errorId : warning || hint ? hintId : undefined;
  const ariaLabel = hasLabel && typeof label === "string" ? label : undefined;

  const state: ControlState = {
    id,
    describedBy,
    labelId: hasLabel ? labelId : undefined,
    invalid,
    disabled,
    required,
    compact,
    pill,
    row,
    prefix,
    suffix,
    className: controlClassName,
    ariaLabel: hideLabel || !hasLabel ? ariaLabel : undefined,
  };

  const testIdOf = rest["data-testid"] as string | undefined;
  let controlNode: React.ReactNode;
  switch (control) {
    case "textarea":
      controlNode = <TextareaControl state={state} inputRef={ref} {...(rest as NativeTextarea)} />;
      break;
    case "amount": {
      const { size, ...r } = rest as unknown as Omit<AmountFieldProps, keyof FieldChromeProps | "control">;
      controlNode = <AmountControl state={state} inputRef={ref} hero={size === "hero"} {...r} />;
      break;
    }
    case "select": {
      const r = rest as unknown as Omit<SelectFieldProps, keyof FieldChromeProps | "control">;
      controlNode = (
        <SelectControl
          state={{ ...state, ariaLabel: r["aria-label"] ?? state.ariaLabel }}
          triggerRef={ref}
          options={r.options}
          value={r.value}
          onValueChange={r.onValueChange}
          placeholder={r.placeholder}
          name={r.name}
          testId={testIdOf}
        />
      );
      break;
    }
    case "combobox": {
      const r = rest as unknown as Omit<ComboboxFieldProps, keyof FieldChromeProps | "control">;
      controlNode = (
        <ComboboxControl
          state={{ ...state, ariaLabel: r["aria-label"] ?? state.ariaLabel }}
          options={r.options}
          value={r.value}
          onValueChange={r.onValueChange}
          placeholder={r.placeholder}
          searchPlaceholder={r.searchPlaceholder}
          emptyMessage={r.emptyMessage}
          testId={testIdOf}
        />
      );
      break;
    }
    case "group-combobox": {
      const r = rest as unknown as Omit<GroupComboboxFieldProps, keyof FieldChromeProps | "control">;
      controlNode = (
        <GroupComboboxControl
          state={{ ...state, ariaLabel: r["aria-label"] ?? ariaLabel ?? "Group" }}
          options={r.options}
          value={r.value}
          onValueChange={r.onValueChange}
          placeholder={r.placeholder}
          noneLabel={r.noneLabel}
          testId={testIdOf}
        />
      );
      break;
    }
    case "switch":
      controlNode = <SwitchControl state={state} {...(rest as object)} />;
      break;
    case "checkbox":
      controlNode = <CheckboxControl state={state} inputRef={ref} {...(rest as NativeInput)} />;
      break;
    case "segmented": {
      const r = rest as unknown as Omit<SegmentedFieldProps, keyof FieldChromeProps | "control">;
      controlNode = (
        <SegmentedControl
          state={{ ...state, ariaLabel: r["aria-label"] ?? state.ariaLabel }}
          options={r.options}
          value={r.value}
          onValueChange={r.onValueChange}
          fill={r.fill}
          pills={r.pills}
          testId={testIdOf}
        />
      );
      break;
    }
    case "stepper":
      controlNode = <StepperControl state={state} inputRef={ref} {...(rest as object as Omit<React.ComponentProps<typeof StepperControl>, "state">)} />;
      break;
    case "picker": {
      const r = rest as unknown as Omit<PickerFieldProps, keyof FieldChromeProps | "control">;
      controlNode = (
        <PickerControl
          state={{ ...state, ariaLabel: r["aria-label"] ?? state.ariaLabel }}
          triggerRef={ref}
          value={r.value}
          placeholder={r.placeholder}
          onClick={r.onClick}
          aria-haspopup={r["aria-haspopup"]}
          testId={testIdOf}
          hasLabel={hasLabel}
          valueId={valueId}
        />
      );
      break;
    }
    case "custom":
      controlNode = <div className={cn("min-w-0 flex-1", controlClassName)}>{(rest as { children?: React.ReactNode }).children}</div>;
      break;
    case "number":
      controlNode = <TextControl state={state} type="number" inputRef={ref} {...(rest as NativeInput)} />;
      break;
    case "date":
      controlNode = <TextControl state={state} type="date" inputRef={ref} {...(rest as NativeInput)} />;
      break;
    default: {
      const { type, ...r } = rest as NativeInput & { type?: string };
      controlNode = <TextControl state={state} type={type ?? "text"} inputRef={ref} {...r} />;
    }
  }

  // Label text + markers + the (i) tip.
  const infoNode =
    info !== undefined && info !== null && info !== false ? (
      <InfoTip text={info} label={infoLabel ?? (typeof label === "string" ? `About ${label.toLowerCase()}` : undefined)} />
    ) : null;
  const labelVisible = hasLabel && !hideLabel;
  const iconOnly = !!Icon && hideLabel;
  const labelTag = NAMED_BY_ID.has(control) && !(control === "custom" && typeof rest.htmlFor === "string") ? "span" : "label";
  const labelClass = cn(
    "min-w-0 text-sm leading-snug",
    placement === "left" ? "text-muted-foreground" : "font-medium text-foreground",
    placement === "inline" && "text-base font-normal",
    invalid && placement === "left" && "text-neg",
    toggle && "cursor-pointer",
  );
  const labelContent = hasLabel ? (
    <>
      {Icon ? <Icon aria-hidden="true" data-slot="form-row-icon" className="size-[18px] shrink-0 text-muted-foreground" /> : null}
      <span className={cn(hideLabel ? "sr-only" : "min-w-0 truncate")}>{label}</span>
    </>
  ) : Icon ? (
    <Icon aria-hidden="true" data-slot="form-row-icon" className="size-[18px] shrink-0 text-muted-foreground" />
  ) : null;
  const LabelTag = labelTag as "label" | "span";
  const labelEl =
    labelContent && (hasLabel || Icon) ? (
      <div data-slot="field-label-row" className={cn("flex min-w-0 items-center gap-1.5", iconOnly && "shrink-0")}>
        <LabelTag
          id={labelId}
          {...(labelTag === "label" ? { htmlFor: id } : {})}
          className={cn(labelClass, "flex min-w-0 items-center gap-2")}
        >
          {labelContent}
        </LabelTag>
        {required && !hideLabel ? <span aria-hidden="true" className="text-destructive">*</span> : null}
        {optional && !hideLabel ? <span className="text-xs font-normal text-muted-foreground">(optional)</span> : null}
        {labelVisible ? infoNode : null}
      </div>
    ) : null;
  // Without a visible label the tip sits after the control; a hidden label with no icon stays in the DOM as the accessible name.
  const tipAfter = !labelVisible ? infoNode : null;
  const slotLabel = labelEl && (labelVisible || Icon) ? labelEl : labelEl ? <div className="sr-only">{labelEl}</div> : null;

  const note = error ? (
    <div id={errorId} data-slot="field-error" role="alert" className={cn(NOTE, "text-destructive")}>
      {error}
    </div>
  ) : warning ? (
    <div id={hintId} data-slot="field-warning" className={cn(NOTE, "text-warning")}>
      {warning}
    </div>
  ) : hint ? (
    <div id={hintId} data-slot="field-hint" className={cn(NOTE, "text-muted-foreground")}>
      {hint}
    </div>
  ) : null;

  const controlRow = (
    <div data-slot="field-control" className={cn("flex min-w-0 items-center gap-1.5", placement === "inline" ? "shrink-0" : "flex-1", controlWidth)}>
      <div className={cn("min-w-0", placement !== "inline" && "flex-1")}>{controlNode}</div>
      {tipAfter}
    </div>
  );

  // The root fills its parent (like the inputs it replaces) unless the caller sets a width. Only the left layout is a
  // size container (it needs to measure itself); a size container collapses to 0 wide when it is shrink-to-fit.
  const natural = control === "segmented" && !rest.fill && !hasLabel; // a bare segmented bar is as wide as its options
  const rootBase = cn(natural ? "w-auto max-w-full" : "w-full min-w-0", row && "py-2", className);
  const dataAttrs = {
    "data-slot": "field",
    "data-control": control,
    "data-placement": placement,
    "data-invalid": invalid || undefined,
    "data-testid": testId,
  } as const;

  if (placement === "inline") {
    // A bare toggle (no label) is just the control, sized to itself, so it can sit beside a caller's own label.
    if (!slotLabel) {
      return (
        <div {...dataAttrs} className={cn("inline-flex min-w-0 flex-col", row && "py-2", className)}>
          {controlRow}
          {note}
        </div>
      );
    }
    const isCheckbox = control === "checkbox";
    return (
      <div {...dataAttrs} className={rootBase}>
        <div className={cn("flex min-h-11 dense:pointer-fine:min-h-9 items-center gap-3", !isCheckbox && "justify-between")}>
          {isCheckbox ? controlRow : null}
          <div className="min-w-0 flex-1">{slotLabel}</div>
          {!isCheckbox ? controlRow : null}
        </div>
        {note ? <div className={cn(isCheckbox ? "pl-7" : "pr-14")}>{note}</div> : null}
      </div>
    );
  }

  if (placement === "left") {
    return (
      <div {...dataAttrs} className={cn(rootBase, "@container")}>
        <div
          className={cn(
            "grid grid-cols-1 gap-1.5",
            iconOnly
              ? "grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3"
              : "@[22rem]:grid-cols-[7rem_minmax(0,1fr)] @[22rem]:items-center @[22rem]:gap-x-3",
          )}
        >
          {slotLabel}
          {controlRow}
        </div>
        {note ? (
          <div className={cn("mt-1", iconOnly ? "pl-[calc(18px+0.75rem)]" : "@[22rem]:pl-[calc(7rem+0.75rem)]")}>{note}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div {...dataAttrs} className={cn(rootBase, "flex flex-col gap-1.5")}>
      {slotLabel}
      {controlRow}
      {note}
    </div>
  );
}

/**
 * A card of Fields as divider rows (the --list-divider inset hairline between rows, none after the last), the same
 * look as a SectionCard list. Fields inside default to labelPlacement "left" with a borderless control; switches and
 * checkboxes stay inline. `label` is the card's own title (the shared CardLabel row inside the card); `bare` drops the
 * card surface to sit inside a SectionCard that already is the card.
 */
export function FieldGroup({
  className,
  bare = false,
  label,
  info,
  panel,
  icon,
  tone,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  bare?: boolean;
  label?: React.ReactNode;
  /** Help text for an (i) tip in the title row. */
  info?: React.ReactNode;
  /** Content below the rows in the same card (an expandable panel); plain layout, not divider rows. */
  panel?: React.ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone | (string & {});
}) {
  const rows = (
    <>
      <FieldRowContext.Provider value={true}>
        <div className={cn("min-w-0 px-4 [&>*:not(:last-child)]:shadow-[var(--list-divider)]", panel && "shadow-[var(--list-divider)]")}>
          {children}
        </div>
      </FieldRowContext.Provider>
      {panel ? (
        <div data-slot="field-group-panel" className="px-4">
          {panel}
        </div>
      ) : null}
    </>
  );
  if (bare && !label) {
    return (
      <div role="group" data-slot="field-group" className={className} {...props}>
        {rows}
      </div>
    );
  }
  return (
    <div
      role="group"
      data-slot="field-group"
      className={cn("@container min-w-0 surface-card overflow-hidden rounded-xl border border-border/50 text-card-foreground", className)}
      {...props}
    >
      {label ? (
        <CardLabel
          as="h2"
          slot="section-label"
          icon={icon}
          tone={tone}
          action={info ? <InfoTip text={info} label={typeof label === "string" ? `About ${label.toLowerCase()}` : undefined} /> : undefined}
        >
          {label}
        </CardLabel>
      ) : null}
      {rows}
    </div>
  );
}
