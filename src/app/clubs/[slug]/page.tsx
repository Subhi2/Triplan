import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubDetail } from "@/components/community/ClubDetail";
import { RiderProvider } from "@/components/community/RiderGate";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import {
  CLUB_JOIN_LABELS,
  clubSlugSchema,
  COMMUNITY_VEHICLE_LABELS,
} from "@/lib/community/schemas";
import { SITE_NAME } from "@/lib/site";
import { clubBySlug } from "@/server/services/clubService";

// Members change at any time; the viewer's own part loads in the browser.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const loadClub = cache(async (slug: string) =>
  communityEnabled && clubSlugSchema.safeParse(slug).success ? clubBySlug(slug) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await loadClub((await params).slug);
  if (!club) return { title: `Club not found · ${SITE_NAME}` };
  const description = `${club.name}, a riding club from ${club.homeLabel}: ${club.members} members${club.about ? `. ${club.about.slice(0, 140)}` : ""}`;
  return {
    title: `${club.name} · ${SITE_NAME}`,
    description,
    alternates: { canonical: `/clubs/${club.slug}` },
    openGraph: { siteName: SITE_NAME, type: "website", title: club.name, description },
  };
}

/** A club's page: the public header here, the viewer's part (join, members, admin) in ClubDetail. */
export default async function ClubPage({ params, searchParams }: Props) {
  const club = await loadClub((await params).slug);
  if (!club) notFound();
  const invite = (await searchParams).invite;
  const token = typeof invite === "string" && /^[A-Za-z0-9_-]{43}$/.test(invite) ? invite : null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/clubs" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          {club.name}
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          {club.homeLabel} · {COMMUNITY_VEHICLE_LABELS[club.vehicle]} ·{" "}
          {CLUB_JOIN_LABELS[club.joinPolicy]} ·{" "}
          <span className="tabular font-mono">{club.members}</span>{" "}
          {club.members === 1 ? "member" : "members"}
        </p>
        {club.about && <p className="max-w-2xl whitespace-pre-line">{club.about}</p>}
      </header>
      <RiderProvider>
        <ClubDetail initial={club} invite={token} />
      </RiderProvider>
      <SiteFooter />
    </main>
  );
}
