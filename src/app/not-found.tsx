import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

/** Any address that is not a page: a way back onto the road. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteNav />
      <section className="flex flex-col gap-3 py-10">
        <p className="tabular font-mono text-sm text-stone-600 dark:text-stone-400">404</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          This road doesn&apos;t go anywhere
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          The page may have moved, or the link was mistyped.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="bg-brand inline-flex min-h-12 items-center rounded-xl px-5 font-bold text-white md:min-h-11"
          >
            Plan a ride
          </Link>
          <Link
            href="/rides"
            className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 px-5 font-bold md:min-h-11 dark:border-stone-600"
          >
            Famous rides
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
