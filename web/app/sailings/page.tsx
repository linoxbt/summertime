import type { Metadata } from "next";
import { SectionPage } from "@/components/section-page";
import { SailingsSection } from "@/components/sections";

export const metadata: Metadata = { title: "Sailings" };

export default function Page() {
  return (
    <SectionPage href="/sailings">
      <SailingsSection standalone />
    </SectionPage>
  );
}
