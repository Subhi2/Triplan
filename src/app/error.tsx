"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Something broke while showing a page: say so plainly and offer a retry. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-4 px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">
        Something went wrong on the way
      </h1>
      <p className="text-stone-600 dark:text-stone-400">
        The page could not be shown. It is usually a passing problem with one of the services we
        use; try again in a moment.
        {error.digest && (
          <span className="tabular block font-mono text-xs">Reference: {error.digest}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="bg-brand inline-flex min-h-12 items-center rounded-xl px-5 font-bold text-white md:min-h-11"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 px-5 font-bold md:min-h-11 dark:border-stone-600"
        >
          Back to the planner
        </Link>
      </div>
    </main>
  );
}
