import type { Metadata } from "next";
import { SectionPage } from "@/components/section-page";
import { AnatomySection } from "@/components/sections";

export const metadata: Metadata = { title: "The box" };

export default function Page() {
  return (
    <SectionPage href="/the-box">
      <AnatomySection standalone />
    </SectionPage>
  );
}
