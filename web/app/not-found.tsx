import Link from "next/link";
import { PublicPage } from "@/components/public";

export default function NotFound() {
  return (
    <PublicPage>
      <div className="mx-auto max-w-6xl border-x border-line px-4 py-24 text-center">
        <p className="label text-faint">Error 404 · No such berth</p>
        <h1 className="display mt-4 text-6xl text-fg sm:text-8xl">Lost at sea.</h1>
        <p className="mt-3 text-muted">This page doesn&apos;t exist.</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center bg-fg px-5 font-medium text-page hover:bg-accent-strong">
          Back to port
        </Link>
      </div>
    </PublicPage>
  );
}
