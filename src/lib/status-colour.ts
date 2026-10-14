/** The ONE status -> colour mapping of the goals and loans rows (dot colour). Existing theme tokens only. */
export type RowStatus = "active" | "completed" | "overdue" | "paused";

export const STATUS_DOT: Record<RowStatus, string> = {
  active: "var(--primary)",
  completed: "var(--pos)",
  overdue: "var(--destructive)",
  paused: "var(--muted-foreground)",
};

export const STATUS_LABEL: Record<RowStatus, string> = {
  active: "Active",
  completed: "Completed",
  overdue: "Overdue",
  paused: "Paused",
};

/** Goal status: completed wins; an active goal past its deadline is overdue; anything else non-active is paused. */
export function goalStatus(g: { status: string; deadline: string | null }, today: string): RowStatus {
  if (g.status === "completed") return "completed";
  if (g.status !== "active") return "paused";
  return g.deadline && g.deadline < today ? "overdue" : "active";
}
