"use client";

/**
 * Notice: the ONE component for everything that tells the user something (owner: "as few global components as
 * possible: multiple fields for every use case, show/hide per case"). It replaces the former
 * empty-state, error-state, page-skeleton and alert components and the banners (announcement, currency audit, passkey lock, onboarding tips, reporting
 * recompute).
 *
 *   variant  inline (alert) | banner (strip / pill) | card | empty | error | skeleton
 *   tone     info | success | warning | danger | neutral
 *   parts    icon, title, children (short body), info (InfoTip for anything longer), action, secondaryAction,
 *            retry (error), dismissible (+ dismissKey: per-user persistence), items (tips list), placement/pill
 *   source   self-fetching notices: <Notice source="announcement" /> (feeds.tsx)
 *
 * a11y: error / danger / warning render role="alert"; info / success role="status"; empty and skeleton none.
 * No mount animation.
 */

import { NoticeFeed } from "./feeds";
import { NoticeBody, PersistedNoticeBody } from "./body";
import type { NoticeProps } from "./types";

export function Notice(props: NoticeProps) {
  if (props.source) return <NoticeFeed source={props.source} />;
  if (props.dismissKey) return <PersistedNoticeBody {...props} dismissKey={props.dismissKey} />;
  return <NoticeBody {...props} />;
}

export type { NoticeProps, NoticeTone, NoticeVariant, NoticePlacement, NoticeAction, NoticeItem, NoticeSource } from "./types";
