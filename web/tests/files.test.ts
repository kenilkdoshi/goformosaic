import { describe, expect, it } from "vitest";
import { BASE_MAX_BYTES, TILE_MAX_BYTES, checkFileMeta, sniffImage } from "@/lib/files";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffImage", () => {
  it("detects JPEG", () => expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0], new Array(12).fill(0)))).toBe("jpeg"));
  it("detects PNG", () =>
    expect(sniffImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], new Array(8).fill(0)))).toBe("png"));
  it("detects WEBP", () => expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp"));
  it("detects HEIC brands", () => {
    expect(sniffImage(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]))).toBe("heic");
    expect(sniffImage(bytes([0, 0, 0, 0x18], "ftypmif1", [0, 0, 0, 0]))).toBe("heic");
  });
  it("rejects other content", () => {
    expect(sniffImage(bytes("%PDF-1.7", new Array(8).fill(0)))).toBeNull();
    expect(sniffImage(bytes([0, 0, 0, 0x18], "ftypmp42", [0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
  });
});

describe("checkFileMeta", () => {
  it("accepts supported formats within limits", () => {
    expect(checkFileMeta("BASE", "photo.JPG", 1000, "image/jpeg")).toEqual({ ok: true, format: "jpeg" });
    expect(checkFileMeta("TILE", "IMG_1.heic", 1000, "")).toEqual({ ok: true, format: "heic" });
  });
  it("enforces per-kind size limits", () => {
    expect(checkFileMeta("BASE", "a.jpg", BASE_MAX_BYTES, "image/jpeg").ok).toBe(true);
    expect(checkFileMeta("BASE", "a.jpg", BASE_MAX_BYTES + 1, "image/jpeg").ok).toBe(false);
    expect(checkFileMeta("TILE", "a.jpg", TILE_MAX_BYTES + 1, "image/jpeg").ok).toBe(false);
  });
  it("rejects unsupported extensions and MIME types", () => {
    expect(checkFileMeta("TILE", "a.gif", 10, "image/gif").ok).toBe(false);
    expect(checkFileMeta("TILE", "a.jpg", 10, "text/html").ok).toBe(false);
    expect(checkFileMeta("TILE", "a.jpg", 0, "image/jpeg").ok).toBe(false);
  });
});
