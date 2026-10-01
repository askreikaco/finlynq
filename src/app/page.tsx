import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "./landing.css";
import { LandingClient } from "@/components/landing/landing-client";
import { JsonLd, softwareApplicationSchema } from "@/components/seo/json-ld";
import { verifySessionToken } from "@/lib/auth/jwt";

// Server wrapper for the landing page. The interactive UI lives in the client
// component `LandingClient`; this file owns the page metadata + JSON-LD, which
// a `"use client"` file cannot export.
export const metadata: Metadata = {
  title:
    "Finlynq: open-source personal finance with an MCP server",
  description:
    "Open-source (AGPL v3) personal finance with a first-party MCP server. Track your money, then query it in plain English from Claude or any MCP client.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Finlynq: track your money here, analyze it anywhere",
    description:
      "Open-source personal finance with a first-party MCP server. Connect Claude, Cursor, or any AI assistant. Per-user envelope encryption. Self-host or free cloud.",
    url: "/",
    type: "website",
    siteName: "Finlynq",
  },
  twitter: {
    card: "summary_large_image",
    title: "Finlynq: track your money here, analyze it anywhere",
    description:
      "Open-source personal finance with a first-party MCP server. Connect any AI assistant. Self-host or free cloud.",
  },
};

/**
 * PF_ROOT_REDIRECT: Skip the landing page and redirect "/" to /dashboard or /cloud
 * based on session status. When disabled (unset or "0"), render the landing page normally.
 */
async function checkRedirectRoot(): Promise<void> {
  if (process.env.PF_ROOT_REDIRECT !== "1") {
    return;
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("pf_session")?.value;
  let hasValidSession = false;

  if (sessionToken) {
    try {
      const payload = await verifySessionToken(sessionToken);
      hasValidSession = Boolean(payload);
    } catch {
      // Token verification failed — treat as no session
      hasValidSession = false;
    }
  }

  if (hasValidSession) {
    redirect("/dashboard");
  } else {
    redirect("/cloud");
  }
}

export default async function HomePage() {
  await checkRedirectRoot();

  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <LandingClient />
    </>
  );
}
