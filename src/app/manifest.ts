import type { MetadataRoute } from "next";

/** App chrome colour (dark page bg, #1c1c1d). Manifest takes one value; the light
 *  scheme's <meta name=theme-color> comes from the viewport export in layout.tsx. */
const APP_BG = "#1c1c1d";

const ICON_192 = { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" } as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finlynq",
    short_name: "Finlynq",
    description: "Personal finance tracker and portfolio manager",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: APP_BG,
    theme_color: APP_BG,
    id: "/dashboard",
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    icons: [
      { ...ICON_192, purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Add transaction", short_name: "Add", url: "/transactions/new", icons: [ICON_192] },
      { name: "Accounts", short_name: "Accounts", url: "/accounts", icons: [ICON_192] },
      { name: "Budgets", short_name: "Budgets", url: "/budgets", icons: [ICON_192] },
    ],
    categories: ["finance", "productivity"],
    screenshots: [],
  };
}
