import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LngLat } from "@/lib/geo";
import { sketchRoute } from "@/lib/routeSketch";
import { SITE_NAME } from "@/lib/site";

// Share cards: the images a link shows when pasted into WhatsApp, X, Slack and the like. Rendered
// by next/og (Satori), which supports a subset of CSS: every element with several children needs
// display: flex, and only inline styles work.

export const CARD_SIZE = { width: 1200, height: 630 };

// next/og's built-in font has no bold, so Noto Sans (OFL) regular and bold are bundled. Latin only:
// glyphs they lack ("→") fall back to the other font in the list.
let fonts:
  Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | undefined;

/** The fonts option for ImageResponse, read once per server instance. */
export function cardFonts() {
  fonts ??= Promise.all(
    ([400, 700] as const).map(async (weight) => ({
      name: "Noto Sans",
      data: await readFile(
        join(process.cwd(), `src/server/og/fonts/noto-sans-latin-${weight}.woff`),
      ),
      weight,
      style: "normal" as const,
    })),
  );
  return fonts;
}

/** ImageResponse options: card size, bundled fonts and optional extra headers. */
export async function cardOptions(headers?: Record<string, string>) {
  return { ...CARD_SIZE, fonts: await cardFonts(), ...(headers && { headers }) };
}

const BRAND = "#0f766e";
const INK = "#1c1917";
const MUTED = "#57534e";
const PAPER = "#fafaf9";

function Footer() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{ display: "flex", width: 44, height: 44, borderRadius: 22, background: BRAND }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: BRAND }}>{SITE_NAME}</span>
        <span style={{ fontSize: 22, color: MUTED }}>
          Every place worth stopping for, on your exact road
        </span>
      </div>
    </div>
  );
}

interface TripCardProps {
  headline: string; // "Bengaluru → Kalasa via Sakleshpur"
  title?: string | null; // a saved trip's name, when it differs from the headline
  facts: string[]; // "312.3 km", "6 h 40 min", "Bike"
  line: LngLat[];
  stops: LngLat[];
  dashed?: boolean; // straight lines between stops when there is no route yet
}

export function TripCard({ headline, title, facts, line, stops, dashed }: TripCardProps) {
  const mapW = 470;
  const mapH = 470;
  const sketch = sketchRoute(line.length > 1 ? line : stops, stops, mapW, mapH, 40);
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: PAPER,
        padding: 56,
        gap: 48,
        fontFamily: "Noto Sans",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24 }}>
        {title && (
          <div style={{ display: "flex", fontSize: 30, color: BRAND, fontWeight: 700 }}>
            {title}
          </div>
        )}
        <div
          style={{
            display: "flex",
            fontSize: headline.length > 40 ? 52 : 64,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {facts.map((f) => (
            <div
              key={f}
              style={{
                display: "flex",
                fontSize: 30,
                padding: "8px 20px",
                borderRadius: 999,
                background: "#e7e5e4",
                color: INK,
              }}
            >
              {f}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <Footer />
      </div>
      <div
        style={{
          display: "flex",
          width: mapW,
          height: mapH,
          borderRadius: 32,
          background: "#e6f2f0",
          alignSelf: "center",
        }}
      >
        <svg width={mapW} height={mapH} viewBox={`0 0 ${mapW} ${mapH}`}>
          {sketch.path && (
            <path
              d={sketch.path}
              fill="none"
              stroke={BRAND}
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "4 22" : undefined}
            />
          )}
          {sketch.stops.map((p, i) => {
            const end = i === 0 || i === sketch.stops.length - 1;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={end ? 18 : 12}
                fill={i === 0 ? "#ffffff" : end ? BRAND : "#ffffff"}
                stroke={BRAND}
                strokeWidth={end ? 8 : 6}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface PlaceCardProps {
  name: string;
  category: string;
  color: string;
  area: string | null;
  photoUrl: string | null;
  line: string | null; // "Best Oct–Feb · Bike or car"
}

export function PlaceCard({ name, category, color, area, photoUrl, line }: PlaceCardProps) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: PAPER,
        fontFamily: "Noto Sans",
      }}
    >
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only
        <img
          src={photoUrl}
          alt=""
          width={520}
          height={630}
          style={{ width: 520, height: 630, objectFit: "cover" }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 56, gap: 22 }}>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontSize: 28,
            fontWeight: 700,
            color: "#ffffff",
            background: color,
            padding: "6px 18px",
            borderRadius: 999,
          }}
        >
          {category}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: name.length > 28 ? 56 : 70,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.1,
          }}
        >
          {name}
        </div>
        {area && <div style={{ display: "flex", fontSize: 32, color: MUTED }}>{area}</div>}
        {line && <div style={{ display: "flex", fontSize: 30, color: INK }}>{line}</div>}
        <div style={{ display: "flex", flex: 1 }} />
        <Footer />
      </div>
    </div>
  );
}
