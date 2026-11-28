import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// Accessibility guard (G9, B5): axe-core's WCAG 2.1 A and AA rules on every key screen, next to
// the layout guard. Only serious and critical findings fail a test; the map's canvas is left
// out (MapLibre and Google draw it, with their own controls).

/** "rule-id: selector" for each serious or critical finding on the page as it is now. */
export async function axeFaults(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".maplibregl-canvas")
    .exclude(".gm-style")
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
}
