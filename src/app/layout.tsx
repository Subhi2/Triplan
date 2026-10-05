import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

// "Ghat Road" type (docs/08-design.md): Atkinson Hyperlegible reads well on a phone in sunlight,
// Bricolage Grotesque for headings, IBM Plex Mono for km and times.
const body = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});
const heading = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});
const numbers = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-numbers",
  display: "swap",
});

const description =
  "Plan a ride and see every temple, fort, viewpoint, waterfall and food stop along your exact route.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_NAME,
  description,
  applicationName: SITE_NAME,
  // Pages that set their own openGraph replace this whole object (Next merges metadata shallowly).
  openGraph: {
    siteName: SITE_NAME,
    title: SITE_NAME,
    description,
    type: "website",
    locale: "en_IN",
    images: [{ url: "/og/plan", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  // Full screen under notches and the home bar; the layout pads with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${numbers.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        {/* Page views without cookies; reported only on Vercel (docs/02, "Usage numbers"). */}
        <Analytics />
      </body>
    </html>
  );
}
