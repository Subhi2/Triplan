// Video frames of the 3D ride preview (docs/02-architecture.md, "Saving the preview as a video"):
// the map's WebGL canvas drawn into a portrait 2D canvas, with the heads-up display, the place
// being passed, a progress bar and the credits painted over it. Nothing cross-origin but the map
// is drawn, so the canvas can be encoded (no photos in the video).

/** Length of every saved video, whatever the route: short enough for a story. */
export const VIDEO_SECONDS = 30;
export const VIDEO_FPS = 30;
/** About 15 MB for 30 s: small enough to share. */
export const VIDEO_BITRATE = 4_000_000;

/** Portrait frame size: full HD, or 720p on low-end phones. */
export function videoSize(lowEnd: boolean): { width: number; height: number } {
  return lowEnd ? { width: 720, height: 1280 } : { width: 1080, height: 1920 };
}

export interface FrameText {
  title: string;
  km: number;
  totalKm: number;
  height: string | null; // "1,071 m"
  chips: string[]; // "Ghat", "Climbing 5.3%"
  place: { name: string; line: string; color: string } | null;
  share: number; // 0–1 along the route
  profile: [number, number][] | null; // [share 0–1, height 0–1]
  credits: string;
  brand: string; // "Planned on Triplan · triplan-blue.vercel.app"
}

export interface Fonts {
  display: string;
  body: string;
  mono: string;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Text cut to fit `maxWidth`, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Paints one video frame: the map, cropped to fill the portrait frame, then the overlays. Sizes
 * scale with the frame width so 720p and 1080p look the same.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  map: CanvasImageSource & { width: number; height: number },
  text: FrameText,
  fonts: Fonts,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const u = W / 1080; // one unit at 1080 px wide

  // The map, scaled to cover the frame and centred.
  const scale = Math.max(W / map.width, H / map.height);
  const dw = map.width * scale;
  const dh = map.height * scale;
  ctx.fillStyle = "#1b1a17";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(map, (W - dw) / 2, (H - dh) / 2, dw, dh);

  const pad = 48 * u;
  ctx.textBaseline = "alphabetic";

  // The trip, km and height, top left.
  ctx.font = `700 ${46 * u}px ${fonts.display}`;
  const title = fit(ctx, text.title, W - 2 * pad - 60 * u);
  ctx.font = `600 ${36 * u}px ${fonts.mono}`;
  const kmLine = `km ${text.km.toFixed(1)} of ${Math.round(text.totalKm)}${text.height ? ` · ${text.height}` : ""}`;
  ctx.font = `700 ${46 * u}px ${fonts.display}`;
  const boxW = Math.min(W - 2 * pad, Math.max(ctx.measureText(title).width, 520 * u) + 56 * u);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, pad, pad, boxW, 150 * u, 36 * u);
  ctx.fill();
  ctx.fillStyle = "#1b1a17";
  ctx.fillText(title, pad + 28 * u, pad + 64 * u);
  ctx.font = `600 ${36 * u}px ${fonts.mono}`;
  ctx.fillStyle = "#45423b";
  ctx.fillText(kmLine, pad + 28 * u, pad + 118 * u);

  // Chips under it: ghat in the ghat colour, the climb in white.
  let cx = pad;
  const cy = pad + 172 * u;
  ctx.font = `700 ${30 * u}px ${fonts.body}`;
  for (const chip of text.chips) {
    const w = ctx.measureText(chip).width + 44 * u;
    const ghat = chip === "Ghat";
    ctx.fillStyle = ghat ? "#c2410c" : "rgba(255,255,255,0.92)";
    roundRect(ctx, cx, cy, w, 56 * u, 28 * u);
    ctx.fill();
    ctx.fillStyle = ghat ? "#ffffff" : "#1b1a17";
    ctx.fillText(chip, cx + 22 * u, cy + 38 * u);
    cx += w + 14 * u;
  }

  // The place being passed, above the progress bar.
  const barTop = H - 250 * u;
  if (text.place) {
    const top = barTop - 170 * u;
    ctx.font = `700 ${40 * u}px ${fonts.body}`;
    const name = fit(ctx, text.place.name, W - 2 * pad - 60 * u);
    ctx.font = `400 ${30 * u}px ${fonts.body}`;
    const line = fit(ctx, text.place.line, W - 2 * pad - 96 * u);
    ctx.font = `700 ${40 * u}px ${fonts.body}`;
    const w = Math.min(W - 2 * pad, Math.max(ctx.measureText(name).width, 420 * u) + 64 * u);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, pad, top, w, 140 * u, 32 * u);
    ctx.fill();
    ctx.fillStyle = "#1b1a17";
    ctx.fillText(name, pad + 32 * u, top + 58 * u);
    ctx.fillStyle = text.place.color;
    ctx.beginPath();
    ctx.arc(pad + 42 * u, top + 98 * u, 10 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `400 ${30 * u}px ${fonts.body}`;
    ctx.fillStyle = "#5b574f";
    ctx.fillText(line, pad + 64 * u, top + 108 * u);
  }

  // Progress: the profile (or a bar) filling in teal.
  const barX = pad;
  const barW = W - 2 * pad;
  const barH = 110 * u;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, barX - 16 * u, barTop - 16 * u, barW + 32 * u, barH + 32 * u, 32 * u);
  ctx.fill();
  const shape = (filled: boolean) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(barX, barTop, filled ? barW * text.share : barW, barH);
    ctx.clip();
    ctx.beginPath();
    if (text.profile && text.profile.length > 1) {
      ctx.moveTo(barX, barTop + barH);
      for (const [s, h] of text.profile)
        ctx.lineTo(barX + s * barW, barTop + barH - h * barH * 0.9);
      ctx.lineTo(barX + barW, barTop + barH);
      ctx.closePath();
    } else {
      ctx.roundRect(barX, barTop + barH / 2 - 8 * u, barW, 16 * u, 8 * u);
    }
    ctx.fillStyle = filled ? "#0f766e" : "#cfc8ba";
    ctx.fill();
    ctx.restore();
  };
  shape(false);
  shape(true);

  // Brand and credits along the bottom. The credits are a licence condition, so they are never
  // cut: smaller type first, then two lines.
  const maxW = W - 2 * pad;
  const credits = creditLines(ctx, text.credits, maxW, fonts.body, u);
  const bandH = (credits.lines.length > 1 ? 128 : 100) * u;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H - bandH, W, bandH);
  ctx.font = `700 ${30 * u}px ${fonts.body}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, text.brand, maxW), pad, H - bandH + 44 * u);
  ctx.font = `400 ${credits.size * u}px ${fonts.body}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  credits.lines.forEach((line, i) => {
    ctx.fillText(line, pad, H - bandH + (76 + i * 28) * u);
  });
}

/** The credits at the largest size (21 down to 16) that fits, split in two at " · " if needed. */
export function creditLines(
  ctx: CanvasRenderingContext2D,
  credits: string,
  maxWidth: number,
  font: string,
  u: number,
): { size: number; lines: string[] } {
  for (let size = 21; size >= 16; size--) {
    ctx.font = `400 ${size * u}px ${font}`;
    if (ctx.measureText(credits).width <= maxWidth) return { size, lines: [credits] };
  }
  const parts = credits.split(" · ");
  let best = Math.ceil(parts.length / 2);
  let bestDiff = Infinity;
  for (let i = 1; i < parts.length; i++) {
    const diff = Math.abs(
      ctx.measureText(parts.slice(0, i).join(" · ")).width -
        ctx.measureText(parts.slice(i).join(" · ")).width,
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  const lines =
    parts.length > 1
      ? [parts.slice(0, best).join(" · "), parts.slice(best).join(" · ")]
      : [credits];
  return { size: 16, lines };
}
