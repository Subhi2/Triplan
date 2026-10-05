/**
 * Screenshots for the README, at phone and desktop sizes, into docs/media/.
 *
 *   pnpm screenshots                                   # against http://localhost:3000 (pnpm dev)
 *   pnpm screenshots -- --base=https://triplan-blue.vercel.app
 *   pnpm screenshots -- --only=planner
 *
 * The trips below are the documentation's example trips; the app itself never assumes them.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

interface Shot {
  name: string;
  path: string;
  /** Text that shows once the page has what is worth capturing. */
  waitFor?: string;
}

const KALASA_VIA_SAKLESHPUR =
  "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234&v=bike&c=5";

const SHOTS: Shot[] = [
  { name: "planner", path: KALASA_VIA_SAKLESHPUR, waitFor: "Along the road" },
  { name: "place", path: "/place/manjarabad-fort", waitFor: "What to carry" },
  { name: "rides", path: "/rides", waitFor: "Pollachi" },
  { name: "ride", path: "/rides/pollachi-to-valparai", waitFor: "Plan this ride" },
  { name: "nearby", path: "/nearby" },
  { name: "trips", path: "/trips" },
];

const SIZES = [
  { suffix: "phone", viewport: { width: 390, height: 844 }, scale: 2 },
  { suffix: "desktop", viewport: { width: 1440, height: 900 }, scale: 1 },
] as const;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function settle(page: Page, waitFor: string | undefined) {
  if (waitFor) {
    await page
      .getByText(waitFor, { exact: false })
      .first()
      .waitFor({ timeout: 45_000 })
      .catch(() => console.warn(`  "${waitFor}" did not show; capturing anyway`));
  }
  // Map tiles and photos keep loading after the text is there.
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(2_500);
}

async function main() {
  const base = (arg("base") ?? "http://localhost:3000").replace(/\/+$/, "");
  const only = arg("only")?.split(",");
  const outDir = path.join("docs", "media");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const size of SIZES) {
      const context = await browser.newContext({
        viewport: size.viewport,
        deviceScaleFactor: size.scale,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
        const file = path.join(outDir, `${shot.name}-${size.suffix}.png`);
        console.log(`${base}${shot.path} → ${file}`);
        await page.goto(`${base}${shot.path}`, { waitUntil: "domcontentloaded" });
        await settle(page, shot.waitFor);
        // Next's dev-mode badge would cover a button on phones.
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await page.screenshot({ path: file });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
