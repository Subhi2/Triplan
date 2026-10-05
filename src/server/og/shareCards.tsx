import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { categoryStyle } from "@/lib/categories";
import type { LngLat } from "@/lib/geo";
import { fitProjection, sketchRoute, svgPath } from "@/lib/routeSketch";
import { SITE_NAME } from "@/lib/site";
import { splitByGhats } from "@/lib/story";
import type { StoryData } from "../services/storyService";

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

/** A ride story poster: tall, for Instagram stories and WhatsApp status. */
export const STORY_SIZE = { width: 1080, height: 1920 };

const GHAT = "#c2410c";
const TINT = "#e3f0ee";

/** ImageResponse options for a story poster. */
export async function storyOptions(headers?: Record<string, string>) {
  return { ...STORY_SIZE, fonts: await cardFonts(), ...(headers && { headers }) };
}

interface StoryCardProps {
  data: StoryData | null;
  site: string; // "triplan-blue.vercel.app"
}

/**
 * The ride story: the trip as a big route drawing with its ghats in orange, four numbers, the
 * elevation profile and the stops worth making, with the app's address and the data credits.
 */
export function StoryCard({ data, site }: StoryCardProps) {
  const W = STORY_SIZE.width;
  const PAD = 72;
  const inner = W - 2 * PAD;
  const mapH = 600;
  const [main, via] = (data?.headline ?? SITE_NAME).split(" via ");
  const project = fitProjection([...(data?.line ?? []), ...(data?.stops ?? [])], inner, mapH, 56);
  const runs = data ? splitByGhats(data.line, data.ghats) : [];
  const profileH = 150;
  let profileArea = "";
  let profileLine = "";
  if (data?.profile) {
    const pts = data.profile.points;
    const total = pts.at(-1)![0] || 1;
    const lo = data.profile.lowest.m;
    const range = Math.max(200, data.profile.highest.m - lo);
    const xy = pts.map(([k, m]) => ({
      x: Math.round((k / total) * inner * 10) / 10,
      y: Math.round((profileH - 8 - ((m - lo) / range) * (profileH - 24)) * 10) / 10,
    }));
    profileLine = svgPath(xy);
    profileArea = `${profileLine} L${inner} ${profileH} L0 ${profileH} Z`;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PAPER,
        padding: PAD,
        fontFamily: "Noto Sans",
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{ display: "flex", width: 40, height: 40, borderRadius: 20, background: BRAND }}
          />
          <span style={{ fontSize: 34, fontWeight: 700, color: BRAND }}>{SITE_NAME}</span>
        </div>
        <span style={{ fontSize: 26, fontWeight: 700, color: MUTED, letterSpacing: 4 }}>
          {data?.vehicle === "car" ? "ROAD TRIP" : "RIDE STORY"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <span
          style={{
            fontSize: (main ?? "").length > 24 ? 72 : 88,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          {main}
        </span>
        {via && <span style={{ fontSize: 44, color: MUTED, marginTop: 8 }}>via {via}</span>}
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 36,
          width: inner,
          height: mapH,
          borderRadius: 48,
          background: TINT,
        }}
      >
        <svg width={inner} height={mapH} viewBox={`0 0 ${inner} ${mapH}`}>
          {runs.length > 0 && (
            <path
              d={svgPath((data?.line ?? []).map(project))}
              fill="none"
              stroke="#ffffff"
              strokeWidth={24}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {runs.map((r, i) => (
            <path
              key={i}
              d={svgPath(r.coords.map(project))}
              fill="none"
              stroke={r.ghat ? GHAT : BRAND}
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {(data?.stops ?? []).map((s, i, all) => {
            const p = project(s);
            const end = i === 0 || i === all.length - 1;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={end ? 20 : 13}
                fill={i === all.length - 1 ? BRAND : "#ffffff"}
                stroke={BRAND}
                strokeWidth={end ? 9 : 7}
              />
            );
          })}
        </svg>
      </div>
      {data && data.ghats.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 14,
            fontSize: 24,
            color: MUTED,
          }}
        >
          <div
            style={{ display: "flex", width: 36, height: 8, borderRadius: 4, background: GHAT }}
          />
          <span>Ghat roads</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 28 }}>
        {(data?.facts ?? []).map((f) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              flexDirection: "column",
              width: (inner - 20) / 2,
              padding: "18px 26px",
              borderRadius: 28,
              background: "#ffffff",
              border: "2px solid #e2ddd2",
            }}
          >
            <span style={{ fontSize: 24, color: MUTED }}>{f.label}</span>
            <span style={{ fontSize: 50, fontWeight: 700, marginTop: 2 }}>{f.value}</span>
          </div>
        ))}
      </div>

      {profileArea && (
        <div style={{ display: "flex", marginTop: 32 }}>
          <svg width={inner} height={profileH} viewBox={`0 0 ${inner} ${profileH}`}>
            <path d={profileArea} fill={BRAND} fillOpacity={0.14} />
            <path
              d={profileLine}
              fill="none"
              stroke={BRAND}
              strokeWidth={5}
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {data && data.topStops.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>
            WORTH STOPPING FOR
          </span>
          {data.topStops.slice(0, 4).map((s) => (
            <div
              key={`${s.km}${s.name}`}
              style={{ display: "flex", alignItems: "center", gap: 20 }}
            >
              <span
                style={{ display: "flex", width: 130, fontSize: 30, fontWeight: 700, color: BRAND }}
              >
                km {s.km}
              </span>
              <div
                style={{
                  display: "flex",
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: categoryStyle(s.category).color,
                }}
              />
              <span style={{ fontSize: 34, fontWeight: 700 }}>
                {s.name.length > 34 ? `${s.name.slice(0, 33)}…` : s.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 32 }}>
        <span style={{ fontSize: 34, fontWeight: 700 }}>Plan yours at {site}</span>
        <span style={{ fontSize: 20, color: MUTED }}>
          Map data © OpenStreetMap contributors · Terrain © USGS, NOAA · Route by OSRM
        </span>
      </div>
    </div>
  );
}
