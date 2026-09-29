import { ImageResponse } from "next/og";
import { categoryStyle } from "@/lib/categories";
import { bestTimeSummary } from "@/lib/months";
import { PLACE_SLUG_PATTERN, VEHICLE_LABELS } from "@/lib/placeDetail";
import { SITE_NAME } from "@/lib/site";
import { CARD_SIZE, cardOptions, PlaceCard } from "@/server/og/shareCards";
import { getPlaceDetail } from "@/server/services/placeDetailService";

export const alt = `A place on ${SITE_NAME}`;
export const size = CARD_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

/** The card a place's link shows: its photo (when we have one), category, area and best time. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = PLACE_SLUG_PATTERN.test(slug) ? await getPlaceDetail(slug) : null;
  if (!place) {
    return new ImageResponse(
      <PlaceCard
        name={SITE_NAME}
        category="Place"
        color="#0f766e"
        area={null}
        photoUrl={null}
        line={null}
      />,
      await cardOptions(),
    );
  }
  const style = categoryStyle(place.category);
  const photo = place.media[0];
  const best = place.guide?.bestMonths.length ? bestTimeSummary(place.guide.bestMonths) : null;
  const vehicles = place.guide?.bestVehicles.map((v) => VEHICLE_LABELS[v]).join(" or ");
  return new ImageResponse(
    <PlaceCard
      name={place.name}
      category={style.name}
      color={style.color}
      area={[place.district, place.state].filter(Boolean).join(", ") || null}
      photoUrl={photo ? (photo.thumbUrl ?? photo.url) : null}
      line={[best, vehicles].filter(Boolean).join(" · ") || null}
    />,
    await cardOptions(),
  );
}
