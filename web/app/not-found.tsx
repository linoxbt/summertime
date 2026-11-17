import Link from "next/link";
import { PublicPage } from "@/components/public";

export default function NotFound() {
  return (
    <PublicPage>
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl font-semibold text-fg">Page not found</h1>
        <p className="mt-2 text-muted">The page you were looking for doesn&apos;t exist.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-strong">
          Go home
        </Link>
      </div>
    </PublicPage>
  );
}
