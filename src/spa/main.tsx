import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, matchRoutes, RouterProvider, useRouteError, type RouteObject } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { DensityProvider } from "@/components/adaptive/density-provider";
import "@/app/globals.css";
import AppShell from "./AppShell";
import { buildAppRoutes } from "./routes";
import { setNavigator } from "./nav-state";
import { loadFlags } from "./flags";
import { VersionWatch } from "./version-watch";
import { NotFoundError } from "./shims/next-navigation";

void loadFlags();

function Root() {
  // Same tree as src/app/layout.tsx (theme + density), plus the SPA-only version watcher.
  // next-themes' inline FOUC script is neutralised (type=application/json): CSP is script-src 'self',
  // theme-init.js (index.html) does the pre-paint work instead.
  return (
    <>
      <PwaRegister />
      <VersionWatch />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
        scriptProps={{ type: "application/json" }}
      >
        <DensityProvider>
          <AppShell />
        </DensityProvider>
      </ThemeProvider>
    </>
  );
}

function RouteError() {
  const error = useRouteError();
  const notFound = error instanceof NotFoundError;
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      {notFound ? "This page could not be found." : "Something went wrong. Reload the page to try again."}
    </div>
  );
}

const routes: RouteObject[] = [
  {
    // Root = providers + AppShell (which renders <Outlet/>); the generated routes are its children.
    Component: Root,
    ErrorBoundary: RouteError,
    HydrateFallback: () => <div className="min-h-screen" />,
    children: buildAppRoutes(),
  },
];

const router = createBrowserRouter(routes);

setNavigator({
  navigate: (to, opts) => void router.navigate(to, { replace: opts?.replace }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  isSpaPath: (pathname) => matchRoutes(routes, pathname) != null,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
