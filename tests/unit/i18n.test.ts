import { describe, expect, it } from "vitest";
import { DRAFT_LANGS, LANGS, parseLang, translate } from "@/lib/i18n";
import { en } from "@/lib/messages/en";
import { hi } from "@/lib/messages/hi";
import { kn } from "@/lib/messages/kn";
import { ml } from "@/lib/messages/ml";
import { mr } from "@/lib/messages/mr";
import { ta } from "@/lib/messages/ta";

describe("languages (G12)", () => {
  it("reads the cookie, English for anything else", () => {
    expect(parseLang("kn")).toBe("kn");
    expect(parseLang("fr")).toBe("en");
    expect(parseLang(undefined)).toBe("en");
  });

  it("fills in values and falls back to English", () => {
    expect(translate("en", "trip.stop", { n: 2 })).toBe("Stop 2");
    expect(translate("hi", "trip.stop", { n: 2 })).toBe("पड़ाव 2");
    expect(translate("kn", "trip.addStopMax", { n: 5 })).toContain("5");
  });

  it("drafts every key, keeping each {value} the English text has", () => {
    for (const [name, m] of Object.entries({ hi, kn, ta, ml, mr })) {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const text = m[key];
        expect(text, `${name} ${key}`).toBeTruthy();
        for (const v of en[key].match(/\{\w+\}/g) ?? [])
          expect(text, `${name} ${key}`).toContain(v);
      }
    }
    expect([...DRAFT_LANGS].sort()).toEqual(LANGS.filter((l) => l !== "en").sort());
  });
});
