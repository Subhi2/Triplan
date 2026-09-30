import type { Metadata } from "next";
import { Suspense } from "react";
import { Nearby } from "@/components/nearby/Nearby";
import { SITE_NAME } from "@/lib/site";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const description =
  "Temples, forts, viewpoints, waterfalls and lakes you can reach from where you are, by road time.";

/** A link with a position (?at=…) is someone's search: it gets no share card and no indexing. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const withPoint = (await searchParams).at !== undefined;
  return {
    title: `Near me · ${SITE_NAME}`,
    description,
    alternates: { canonical: "/nearby" },
    robots: withPoint ? { index: false, follow: true } : undefined,
    openGraph: withPoint
      ? undefined
      : { siteName: SITE_NAME, type: "website", title: `Near me · ${SITE_NAME}`, description },
  };
}

export default function NearbyPage() {
  // useSearchParams in Nearby needs a Suspense boundary.
  return (
    <Suspense>
      <Nearby />
    </Suspense>
  );
}
