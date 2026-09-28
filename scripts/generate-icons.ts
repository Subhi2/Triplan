// Renders the PWA PNG icons from public/icons/icon.svg. Run with `pnpm icons` after editing the SVG.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const dir = "public/icons";

async function main() {
  const svg = await readFile(`${dir}/icon.svg`);

  await sharp(svg).resize(192, 192).png().toFile(`${dir}/icon-192.png`);
  await sharp(svg).resize(512, 512).png().toFile(`${dir}/icon-512.png`);
  await sharp(svg).resize(180, 180).png().toFile(`${dir}/apple-touch-icon.png`);

  // Maskable: keep the artwork inside the 80% safe zone on a full-bleed background.
  const inner = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0f766e" } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile(`${dir}/icon-maskable-512.png`);

  console.log("Icons written to", dir);
}

void main();
