#!/usr/bin/env node
// Regenerate PNG icons from public/icon.svg. Run from apps/web/:
//   node scripts/generate-icons.mjs
//
// We keep the SVG as the source of truth and rasterize to the PNG sizes
// browsers + Safari's Add-to-Home-Screen actually consume.

import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icon.svg");

const targets = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  { size: 180, out: "public/apple-touch-icon.png" },
  { size: 32, out: "public/favicon.png" },
];

for (const { size, out } of targets) {
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`  → ${out} (${size}×${size})`);
}
console.log("icons generated");
