import type { Metadata } from "next";
import { Eyebrow, PublicPage } from "@/components/public";
import { AnatomySection, CantonSection, HowItWorksSection, PrivacySection, QuestionsSection, SailingsSection } from "@/components/sections";
import { TrustModelSection } from "@/components/trust-model";

export const metadata: Metadata = { title: "Docs" };

const CONTENTS = [
  { id: "how-it-works", label: "How it works" },
  { id: "anatomy", label: "The box" },
  { id: "sailings", label: "Sailings" },
  { id: "privacy", label: "Who sees what" },
  { id: "why-canton", label: "Why Canton" },
  { id: "questions", label: "Questions" },
  { id: "trust-model", label: "Trust model" },
];

/** Everything that explains Summertime, in one place. */
export default function DocsPage() {
  return (
    <PublicPage>
      <div className="mx-auto w-full max-w-6xl flex-1 border-x border-line">
        <div className="border-b border-line px-4 py-10 sm:px-6">
          <Eyebrow>Docs</Eyebrow>
          <h1 className="display mt-6 text-5xl text-fg sm:text-7xl">Docs.</h1>
          <p className="mt-3 text-muted">How Summertime works, in one place.</p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-line lg:block">
            <nav aria-label="Contents" className="sticky top-20 p-6">
              <p className="label text-faint">Contents</p>
              <ol className="mt-3 space-y-1">
                {CONTENTS.map((c, i) => (
                  <li key={c.id}>
                    <a href={`#${c.id}`} className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-panel hover:text-fg">
                      <span className="label text-faint">{String(i + 1).padStart(2, "0")}</span>
                      {c.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0">
            <nav aria-label="Contents" className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3 lg:hidden">
              {CONTENTS.map((c) => (
                <a key={c.id} href={`#${c.id}`} className="flex-none rounded-full border border-line-strong bg-panel px-3 py-1.5 text-sm text-muted hover:text-fg">
                  {c.label}
                </a>
              ))}
            </nav>
            <HowItWorksSection />
            <AnatomySection />
            <SailingsSection />
            <PrivacySection />
            <CantonSection />
            <QuestionsSection />
            <TrustModelSection />
          </div>
        </div>
      </div>
    </PublicPage>
  );
}
