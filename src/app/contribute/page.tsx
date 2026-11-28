import type { Metadata } from "next";
import { ContributeForm } from "@/components/posts/ContributeForm";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { SITE_NAME } from "@/lib/site";
import { powKey } from "@/server/services/proofOfWork";

export const metadata: Metadata = {
  title: `Add a place · ${SITE_NAME}`,
  description: `Know a viewpoint, waterfall or temple that ${SITE_NAME} does not have? Pin it on the map.`,
  alternates: { canonical: "/contribute" },
};

/** "Add a place" (G11, A9): a rider pins a place we do not have; an admin checks it. */
export default function ContributePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteNav />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight md:text-6xl">
          Add a place
        </h1>
        <p className="text-lg">
          A viewpoint, waterfall, temple or food stop worth stopping for that is not on the map yet.
        </p>
      </header>
      <ContributeForm open={powKey() !== null} />
      <SiteFooter />
    </main>
  );
}
