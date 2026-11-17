import type { Metadata } from "next";
import { SectionPage } from "@/components/section-page";
import { CantonSection } from "@/components/sections";

export const metadata: Metadata = { title: "Why Canton" };

export default function Page() {
  return (
    <SectionPage href="/canton">
      <CantonSection standalone />
    </SectionPage>
  );
}
