import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

// The script runs in <head> before React: it must be valid on its own and set data-theme from the
// saved choice, else the device's setting.
function run(stored: string | null, systemDark: boolean) {
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  const storage = { getItem: (k: string) => (k === THEME_KEY ? stored : null) };
  const media = () => ({ matches: systemDark });
  new Function("localStorage", "matchMedia", "document", THEME_SCRIPT)(storage, media, doc);
  return doc.documentElement.dataset.theme;
}

describe("THEME_SCRIPT", () => {
  it("uses the saved choice first", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
  });

  it("follows the device when nothing valid is saved", () => {
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
    expect(run("sepia", true)).toBe("dark");
  });

  it("does not break the page when storage is blocked", () => {
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("localStorage", "matchMedia", "document", THEME_SCRIPT)(
        storage,
        () => ({ matches: true }),
        doc,
      ),
    ).not.toThrow();
  });
});
