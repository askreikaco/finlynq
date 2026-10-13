import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { DensityProvider } from "@/components/adaptive/density-provider";
import { JsonLd, organizationSchema } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/seo/site";
import "./globals.css";

/** Inline script run before first paint to apply the stored font preference.
 *  Mirrors next-themes FOUC pattern — nonce carried by the <script> tag.
 *  storageKey must match FONT_STORAGE_KEY in font-provider.tsx. */
const FONT_FOUC_SCRIPT = `(function(){try{var k=localStorage.getItem("pf-font");var v=["rounded","serif","mono"];if(k&&v.indexOf(k)!==-1){document.documentElement.setAttribute("data-font",k)}}catch(e){}})();`;

/** G2-08: device-level density (pf-density). Sets data-density=compact before paint; the
 *  DensityProvider syncs state after mount. storageKey must match DENSITY_STORAGE_KEY. */
const DENSITY_FOUC_SCRIPT = `(function(){try{var k=localStorage.getItem("pf-density");if(k==="compact"){document.documentElement.setAttribute("data-density",k)}}catch(e){}})();`;

/** iOS launch images (solid #1c1c1d, 512 icon centred). Media queries match the device
 *  CSS size and DPR; a device with no match falls back to the plain background colour. */
const APPLE_STARTUP_IMAGES: { url: string; media: string }[] = [
  // iPhone SE (2nd/3rd gen), 8, 7, 6s
  { url: "/splash/splash-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPhone 11, XR
  { url: "/splash/splash-828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPhone 12, 13, 14
  { url: "/splash/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 14 Pro, 15, 15 Pro, 16
  { url: "/splash/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 12 Pro Max, 13 Pro Max
  { url: "/splash/splash-1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 14 Plus, 15 Plus, 15 Pro Max
  { url: "/splash/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 16 Plus, 16 Pro Max
  { url: "/splash/splash-1320x2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
];

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
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    // Opaque status bar (not the translucent variant): scrolled content passes under the
    // status bar because body padding only covers the at-rest position. See tests/ios/statusbar.test.ts.
    statusBarStyle: "black",
    title: "Finlynq",
    startupImage: APPLE_STARTUP_IMAGES,
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
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1d" },
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
        <script
          suppressHydrationWarning
          nonce={typeof window === "undefined" ? nonce : ""}
          dangerouslySetInnerHTML={{ __html: DENSITY_FOUC_SCRIPT }}
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
          <DensityProvider>{children}</DensityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
