/**
 * adapters.tsx: the ONLY place @reika/ui touches the host app (router, money/date formatting, i18n, size class,
 * display currency, per-user storage, self-fetching notice feeds). Every exported component reads these through
 * the wrappers below, never from next/* or app modules. Call configureReikaUi() once at app start to override.
 * Defaults work in plain React (Vite) and Next: Link = <a>, navigate = location.assign, money = Intl, t = fallback.
 */
import * as React from "react";
import { formatCurrency as defaultFormatCurrency, formatDate as defaultFormatDate, getMonthLabel as defaultGetMonthLabel } from "./lib/currency";
import { getDisplayLocale } from "./lib/locale";
import { sizeClassFor, type SizeClass } from "./ui/size-class";
import type { NoticeSource } from "./notice/types";

export type { SizeClass };

export type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  /** Accepted for next/link compatibility; ignored by the default <a>. */
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

export interface ReikaUiConfig {
  /** Router link. Must forward a ref and accept className/onClick/data-*. Default: <a>. */
  Link: React.ComponentType<LinkProps & React.RefAttributes<HTMLAnchorElement>>;
  /** Imperative navigation. Default: location.assign / location.replace. */
  useNavigate: () => (href: string, opts?: { replace?: boolean }) => void;
  /** Money formatter. Default: Intl-based formatCurrency (VND/JPY/KRW no decimals, C$ A$ ... prefixes). */
  formatMoney: (amount: number, currency?: string, opts?: { decimals?: number }) => string;
  /** Date formatter for "YYYY-MM-DD" strings. Default: dd/mm/yyyy (ja: yyyy/mm/dd) via lib/locale. */
  formatDate: (isoDate: string) => string;
  /** "YYYY-MM" month label. Default: Intl short month + year. */
  formatMonth: (yyyyMm: string) => string;
  /** UI string lookup: t(key, fallback, vars). Default returns the fallback (or key) with {var} interpolation. */
  t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
  /** Viewport size class (compact < 640, regular <= 1024, wide). Default: documentElement width observer. */
  useSizeClass: () => SizeClass;
  /** Display currency of the signed-in user. Default: { displayCurrency: defaultCurrency }. */
  useDisplayCurrency: () => { displayCurrency: string; setDisplayCurrency: (code: string) => Promise<void>; isLoading: boolean };
  /** Active display locale (Intl tag, e.g. "vi-VN"). Default: lib/locale getDisplayLocale(). */
  useLanguage: () => { locale: string };
  /** Signed-in user id for per-user persistence (dismissed notices). Default: { userId: "local", ready: true }. */
  useUserId: () => { userId: string | null; ready: boolean };
  /** Per-user storage. Default: localStorage `${base}:${userId}`, errors swallowed. */
  storage: {
    read: (base: string, userId: string | null) => string | null;
    write: (base: string, userId: string | null, value: string) => boolean;
  };
  /** Renders <Notice source="..."> (self-fetching banners are app-specific). Default: renders nothing. */
  NoticeFeed: React.ComponentType<{ source: NoticeSource }>;
  /** Currency returned by the default useDisplayCurrency. */
  defaultCurrency: string;
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const DefaultLink = React.forwardRef<HTMLAnchorElement, LinkProps>(function ReikaDefaultLink(
  { prefetch: _prefetch, replace: _replace, scroll: _scroll, ...rest },
  ref,
) {
  return <a ref={ref} {...rest} />;
});

function defaultUseSizeClass(): SizeClass {
  const [sc, setSc] = React.useState<SizeClass>("compact");
  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => setSc(sizeClassFor(root.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
  return sc;
}

const storageKey = (base: string, userId: string | null) => `${base}:${userId ?? "anon"}`;

const config: ReikaUiConfig = {
  Link: DefaultLink,
  useNavigate: () => (href, opts) => {
    if (opts?.replace) window.location.replace(href);
    else window.location.assign(href);
  },
  formatMoney: (amount, currency, opts) => defaultFormatCurrency(amount, currency, opts),
  formatDate: (d) => defaultFormatDate(d),
  formatMonth: (m) => defaultGetMonthLabel(m),
  t: (key, fallback, vars) => {
    let s = fallback ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  },
  useSizeClass: defaultUseSizeClass,
  useDisplayCurrency: () => ({ displayCurrency: config.defaultCurrency, setDisplayCurrency: async () => {}, isLoading: false }),
  useLanguage: () => ({ locale: getDisplayLocale() }),
  useUserId: () => ({ userId: "local", ready: true }),
  storage: {
    read: (base, userId) => {
      try { return localStorage.getItem(storageKey(base, userId)); } catch { return null; }
    },
    write: (base, userId, value) => {
      try { localStorage.setItem(storageKey(base, userId), value); return true; } catch { return false; }
    },
  },
  NoticeFeed: () => null,
  defaultCurrency: "USD",
};

/** Override any adapter. Call once, before the first render (module top of your entry file). */
export function configureReikaUi(partial: Partial<ReikaUiConfig>): void {
  Object.assign(config, partial);
}

export function getReikaUiConfig(): Readonly<ReikaUiConfig> {
  return config;
}

// ── stable wrappers the components import (they read `config` at call/render time) ─────────────────────────────

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function ReikaLink(props, ref) {
  const L = config.Link;
  return <L ref={ref} {...props} />;
});
export const useNavigate = () => config.useNavigate();
export const formatMoney = (amount: number, currency?: string, opts?: { decimals?: number }) => config.formatMoney(amount, currency, opts);
/** Same signature as the app's formatCurrency; routes through formatMoney. */
export const formatCurrency = formatMoney;
export const formatDate = (isoDate: string) => config.formatDate(isoDate);
export const getMonthLabel = (yyyyMm: string) => config.formatMonth(yyyyMm);
export const t = (key: string, fallback?: string, vars?: Record<string, string | number>) => config.t(key, fallback, vars);
export const useSizeClass = () => config.useSizeClass();
/** Alias kept so adaptive/disclosure.tsx (originally useAppSizeClass) needs no code change. */
export const useAppSizeClass = useSizeClass;
export const useDisplayCurrency = () => config.useDisplayCurrency();
export const useLanguage = () => config.useLanguage();
export const useSessionUserId = () => config.useUserId();
export const readUserItem = (base: string, userId: string | null) => config.storage.read(base, userId);
export const writeUserItem = (base: string, userId: string | null, value: string) => config.storage.write(base, userId, value);
export function NoticeFeed(props: { source: NoticeSource }) {
  const F = config.NoticeFeed;
  return <F {...props} />;
}
