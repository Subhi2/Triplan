import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceDetail } from "@/lib/placeDetail";

vi.mock("@/server/services/placeDetailService", () => ({ getPlaceDetail: vi.fn() }));

const { getPlaceDetail } = await import("@/server/services/placeDetailService");
const { GET } = await import("@/app/api/places/[slug]/route");

const get = (slug: string) =>
  GET(new Request(`http://localhost/api/places/${slug}`), { params: Promise.resolve({ slug }) });

describe("GET /api/places/[slug]", () => {
  beforeEach(() => {
    vi.mocked(getPlaceDetail).mockReset().mockResolvedValue(null);
  });

  it("returns the place", async () => {
    const place = { slug: "manjarabad-fort", name: "Manjarabad Fort" } as PlaceDetail;
    vi.mocked(getPlaceDetail).mockResolvedValue(place);
    const res = await get("manjarabad-fort");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ place });
  });

  it("is 404 for an unknown place", async () => {
    const res = await get("no-such-place");
    expect(res.status).toBe(404);
    expect(getPlaceDetail).toHaveBeenCalledWith("no-such-place");
  });

  it("does not query for malformed slugs", async () => {
    const res = await get("Robert'); DROP TABLE place;--");
    expect(res.status).toBe(404);
    expect(getPlaceDetail).not.toHaveBeenCalled();
  });
});
