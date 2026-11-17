import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/mona-sans";
import "@fontsource-variable/martian-mono";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Summertime — Commit together. Settle together.", template: "%s · Summertime" },
  description: "Private, all-or-nothing settlement for importers who share shipping containers, built on Canton Network with USDCx.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050817",
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
