import { describe, expect, it } from "vitest";
import {
  rankingRating,
  reportExpiresAt,
  reviewInputSchema,
  roadReportInputSchema,
} from "@/lib/riderPosts";

const review = {
  rating: 4,
  body: "Steps are steep after rain.  \n\n\n\nGo early.",
  nickname: " Asha ",
  visitedMonth: 7,
  visitedYear: 2026,
  vehicleUsed: "bike" as const,
};

describe("reviewInputSchema", () => {
  it("tidies the text and the nickname", () => {
    expect(reviewInputSchema.parse(review)).toMatchObject({
      body: "Steps are steep after rain.\n\nGo early.",
      nickname: "Asha",
    });
  });

  it("refuses a rating outside 1–5, a long body, or a year without a month", () => {
    expect(reviewInputSchema.safeParse({ ...review, rating: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, rating: 3.5 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, body: "x".repeat(1001) }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, nickname: "" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...review, visitedMonth: null }).success).toBe(false);
    expect(
      reviewInputSchema.safeParse({ ...review, visitedMonth: null, visitedYear: null }).success,
    ).toBe(true);
  });
});

describe("road reports", () => {
  const report = {
    kind: "landslide",
    location: [75.36, 13.23],
    note: "One lane open",
    nickname: null,
  };

  it("are for roads in India", () => {
    expect(roadReportInputSchema.safeParse(report).success).toBe(true);
    expect(roadReportInputSchema.safeParse({ ...report, location: [2.35, 48.85] }).success).toBe(
      false,
    );
    expect(roadReportInputSchema.safeParse({ ...report, kind: "traffic" }).success).toBe(false);
  });

  it("expire after 72 hours for blockages and 24 for potholes and diversions", () => {
    const at = new Date("2026-10-23T06:00:00Z");
    expect(reportExpiresAt("landslide", at).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(reportExpiresAt("closed", at).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(reportExpiresAt("potholes", at).toISOString()).toBe("2026-10-24T06:00:00.000Z");
  });
});

describe("rankingRating", () => {
  it("keeps one 5-star review below fifty 4.5-star ones", () => {
    const one = rankingRating(5, 1)!;
    const fifty = rankingRating(4.5, 50)!;
    expect(one).toBeCloseTo(3.75, 2);
    expect(fifty).toBeGreaterThan(one);
    expect(fifty).toBeCloseTo(4.41, 2);
  });

  it("is null with no reviews", () => {
    expect(rankingRating(null, 0)).toBeNull();
    expect(rankingRating(4, 0)).toBeNull();
  });
});
