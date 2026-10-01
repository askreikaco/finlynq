import { FAMILY_STRINGS } from "@/lib/family/strings";

const LABELS: Record<string, string> = {
  net_worth: FAMILY_STRINGS.overview_net_worth_title,
  accounts: FAMILY_STRINGS.overview_accounts_title,
  investments: FAMILY_STRINGS.overview_investments_title,
  goals: FAMILY_STRINGS.overview_goals_title,
  budgets: FAMILY_STRINGS.overview_budgets_title,
  loans: FAMILY_STRINGS.overview_loans_title,
  cashflow: FAMILY_STRINGS.overview_cashflow_title,
};

export function getSectionLabel(section: string): string {
  return LABELS[section] ?? section;
}

export function getSectionDescription(section: string): string {
  const key = `invite_dialog_section_${section}` as keyof typeof FAMILY_STRINGS;
  return (FAMILY_STRINGS[key] as string | undefined) ?? section;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
