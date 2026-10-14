import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeTimeline } from "@/lib/multiDay";
import {
  arrivalAt,
  checkRules,
  closedHours,
  indiaMonth,
  roadRulesFileSchema,
  SPARE_WARN_MIN,
  type RuleOnRoute,
} from "@/lib/roadRules";

// A 300 km ride of 300 minutes, time in proportion to distance: km = riding minutes.
const timeline = routeTimeline(undefined, 300, 300);
/** A time in India (UTC+5:30), as an instant. */
const ist = (hhmm: string, day = "2026-10-15") => new Date(`${day}T${hhmm}:00+05:30`);
const istTime = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

const ban: RuleOnRoute = {
  slug: "forest-night",
  kind: "night_ban",
  title: "Forest road",
  kmFrom: 200,
  kmTo: 240,
  closedFrom: "21:00",
  closedTo: "06:00",
  vehicles: [],
  months: [],
  link: "https://example.org/ban",
  source: "A newspaper, 2025",
  checkedOn: "2026-10-14",
  note: null,
};
const epass: RuleOnRoute = {
  ...ban,
  slug: "hills-epass",
  kind: "epass",
  title: "E-pass needed",
  closedFrom: null,
  closedTo: null,
};

describe("the road rules file", () => {
  it("is valid, with unique slugs and closed hours on every night ban", () => {
    const rules = roadRulesFileSchema.parse(
      JSON.parse(readFileSync("data/road-rules.json", "utf8")),
    );
    expect(new Set(rules.map((r) => r.slug)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.link).toMatch(/^https:\/\//);
      if (r.kind === "night_ban") expect(r.closed).toBeDefined();
    }
  });

  it("refuses closed hours on anything but a night ban", () => {
    const [rule] = JSON.parse(readFileSync("data/road-rules.json", "utf8")) as object[];
    const bad = { ...rule, kind: "permit" };
    expect(roadRulesFileSchema.safeParse([bad]).success).toBe(false);
  });
});

describe("arrival times", () => {
  it("add riding time and breaks (15 min per full 2 hours)", () => {
    const at = arrivalAt(200, { departAt: ist("06:00"), timeline });
    expect(istTime(at)).toBe("09:35"); // 200 min of riding + 15 min of breaks
  });

  it("start again each day of a split at the same time of day", () => {
    const days = [
      { fromKm: 0, toKm: 150 },
      { fromKm: 150, toKm: 300 },
    ];
    const at = arrivalAt(200, { departAt: ist("06:00"), timeline, days });
    expect(at.toISOString()).toBe(ist("06:50", "2026-10-16").toISOString());
  });
});

describe("checking the rules", () => {
  it("finds a night ban closed when the rider gets there, with starts that clear it", () => {
    const [check] = checkRules([ban], "bike", { departAt: ist("17:00"), timeline });
    expect(check!.verdict.state).toBe("closed");
    if (check!.verdict.state !== "closed") return;
    expect(istTime(check!.verdict.enterAt)).toBe("20:35");
    expect(istTime(check!.verdict.exitAt)).toBe("21:30");
    expect(istTime(check!.verdict.leaveBy)).toBe("16:30"); // out just as it closes
    expect(istTime(check!.verdict.leaveFrom)).toBe("02:25"); // in just as it opens
  });

  it("finds it open in the day, and warns when the margin is small", () => {
    const [day] = checkRules([ban], "bike", { departAt: ist("06:00"), timeline });
    expect(day!.verdict).toMatchObject({ state: "open", minutesSpare: 630 });
    const [late] = checkRules([ban], "bike", { departAt: ist("16:00"), timeline });
    expect(late!.verdict.state).toBe("open");
    if (late!.verdict.state === "open") {
      expect(late!.verdict.minutesSpare).toBe(30);
      expect(late!.verdict.minutesSpare).toBeLessThan(SPARE_WARN_MIN);
    }
  });

  it("finds it closed for a rider out before it opens", () => {
    const [early] = checkRules([ban], "car", { departAt: ist("02:00"), timeline });
    expect(early!.verdict.state).toBe("closed");
  });

  it("lists permits and e-passes, and skips rules for other vehicles or months", () => {
    const checks = checkRules(
      [
        epass,
        { ...ban, slug: "cars-only", vehicles: ["car"] },
        { ...ban, slug: "monsoon-only", months: [6, 7, 8] },
      ],
      "bike",
      { departAt: ist("06:00"), timeline },
    );
    expect(checks.map((c) => [c.rule.slug, c.verdict.state])).toEqual([["hills-epass", "needs"]]);
    expect(checks[0]!.verdict).toMatchObject({ what: "epass" });
  });

  it("uses India's time and month whatever the browser's time zone", () => {
    // 11:30 UTC is 17:00 in India: the same answer as above.
    const [check] = checkRules([ban], "bike", {
      departAt: new Date("2026-10-15T11:30:00Z"),
      timeline,
    });
    expect(check!.verdict.state).toBe("closed");
    expect(indiaMonth(new Date("2026-09-30T19:00:00Z"))).toBe(10); // already 1 October in India
  });

  it("writes the hours the way riders read them", () => {
    expect(closedHours("21:00", "06:00")).toBe("9 pm–6 am");
    expect(closedHours("18:30", "06:00")).toBe("6:30 pm–6 am");
    expect(closedHours("00:00", "12:00")).toBe("12 am–12 pm");
  });
});
