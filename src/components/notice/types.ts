import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type NoticeTone = "info" | "success" | "warning" | "danger" | "neutral";

/** inline = in-flow alert; banner = compact strip / pill; card = padded card; empty / error = centred page state; skeleton = loading placeholder. */
export type NoticeVariant = "inline" | "banner" | "card" | "empty" | "error" | "skeleton";

/** Where a banner / card sits: in the flow (default) or fixed to the viewport. */
export type NoticePlacement = "flow" | "top" | "bottom-start" | "bottom-end";

export interface NoticeAction {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Disables the button and shows a spinner. */
  busy?: boolean;
  testId?: string;
  /** "default" = filled; "outline" = quiet. */
  tone?: "default" | "outline";
}

/** One row of a multi-item notice (onboarding tips): each can be dismissed on its own. */
export interface NoticeItem {
  id: string;
  title: ReactNode;
  body?: ReactNode;
  action?: { label: string; href: string };
}

/** Self-fetching notices, mounted as `<Notice source="..." />`. Data lives in feeds.tsx. */
export type NoticeSource =
  | "announcement"
  | "currency-audit"
  | "passkey-lock"
  | "reporting-recompute"
  | "tips:dashboard"
  | "tips:transactions"
  | "tips:budgets"
  | "tips:accounts"
  | "tips:import";

export interface NoticeProps {
  variant?: NoticeVariant;
  /** Default: danger for variant "error", neutral for "empty", info otherwise. */
  tone?: NoticeTone;
  /** Lucide icon; `null` hides it. Default by tone (empty: Inbox, error: AlertCircle). */
  icon?: LucideIcon | null;
  iconSpin?: boolean;
  /** A function receives the number of items still shown (multi-item notices). */
  title?: ReactNode | ((remaining: number) => ReactNode);
  /** Short body. Long help text goes in `info`. */
  children?: ReactNode;
  /** Help text behind an (i) InfoTip next to the title. */
  info?: ReactNode;
  infoLabel?: string;
  action?: NoticeAction;
  secondaryAction?: NoticeAction;
  /** Error variant: shows the "Try again" button. */
  retry?: () => void;
  retryLabel?: string;
  dismissible?: boolean;
  dismissLabel?: string;
  /** Persist the dismissal per user under this local-storage key (an id list). */
  dismissKey?: string;
  onDismiss?: () => void;
  /** Whole notice is a link (banner). */
  href?: string;

  placement?: NoticePlacement;
  /** Rounded-full single-line look. */
  pill?: boolean;

  /** Skeleton variant. */
  skeleton?: "table" | "cards" | "list";
  rows?: number;

  /** Multi-item notice; collapsible = collapsed behind a header on phones. */
  items?: NoticeItem[];
  collapsible?: boolean;
  itemDismissLabel?: string;
  dismissAllLabel?: string;

  /** Self-fetching notice (announcement, currency audit, passkey lock, recompute, onboarding tips). */
  source?: NoticeSource;

  role?: "alert" | "status" | "none";
  id?: string;
  testId?: string;
  className?: string;
}
