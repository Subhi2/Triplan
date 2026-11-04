import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MePanel } from "@/components/community/MePanel";
import { RiderProvider } from "@/components/community/RiderGate";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Me · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The rider's own page: nickname, clubs, rides and account (docs/02, "Community (G6)"). */
export default async function MePage({ searchParams }: Props) {
  if (!communityEnabled) notFound();
  const linkFailed = (await searchParams).link === "failed";
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/me" />
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Me</h1>
      <RiderProvider>
        <MePanel linkFailed={linkFailed} />
      </RiderProvider>
      <SiteFooter />
    </main>
  );
}
