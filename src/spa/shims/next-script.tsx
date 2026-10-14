import { useEffect, type ReactNode } from "react";

type Props = { src?: string; id?: string; strategy?: string; children?: ReactNode; dangerouslySetInnerHTML?: { __html: string }; onLoad?: () => void };

/**
 * next/script replacement. Only the marketing site uses it today (analytics, stays on Next).
 * External `src` scripts are appended once; inline bodies are NOT executed (SPA CSP: script-src 'self').
 */
export default function Script({ src, id, onLoad }: Props) {
  useEffect(() => {
    if (!src) return;
    const key = id ?? src;
    if (document.querySelector(`script[data-spa-script="${key}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.spaScript = key;
    if (onLoad) s.onload = onLoad;
    document.head.appendChild(s);
  }, [src, id, onLoad]);
  return null;
}
