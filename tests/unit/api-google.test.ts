import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = { googleEnabled: true };
vi.mock("@/lib/google", () => ({
  get googleEnabled() {
    return flags.googleEnabled;
  },
}));
vi.mock("@/server/services/googleGapService", () => ({
  getGoogleGapFill: vi.fn(),
  getGooglePlaceId: vi.fn(),
}));
const google = { photoUri: vi.fn() };
vi.mock("@/server/providers/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/providers/google")>()),
  getGooglePlacesProvider: () => google,
}));
const takeGoogleBudget = vi.fn();
vi.mock("@/server/providers/google/budget", () => ({ takeGoogleBudget }));
const allowRequestOrOpen = vi.fn();
vi.mock("@/server/services/writeLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/writeLimit")>()),
  allowRequestOrOpen,
}));

const { getGoogleGapFill, getGooglePlaceId } = await import("@/server/services/googleGapService");
const gapRoute = await import("@/app/api/places/[slug]/google/route");
const mapsRoute = await import("@/app/api/places/[slug]/google-maps/route");
const photoRoute = await import("@/app/api/google/photo/route");

const withSlug = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (path: string) => new Request(`http://localhost${path}`);

beforeEach(() => {
  flags.googleEnabled = true;
  vi.mocked(getGoogleGapFill).mockReset().mockResolvedValue(null);
  vi.mocked(getGooglePlaceId).mockReset().mockResolvedValue(null);
  google.photoUri.mockReset().mockResolvedValue("https://lh3.googleusercontent.com/p/x=w800");
  takeGoogleBudget.mockReset().mockResolvedValue(true);
  allowRequestOrOpen.mockReset().mockResolvedValue(true);
});

describe("per-visitor Google limits", () => {
  it("stops one visitor from using up the day's budget", async () => {
    allowRequestOrOpen.mockResolvedValue(false);
    const gap = await gapRoute.GET(req("/"), withSlug("manjarabad-fort"));
    expect(await gap.json()).toEqual({ googlePlaceId: null, fill: null });
    expect(getGoogleGapFill).not.toHaveBeenCalled();
    const photo = await photoRoute.GET(req("/api/google/photo?name=places/x/photos/y"));
    expect(photo.status).toBe(429);
    expect(takeGoogleBudget).not.toHaveBeenCalled();
  });
});

describe("GET /api/places/[slug]/google", () => {
  it("returns the gap fill, never cached", async () => {
    vi.mocked(getGoogleGapFill).mockResolvedValue({ googlePlaceId: "ChIJx", fill: null });
    const res = await gapRoute.GET(req("/"), withSlug("manjarabad-fort"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ googlePlaceId: "ChIJx", fill: null });
  });

  it("calls nothing when the Google map is off", async () => {
    flags.googleEnabled = false;
    const res = await gapRoute.GET(req("/"), withSlug("manjarabad-fort"));
    expect(await res.json()).toEqual({ googlePlaceId: null, fill: null });
    expect(getGoogleGapFill).not.toHaveBeenCalled();
  });

  it("is 404 for unknown or malformed places, 502 when Google fails", async () => {
    expect((await gapRoute.GET(req("/"), withSlug("no-such-place"))).status).toBe(404);
    expect((await gapRoute.GET(req("/"), withSlug("x'; DROP"))).status).toBe(404);
    vi.mocked(getGoogleGapFill).mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await gapRoute.GET(req("/"), withSlug("manjarabad-fort"))).status).toBe(502);
  });
});

describe("GET /api/places/[slug]/google-maps", () => {
  it("redirects to the exact place, or the name at its spot", async () => {
    const fort = { name: "Manjarabad Fort", location: [75.7581, 12.9173] as [number, number] };
    vi.mocked(getGooglePlaceId).mockResolvedValue({ ...fort, googlePlaceId: "ChIJfort" });
    let res = await mapsRoute.GET(req("/"), withSlug("manjarabad-fort"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("query_place_id=ChIJfort");

    vi.mocked(getGooglePlaceId).mockResolvedValue({ ...fort, googlePlaceId: null });
    res = await mapsRoute.GET(req("/"), withSlug("manjarabad-fort"));
    expect(res.headers.get("Location")).toBe(
      "https://www.google.com/maps/search/Manjarabad%20Fort/@12.9173,75.7581,17z",
    );
  });
});

describe("GET /api/google/photo", () => {
  const photo = (name: string) =>
    photoRoute.GET(req(`/api/google/photo?name=${encodeURIComponent(name)}`));

  it("redirects to Google's short-lived photo URL, never cached", async () => {
    const res = await photo("places/ChIJfort/photos/P1");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://lh3.googleusercontent.com/p/x=w800");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(takeGoogleBudget).toHaveBeenCalledWith("photo");
  });

  it("refuses names that are not Google photos", async () => {
    expect((await photo("places/../../v1/places:searchText")).status).toBe(400);
    expect(google.photoUri).not.toHaveBeenCalled();
  });

  it("stops when the day's photo budget is used up, or the Google map is off", async () => {
    takeGoogleBudget.mockResolvedValue(false);
    expect((await photo("places/ChIJfort/photos/P1")).status).toBe(429);
    flags.googleEnabled = false;
    expect((await photo("places/ChIJfort/photos/P1")).status).toBe(404);
    expect(google.photoUri).not.toHaveBeenCalled();
  });
});
