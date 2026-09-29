/** The app's name, used in titles, share cards and the manifest. */
export const SITE_NAME = "Bike Travelling Guide";

/**
 * The public address of the site, for absolute links in share cards, the sitemap and robots.txt.
 * NEXT_PUBLIC_SITE_URL wins (set it for a custom domain); on Vercel the production domain is
 * provided automatically.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** "Bengaluru → Kalasa", or "Bengaluru → Kalasa via Sakleshpur" with one via stop. */
export function tripHeadline(labels: string[]): string {
  const short = labels.map((l) => l.split(",")[0]!.trim());
  if (short.length < 2) return short[0] ?? "";
  const from = short[0]!;
  const to = short[short.length - 1]!;
  const vias = short.slice(1, -1);
  if (vias.length === 0) return `${from} → ${to}`;
  if (vias.length === 1) return `${from} → ${to} via ${vias[0]}`;
  return `${from} → ${to} via ${vias.length} stops`;
}

/** WhatsApp's share link: opens the app (or WhatsApp Web) with the text and link ready to send. */
export function whatsAppUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
