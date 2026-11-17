import type { Metadata } from "next";
import { SectionPage } from "@/components/section-page";
import { QuestionsSection } from "@/components/sections";

export const metadata: Metadata = { title: "Questions" };

export default function Page() {
  return (
    <SectionPage href="/questions">
      <QuestionsSection standalone />
    </SectionPage>
  );
}
