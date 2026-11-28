import { describe, expect, it } from "vitest";
import {
  clubDecisionNotice,
  clubRequestNotice,
  pushSubscriptionSchema,
  rideChangeNotice,
  rideDecisionNotice,
  rideRequestNotice,
} from "@/lib/pushNotices";

describe("push notices (G11)", () => {
  const id = "3f2b6a1e-1111-4222-8333-944445555666";

  it("name the ride or club and what happened, and open its page", () => {
    expect(rideRequestNotice("Sunday ghat run", id)).toEqual({
      title: "Sunday ghat run",
      body: "Someone asked to join your ride.",
      url: `/group-rides/${id}`,
    });
    expect(rideDecisionNotice("Sunday ghat run", id, "approve").body).toMatch(/You're in/);
    expect(rideChangeNotice("Sunday ghat run", id, "cancelled").body).toMatch(
      /called this ride off/,
    );
    expect(clubRequestNotice("Hill riders", "hill-riders").url).toBe("/clubs/hill-riders");
    expect(clubDecisionNotice("Hill riders", "hill-riders", false).body).toMatch(/could not/);
  });

  it("never carry a meeting point, a WhatsApp link or a room", () => {
    const all = [
      rideRequestNotice("R", id),
      ...(["approve", "waitlist", "decline", "remove"] as const).map((d) =>
        rideDecisionNotice("R", id, d),
      ),
      ...(["cancelled", "restored", "time"] as const).map((w) => rideChangeNotice("R", id, w)),
    ];
    for (const n of all) {
      expect(JSON.stringify(n)).not.toMatch(/wa\.me|whatsapp\.com|\/ride\/|maps|\d+\.\d{3,}/i);
    }
  });

  it("take a browser's https push subscription only", () => {
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    expect(pushSubscriptionSchema.safeParse(sub).success).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({ ...sub, endpoint: "http://example.org/x" }).success,
    ).toBe(false);
  });
});
