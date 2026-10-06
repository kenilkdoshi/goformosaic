// Renders assets/watermark-tile.png. Run locally (needs system fonts): node scripts/generate-watermark.mjs
import sharp from "sharp";

const W = 680;
const H = 420;
const text = "GoForMosaic.com · PREVIEW";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <g transform="rotate(-28 ${W / 2} ${H / 2})" font-family="Helvetica, Arial, DejaVu Sans, sans-serif"
     font-size="30" font-weight="700" text-anchor="middle">
    <text x="${W / 2}" y="${H / 2}" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="3">${text}</text>
    <text x="${W / 2}" y="${H / 2}" fill="#fff" fill-opacity="0.5">${text}</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL("../assets/watermark-tile.png", import.meta.url).pathname);
console.log("wrote assets/watermark-tile.png");
