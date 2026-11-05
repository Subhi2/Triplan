import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClubBrowser } from "@/components/community/ClubBrowser";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";
import { listClubs } from "@/server/services/clubService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Riding clubs · ${SITE_NAME}`,
  description: "Bike and car clubs that ride together: join one, or start your own and host rides.",
  alternates: { canonical: "/clubs" },
};

/** Riding clubs (docs/02, "Community (G6)"): the biggest first, with search and near me. */
export default async function ClubsPage() {
  if (!communityEnabled) notFound();
  const clubs = await listClubs({}).catch(() => []);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/clubs" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          Riding clubs
        </h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-400">
          Groups that ride together. Each club is run by its own owner and admins: they decide who
          joins and host the club&apos;s rides.
        </p>
      </header>
      <ClubBrowser initial={clubs} />
      <SiteFooter />
    </main>
  );
}
