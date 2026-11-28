import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";
import { cardOptions, TripCard } from "@/server/og/shareCards";

const whole = (v: string | null, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/**
 * GET /og/year?y=2026&r=12&km=3400&hp=180: "My year in rides" card (1200×630 PNG, G11). The
 * rider's own totals from "My rides", sent in the link: numbers only, no nickname, no places.
 */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const year = whole(p.get("y"), 2100);
  const rides = whole(p.get("r"), 10_000);
  const km = whole(p.get("km"), 10_000_000);
  const hairpins = whole(p.get("hp"), 1_000_000);
  const ok = year !== null && year >= 2000 && rides !== null && km !== null;
  const facts = ok
    ? [
        `${rides} ${rides === 1 ? "ride" : "rides"}`,
        `${km.toLocaleString("en-IN")} km`,
        hairpins ? `${hairpins.toLocaleString("en-IN")} hairpins` : null,
      ].filter((f): f is string => Boolean(f))
    : [];
  return new ImageResponse(
    <TripCard
      title={ok ? `My ${year} in rides` : undefined}
      headline={ok ? `${km.toLocaleString("en-IN")} km on the road` : SITE_NAME}
      facts={facts}
      line={[]}
      stops={[]}
    />,
    await cardOptions(),
  );
}
