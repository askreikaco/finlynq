import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Visual pill is native-sized (px14 py8, r8, 14/700); the ::after extends the hit area to 44px.
const PILL =
  "relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3.5 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";

type Common = { className?: string; children?: React.ReactNode };

/** Primary header pill ("+ Add"). Renders a Link when `href` is given, else a button. */
export function PillButton(
  props: (Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) |
    (Common & { href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>),
) {
  if (props.href !== undefined) {
    const { href, className, children, ...rest } = props;
    return (
      <Link data-slot="pill-button" href={href} className={cn(PILL, className)} {...rest}>
        {children}
      </Link>
    );
  }
  const { className, children, type = "button", ...rest } = props;
  return (
    <button data-slot="pill-button" type={type} className={cn(PILL, className)} {...rest}>
      {children}
    </button>
  );
}
