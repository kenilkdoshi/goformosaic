import "server-only";
import path from "node:path";
import sharp from "sharp";

// The watermark is a pre-rendered transparent PNG (scripts/generate-watermark.mjs) so the
// server doesn't depend on system fonts being installed on App Service.
const WATERMARK_PATH = path.join(process.cwd(), "assets", "watermark-tile.png");

export const PREVIEW_MAX_PX = 1600;

export async function createWatermarkedPreview(input: Buffer): Promise<Buffer> {
  const resized = await sharp(input, { failOn: "error", limitInputPixels: 400_000_000 })
    .rotate()
    .resize(PREVIEW_MAX_PX, PREVIEW_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toBuffer();
  return sharp(resized)
    .composite([{ input: WATERMARK_PATH, tile: true, blend: "over" }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
