// Shared by the browser wizard and the API so both sides enforce identical rules.

export const MB = 1024 * 1024;
export const BASE_MAX_BYTES = 20 * MB;
export const TILE_MAX_BYTES = 15 * MB;
export const TILE_MIN_COUNT = 20;
export const TILE_MAX_COUNT = 40;

export type ImageFormat = "jpeg" | "png" | "webp" | "heic";

export const EXTENSIONS: Record<string, ImageFormat> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
};

export const CONTENT_TYPES: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

// Browsers report HEIC inconsistently (often an empty string), so accept these too.
const ACCEPTED_MIME = new Set([
  "",
  "application/octet-stream",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

export function maxBytesFor(kind: "BASE" | "TILE"): number {
  return kind === "BASE" ? BASE_MAX_BYTES : TILE_MAX_BYTES;
}

export function formatFromName(name: string): ImageFormat | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[ext] ?? null;
}

export type FileCheck = { ok: true; format: ImageFormat } | { ok: false; error: string };

/** Cheap metadata checks: extension, declared MIME type and size. */
export function checkFileMeta(kind: "BASE" | "TILE", name: string, size: number, mime: string): FileCheck {
  const format = formatFromName(name);
  if (!format) return { ok: false, error: "Only JPG, PNG, HEIC or WEBP images are accepted." };
  if (!ACCEPTED_MIME.has(mime.toLowerCase())) return { ok: false, error: "This file type isn't supported." };
  if (size <= 0) return { ok: false, error: "This file is empty." };
  const max = maxBytesFor(kind);
  if (size > max) return { ok: false, error: `File is larger than ${max / MB} MB.` };
  return { ok: true, format };
}

// Must match the brands the HEIC decoder in the compression function accepts.
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

/** Identify an image by its magic bytes. Needs at least the first 16 bytes. */
export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "heic";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
