import type { Metadata, Viewport } from "next";
import { SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

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
  appleWebApp: { capable: true, title: "Ride Guide", statusBarStyle: "default" },
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
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
