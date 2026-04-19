/**
 * Shared watermarking helper for photo pipeline handlers.
 *
 * Why this is its own module:
 *  - Every handler that produces a preview rendition needs to emit BOTH a
 *    watermarked image (the free preview shown in the UI) AND a clean
 *    image (the paid unlock-download). Until Week 6 the watermark was
 *    inlined in hdr-merge only — other handlers (correction, enhance) set
 *    `watermarked: true` in the DB but uploaded clean buffers, which was
 *    a bug: users were effectively getting a preview of the unwatermarked
 *    asset for free.
 *  - Centralising it here means every handler enforces the same watermark
 *    (same text, same style) and keeps the two-output contract consistent.
 *
 * What "watermarking" means here
 *  - A diagonal "AILLDOIT PREVIEW" text composited over the image via
 *    Sharp's composite() + an SVG input. SVG so the text stays crisp at
 *    any resolution. Semi-transparent white fill + black stroke so it
 *    shows on both dark and light photos.
 */

import sharp from "sharp";

/** JPEG quality used for both clean and watermarked output. */
const DEFAULT_JPEG_QUALITY = 82;

/**
 * Produce the watermark SVG sized for a given output.
 * Exported so HDR-merge can still composite onto a raw pixel buffer
 * without having to re-encode first.
 */
export function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(28, Math.round(Math.min(width, height) * 0.045));
  const cx = width / 2;
  const cy = height / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <g transform="rotate(-24 ${cx} ${cy})">
        <text
          x="${cx}"
          y="${cy}"
          font-family="Helvetica, Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          letter-spacing="8"
          fill="white"
          fill-opacity="0.28"
          stroke="black"
          stroke-opacity="0.18"
          stroke-width="2"
          text-anchor="middle"
          dominant-baseline="middle"
        >AILLDOIT PREVIEW</text>
      </g>
    </svg>`
  );
}

export interface DualOutput {
  /** Clean JPEG — served only after credits have been debited. */
  clean: Buffer;
  /** Watermarked JPEG — free preview. */
  watermarked: Buffer;
  width: number;
  height: number;
}

/**
 * Given a clean input buffer (output of a provider or CPU handler),
 * produce both the clean and the watermarked JPEGs ready for upload.
 *
 * Encoding happens twice: once for the clean output (just normalise +
 * re-encode at controlled quality), once with the watermark composite.
 * We could save the first encode by returning the source buffer
 * untouched, but we re-encode so the two outputs share dimensions and
 * quality settings (important for perceptual parity between preview
 * and paid version).
 */
export async function renderDualOutput(
  sourceBuffer: Buffer,
  opts?: { jpegQuality?: number }
): Promise<DualOutput> {
  const quality = opts?.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  // First pass: produce the clean buffer + capture dimensions. We
  // honour EXIF rotation here so the watermark aligns correctly — Sharp
  // otherwise respects the orientation flag without baking it in.
  const baseline = sharp(sourceBuffer, { failOn: "none" }).rotate();
  const { data: cleanData, info } = await baseline
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  // Second pass: composite the watermark over a fresh pipeline reading
  // the *clean* buffer we just produced. We don't reuse the Sharp
  // instance above because .toBuffer() finalises it.
  const watermarked = await sharp(cleanData, { failOn: "none" })
    .composite([
      { input: watermarkSvg(info.width, info.height), top: 0, left: 0 },
    ])
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  return {
    clean: Buffer.from(cleanData),
    watermarked,
    width: info.width,
    height: info.height,
  };
}

/**
 * Composite a watermark onto raw RGB pixel data (used by HDR-merge
 * which already has an in-memory raw buffer from the Mertens fusion).
 * Returns a watermarked JPEG. The caller is responsible for separately
 * producing the clean JPEG from the same raw buffer.
 */
export async function watermarkFromRaw(
  raw: Buffer,
  width: number,
  height: number,
  channels: 3 | 4,
  opts?: { jpegQuality?: number }
): Promise<Buffer> {
  const quality = opts?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  return sharp(raw, { raw: { width, height, channels } })
    .composite([{ input: watermarkSvg(width, height), top: 0, left: 0 }])
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Encode a raw RGB buffer as a clean JPEG without watermark. Pair with
 * `watermarkFromRaw` so HDR-merge can emit both outputs from a single
 * fusion pass.
 */
export async function cleanFromRaw(
  raw: Buffer,
  width: number,
  height: number,
  channels: 3 | 4,
  opts?: { jpegQuality?: number }
): Promise<Buffer> {
  const quality = opts?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  return sharp(raw, { raw: { width, height, channels } })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}
