import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClubForm } from "@/components/community/ClubForm";
import { RiderProvider } from "@/components/community/RiderGate";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Start a club · ${SITE_NAME}`,
  robots: { index: false, follow: true },
};

/** Start a club: live at once, owned by the rider who starts it. */
export default function NewClubPage() {
  if (!communityEnabled) notFound();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/clubs" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Start a club</h1>
        <p className="text-stone-600 dark:text-stone-400">
          You own the club: you decide who joins, pick admins to help, and host its rides.
        </p>
      </header>
      <RiderProvider>
        <ClubForm />
      </RiderProvider>
      <SiteFooter />
    </main>
  );
}
