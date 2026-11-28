import type { Metadata } from "next";
import Link from "next/link";
import { TakedownForm } from "@/components/posts/TakedownForm";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { SITE_NAME } from "@/lib/site";
import { powKey } from "@/server/services/proofOfWork";

export const metadata: Metadata = {
  title: `Terms · ${SITE_NAME}`,
  description: `How to use ${SITE_NAME}, what riders may post, where its data comes from, and how to ask for something to be taken down.`,
  alternates: { canonical: "/terms" },
};

const h2 = "font-display text-2xl font-bold tracking-tight";

/** Terms of use and the takedown form (G9, B1). Plain words, short. */
export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 [&_p]:max-w-prose">
      <SiteNav />
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight md:text-6xl">
          Terms
        </h1>
        <p className="text-lg">
          {SITE_NAME} is free to use. These are the few rules that come with it.
        </p>
      </header>

      <section aria-labelledby="use" className="flex flex-col gap-2">
        <h2 id="use" className={h2}>
          Plan with it, ride with your own judgement
        </h2>
        <p>
          Routes, places, fuel gaps, weather, alerts and road rules are a guide, not a promise.
          Roads close, pumps run dry and rules change. Every road rule and official alert links to
          its source with the date it was checked: check there before you ride, and follow the
          signs, the police and the forest department on the road. Ride within the law and your
          limits. We are not responsible for loss, injury or fines on a ride planned here.
        </p>
      </section>

      <section aria-labelledby="posts" className="flex flex-col gap-2">
        <h2 id="posts" className={h2}>
          What riders post
        </h2>
        <p>
          Reviews, photos, road reports, clubs and group rides are written by riders. Post only what
          you saw yourself and photos you took. No abuse, ads, other people&apos;s personal details
          or photos of people who did not agree. By posting a photo you let it be shown here with
          your name as the author. Club owners and ride hosts run their own spaces; we take things
          down only when they break these rules or the law.
        </p>
      </section>

      <section aria-labelledby="data" className="flex flex-col gap-2">
        <h2 id="data" className={h2}>
          Our data and its licences
        </h2>
        <p>
          Map data comes from OpenStreetMap contributors under the ODbL; photos keep their
          authors&apos; licences, shown with each one; other sources and their licences are listed
          on the{" "}
          <Link href="/about" className="underline">
            About page
          </Link>
          . Google photos and reviews, where shown, stay under Google&apos;s terms and are never
          stored here.
        </p>
      </section>

      <section aria-labelledby="takedown" className="flex flex-col gap-3">
        <h2 id="takedown" className={h2}>
          Ask for a takedown
        </h2>
        <p>
          If something here uses your photo or text without permission, shows you or your details,
          or is abusive, unsafe or false, tell us below. We read every request and take down what
          should not be here.
        </p>
        <TakedownForm open={powKey() !== null} />
      </section>
      <SiteFooter />
    </main>
  );
}
