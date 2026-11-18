import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/koulen";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Summertime — Commit together. Settle together.", template: "%s · Summertime" },
  description: "Private, all-or-nothing settlement for importers who share shipping containers, built on Canton Network with USDCx.",
  metadataBase: new URL("https://summertime-app.netlify.app"),
  applicationName: "Summertime",
  openGraph: {
    type: "website",
    siteName: "Summertime",
    title: "Summertime — Commit together. Settle together.",
    description: "Share a container. Pay only when it fills. Built on Canton with USDCx.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Summertime — Commit together. Settle together.",
    description: "Share a container. Pay only when it fills. Built on Canton with USDCx.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f2ee",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
