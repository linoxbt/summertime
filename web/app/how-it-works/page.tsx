import type { Metadata } from "next";
import { SectionPage } from "@/components/section-page";
import { HowItWorksSection } from "@/components/sections";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return (
    <SectionPage href="/how-it-works">
      <HowItWorksSection standalone />
    </SectionPage>
  );
}
