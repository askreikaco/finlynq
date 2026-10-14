import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { getNavigator, go, isStale, parseHref } from "../nav-state";

type UrlObject = { pathname?: string | null; query?: Record<string, unknown> | string | null; hash?: string | null };

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | UrlObject | URL;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  shallow?: boolean;
  legacyBehavior?: boolean;
  passHref?: boolean;
};

function hrefToString(href: LinkProps["href"]): string {
  if (typeof href === "string") return href;
  if (href instanceof URL) return href.pathname + href.search + href.hash;
  const q = href.query;
  const qs = typeof q === "string" ? q : q ? new URLSearchParams(q as Record<string, string>).toString() : "";
  return `${href.pathname ?? ""}${qs ? `?${qs}` : ""}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
}

/**
 * next/link replacement. In-app transition when the SPA serves the target; otherwise the plain
 * <a> default (a full page load, so Next SSR serves it). Never intercepts modified clicks.
 */
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, scroll: _scroll, prefetch: _prefetch, shallow: _shallow, legacyBehavior: _lb, passHref: _ph, onClick, children, ...rest },
  ref,
) {
  const to = hrefToString(href);
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    if (rest.download != null) return;
    const url = parseHref(to);
    if (!url || url.origin !== window.location.origin) return;
    const nav = getNavigator();
    if (!nav || isStale() || !nav.isSpaPath(url.pathname)) return; // browser does a full navigation
    e.preventDefault();
    go(to, replace);
  };
  return (
    <a ref={ref} href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
});

export default Link;
export { Link };
