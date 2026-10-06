import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compressImage, makeThumbnail, sniff } from "../src/lib/compress.js";
import { orientationExifSegment, stripJpegMetadata } from "../src/lib/jpegMetadata.js";

// Noisy pixels so encoders behave realistically (solid colours compress to nothing).
async function noisy(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

const exifWithPersonalData = { IFD0: { Make: "SecretCam", Model: "Model-X", Artist: "Jane Private" } };

describe("compressImage", () => {
  it("re-encodes to 4:4:4 JPEG at full resolution, keeping orientation + ICC and stripping other EXIF", async () => {
    const input = await (await noisy(300, 200))
      .withIccProfile("p3")
      .withExif(exifWithPersonalData)
      .png()
      .toBuffer();
    // PNG inputs carry EXIF too (eXIf chunk); result must be JPEG.
    const result = await compressImage(input);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.chromaSubsampling).toBe("4:4:4");
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
    expect(meta.icc).toBeDefined();
    expect(result.buffer.includes("SecretCam")).toBe(false);
    expect(result.buffer.includes("Jane Private")).toBe(false);
    expect(result.keptOriginal).toBe(false);
  });

  it("applies EXIF orientation to the pixels so the output displays upright", async () => {
    const input = await (await noisy(300, 200))
      .withExif(exifWithPersonalData)
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const result = await compressImage(input);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.orientation ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([200, 300]);
    expect([result.width, result.height]).toEqual([200, 300]);
    expect(result.buffer.includes("SecretCam")).toBe(false);
  });

  it("keeps the original JPEG when it's smaller, but still strips metadata losslessly", async () => {
    const input = await (await noisy(400, 300))
      .withExif(exifWithPersonalData)
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 40, chromaSubsampling: "4:2:0" })
      .toBuffer();
    const result = await compressImage(input);
    expect(result.keptOriginal).toBe(true);
    expect(result.buffer.length).toBeLessThan(input.length);
    expect(result.buffer.includes("SecretCam")).toBe(false);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.orientation).toBe(6); // tag kept since pixels aren't rotated
    expect([result.width, result.height]).toEqual([300, 400]);
    expect(meta.chromaSubsampling).toBe("4:2:0"); // untouched pixels
    // Pixel data is byte-identical after the SOS marker.
    const sos = (b: Buffer) => b.subarray(b.indexOf(Buffer.from([0xff, 0xda])));
    expect(sos(result.buffer).equals(sos(input))).toBe(true);
  });

  it("flattens transparent PNG/WEBP onto white", async () => {
    const input = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .webp({ lossless: true })
      .toBuffer();
    const result = await compressImage(input);
    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(250);
  });

  it("decodes HEIC", async () => {
    const result = await compressImage(readFileSync(new URL("./fixtures/sample.heic", import.meta.url)));
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([96, 64]);
  });

  it("rejects non-images", async () => {
    await expect(compressImage(Buffer.from("%PDF-1.7 not an image at all"))).rejects.toThrow();
  });

  it("makes a small upright webp thumbnail", async () => {
    const input = await (await noisy(1200, 800)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const thumb = await sharp(await makeThumbnail(input)).metadata();
    expect(thumb.format).toBe("webp");
    expect([thumb.width, thumb.height]).toEqual([267, 400]);
  });
});

describe("stripJpegMetadata", () => {
  it("drops APP1/COM and inserts a minimal orientation EXIF", async () => {
    const input = await (await noisy(64, 64)).withExif(exifWithPersonalData).jpeg().toBuffer();
    expect(input.includes("SecretCam")).toBe(true);
    const out = stripJpegMetadata(input, 3);
    expect(out.includes("SecretCam")).toBe(false);
    expect((await sharp(out).metadata()).orientation).toBe(3);
  });

  it("builds a 34-byte APP1 orientation segment", () => {
    const seg = orientationExifSegment(8);
    expect(seg.length).toBe(36);
    expect(seg.readUInt16BE(2)).toBe(34);
  });

  it("sniffs formats", () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpeg");
    expect(sniff(Buffer.from("GIF89a......"))).toBeNull();
  });
});
