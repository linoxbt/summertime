import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Contact", description: "Talk to the Summertime team: join the pilot, get help, or make a privacy request." };

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
