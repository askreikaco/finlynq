import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { JsonLd, organizationSchema } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/seo/site";
import "./globals.css";

/** Inline script run before first paint to apply the stored font preference.
 *  Mirrors next-themes FOUC pattern — nonce carried by the <script> tag.
 *  storageKey must match FONT_STORAGE_KEY in font-provider.tsx. */
const FONT_FOUC_SCRIPT = `(function(){try{var k=localStorage.getItem("pf-font");var v=["rounded","serif","mono"];if(k&&v.indexOf(k)!==-1){document.documentElement.setAttribute("data-font",k)}}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Finlynq: open-source personal finance with a first-party MCP server",
  description:
    "Finlynq: open-source personal finance with a first-party MCP server. Free hosted at finlynq.com/cloud, or self-host with Docker. AGPL v3.",
  applicationName: "Finlynq",
  keywords: [
    "personal finance",
    "open source personal finance",
    "self-hosted personal finance",
    "MCP server",
    "Model Context Protocol",
    "budgeting app",
    "Claude personal finance",
    "AGPL personal finance",
  ],
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Finlynq",
  },
  openGraph: {
    type: "website",
    siteName: "Finlynq",
    locale: "en_US",
    url: "/",
    title: "Finlynq: track your money here, analyze it anywhere",
    description:
      "Open-source personal finance with a first-party MCP server. Connect Claude, Cursor, or any AI assistant. Per-user envelope encryption. Self-host or free cloud.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Finlynq: track your money here, analyze it anywhere",
    description:
      "Open-source personal finance with a first-party MCP server. Connect any AI assistant. Self-host or free cloud.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Owner 2026-10-01: app-like, no pinch/double-tap/focus zoom (iOS home-screen app).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Chrome Android honours this (Safari ignores it); the keyboard inset hook covers iOS.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0e11" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce set by middleware (B10 / finding C-8). Forwarded
  // to next-themes so its FOUC-prevention inline script carries the nonce.
  // Falls back to undefined if middleware didn't run (e.g. static export);
  // next-themes treats `undefined` as "no nonce".
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      {/* FOUC-prevention for font preference (FINLYNQ-225).
          Runs before paint, sets data-font on <html> from localStorage.
          nonce required by strict-dynamic CSP (mirrors next-themes pattern). */}
      <head>
        <script
          suppressHydrationWarning
          nonce={typeof window === "undefined" ? nonce : ""}
          dangerouslySetInnerHTML={{ __html: FONT_FOUC_SCRIPT }}
        />
      </head>
      <body className="antialiased noise-bg">
        <PwaRegister />
        <JsonLd data={organizationSchema()} />
        {/* iOS standalone PWA: opaque strip behind the translucent status bar. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
