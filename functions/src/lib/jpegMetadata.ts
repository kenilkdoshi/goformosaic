// Lossless JPEG metadata stripping: used when the original JPEG is already smaller than our
// re-encode, so we keep its pixels but still remove EXIF (GPS, camera serials), XMP, IPTC and
// comments. Keeps JFIF (APP0), ICC profile (APP2 "ICC_PROFILE") and Adobe (APP14, needed for
// colour transforms), and re-inserts a minimal EXIF block carrying only the Orientation tag.

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;

function isApp(marker: number) {
  return marker >= 0xe0 && marker <= 0xef;
}

function startsWith(buf: Buffer, offset: number, ascii: string) {
  return buf.toString("latin1", offset, offset + ascii.length) === ascii;
}

/** APP1 segment containing an EXIF IFD0 with a single Orientation (0x0112) SHORT entry. */
export function orientationExifSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1"); // big-endian
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18); // value, left-justified
  tiff.writeUInt32BE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export function stripJpegMetadata(input: Buffer, orientation = 1): Buffer {
  if (input[0] !== 0xff || input[1] !== SOI) throw new Error("Not a JPEG");
  const out: Buffer[] = [input.subarray(0, 2)];
  let insertedExif = orientation <= 1;
  let offset = 2;

  const maybeInsertExif = () => {
    if (!insertedExif) {
      out.push(orientationExifSegment(orientation));
      insertedExif = true;
    }
  };

  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new Error("Malformed JPEG segment");
    const marker = input[offset + 1];
    if (marker === 0xff) {
      offset++; // fill byte
      continue;
    }
    if (marker === SOS || marker === EOI) {
      maybeInsertExif();
      out.push(input.subarray(offset)); // entropy-coded data onwards is copied verbatim
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > input.length) throw new Error("Truncated JPEG segment");
    const data = offset + 4;

    let keep: boolean;
    if (marker === 0xe0) keep = startsWith(input, data, "JFIF\0") || startsWith(input, data, "JFXX\0");
    else if (marker === 0xe2) keep = startsWith(input, data, "ICC_PROFILE\0");
    else if (marker === 0xee) keep = startsWith(input, data, "Adobe");
    else if (isApp(marker) || marker === 0xfe) keep = false; // other APPn + COM
    else keep = true; // DQT, SOFn, DHT, DRI, …

    if (!keep) {
      offset = end;
      continue;
    }
    // EXIF goes after APP0 (JFIF) if present, otherwise before the first non-APP0 segment.
    if (marker !== 0xe0) maybeInsertExif();
    out.push(input.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(out);
}
