import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";
import { stripJpegMetadata } from "./jpegMetadata.js";

export type ImageFormat = "jpeg" | "png" | "webp" | "heic";

export type CompressResult = {
  buffer: Buffer;
  /** Display dimensions (upright). */
  width: number;
  height: number;
  keptOriginal: boolean;
};

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

export function sniff(buf: Buffer): ImageFormat | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.toString("latin1", 4, 8) === "ftyp" && HEIF_BRANDS.has(buf.toString("latin1", 8, 12))) return "heic";
  return null;
}

const MAX_PIXELS = 300_000_000;

/**
 * MozJPEG q90, 4:4:4 chroma, full resolution. Keeps the ICC profile and the image's orientation;
 * all other metadata is dropped. Re-encoded output is rotated upright (EXIF orientation applied
 * to the pixels) so it displays correctly everywhere without needing an EXIF block.
 * If the input is a JPEG that's already smaller than the re-encode, the original pixels are
 * kept, with metadata stripped losslessly except a minimal Orientation tag.
 */
export async function compressImage(input: Buffer): Promise<CompressResult> {
  const format = sniff(input);
  if (!format) throw new Error("Unsupported or corrupt image");

  let image: Sharp;
  let orientation = 1;
  let keepIcc = false;

  if (format === "heic") {
    // sharp's prebuilt libvips has no HEVC decoder; libheif (WASM) applies HEIF rotation itself.
    const { width, height, data } = await decodeHeic({ buffer: input });
    image = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: MAX_PIXELS,
    });
  } else {
    image = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS });
    const meta = await image.metadata();
    orientation = meta.orientation ?? 1;
    if (meta.space === "cmyk") image = image.toColourspace("srgb");
    else keepIcc = Boolean(meta.icc);
  }

  image = image.rotate().flatten({ background: "#ffffff" });
  if (keepIcc) image = image.keepIccProfile();

  const { data, info } = await image
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  if (format === "jpeg") {
    const original = stripJpegMetadata(input, orientation);
    if (original.length <= data.length) return { buffer: original, width, height, keptOriginal: true };
  }
  return { buffer: data, width, height, keptOriginal: false };
}

/** Small upright WEBP for the admin gallery. */
export async function makeThumbnail(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).rotate().resize(400, 400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
}
