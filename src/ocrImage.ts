import type { Canvas, Image } from '@napi-rs/canvas';
import UTIF from 'utif2';

// Long-edge cap for page images handed to OCR engines. Phone photos arrive at
// 4000-6000px; past ~3000px OCR accuracy stops improving while Tesseract time
// and memory keep growing.
export const OCR_MAX_IMAGE_DIMENSION = 3000;
const OCR_JPEG_QUALITY = 90;

// Smallest long edge we will shrink to while fitting a byte budget. Below this,
// body text on an A4 scan becomes too small for OCR to read reliably.
const MIN_FIT_DIMENSION = 1200;
const FIT_QUALITY_STEPS = [80, 65, 50];

type CanvasModule = typeof import('@napi-rs/canvas');

let canvasModulePromise: Promise<CanvasModule | null> | null = null;

/**
 * @napi-rs/canvas is a native module. If its platform binary is missing we
 * still want OCR to run on the original bytes, so a load failure degrades to
 * "no conversion" instead of crashing the upload.
 */
function loadCanvasModule(): Promise<CanvasModule | null> {
  canvasModulePromise ??= import('@napi-rs/canvas').catch((error: unknown) => {
    console.warn('[OCR] @napi-rs/canvas is unavailable; images will be sent to OCR unconverted:', error);
    return null;
  });
  return canvasModulePromise;
}

export function isTiffBuffer(buffer: Buffer) {
  return (
    buffer.length > 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  );
}

function isJpegBuffer(buffer: Buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPngBuffer(buffer: Buffer) {
  return buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a;
}

function scaledSize(width: number, height: number, maxDimension: number) {
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Draws onto a white background (transparent PNG screenshots otherwise turn
 * black in JPEG) at a bounded size and encodes as JPEG.
 */
async function encodeJpeg(
  canvasModule: CanvasModule,
  source: Image | Canvas,
  width: number,
  height: number,
  maxDimension: number,
  quality: number,
) {
  const target = scaledSize(width, height, maxDimension);
  const canvas = canvasModule.createCanvas(target.width, target.height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0, target.width, target.height);
  return canvas.encode('jpeg', quality);
}

async function decodeTiffPages(canvasModule: CanvasModule, buffer: Buffer, maxPages: number) {
  const pages: Buffer[] = [];

  for (const ifd of UTIF.decode(buffer)) {
    if (pages.length >= maxPages) {
      break;
    }

    UTIF.decodeImage(buffer, ifd);
    const { width, height } = ifd;
    if (!width || !height) {
      continue;
    }

    const rgba = UTIF.toRGBA8(ifd);
    const canvas = canvasModule.createCanvas(width, height);
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(width, height);
    imageData.data.set(rgba);
    context.putImageData(imageData, 0, 0);
    pages.push(await encodeJpeg(canvasModule, canvas, width, height, OCR_MAX_IMAGE_DIMENSION, OCR_JPEG_QUALITY));
  }

  return pages;
}

/**
 * Decodes an uploaded image (PNG, JPEG, BMP, GIF, WebP, or single/multi-page
 * TIFF) into bounded-size JPEG pages that every OCR engine in this app can
 * read. Returns null when the bytes cannot be decoded here, so callers can
 * still hand the original file to an engine that might understand it.
 */
export async function decodeImagePagesForOcr(buffer: Buffer, maxPages: number): Promise<Buffer[] | null> {
  const canvasModule = await loadCanvasModule();
  if (!canvasModule) {
    return null;
  }

  try {
    if (isTiffBuffer(buffer)) {
      const pages = await decodeTiffPages(canvasModule, buffer, maxPages);
      return pages.length ? pages : null;
    }

    const image = await canvasModule.loadImage(buffer);
    return [await encodeJpeg(canvasModule, image, image.width, image.height, OCR_MAX_IMAGE_DIMENSION, OCR_JPEG_QUALITY)];
  } catch (error) {
    console.warn('[OCR] Could not decode image for OCR; using original bytes:', error);
    return null;
  }
}

/**
 * Re-encodes a page image as progressively smaller JPEGs until it fits the
 * provider's upload cap (e.g. OCR.space free tier: 1 MB). Returns the original
 * buffer untouched when it already fits in a format providers accept.
 */
export async function fitImageUnderBytes(
  buffer: Buffer,
  maxBytes: number,
): Promise<{ buffer: Buffer; converted: boolean }> {
  if (buffer.length <= maxBytes && (isJpegBuffer(buffer) || isPngBuffer(buffer))) {
    return { buffer, converted: false };
  }

  const canvasModule = await loadCanvasModule();
  if (!canvasModule) {
    return { buffer, converted: false };
  }

  let image: Image;
  try {
    image = await canvasModule.loadImage(buffer);
  } catch {
    return { buffer, converted: false };
  }

  let smallest: Buffer | null = null;
  let dimension = Math.min(OCR_MAX_IMAGE_DIMENSION, Math.max(image.width, image.height));

  while (true) {
    for (const quality of FIT_QUALITY_STEPS) {
      const encoded = await encodeJpeg(canvasModule, image, image.width, image.height, dimension, quality);
      if (!smallest || encoded.length < smallest.length) {
        smallest = encoded;
      }
      if (encoded.length <= maxBytes) {
        return { buffer: encoded, converted: true };
      }
    }

    if (dimension <= MIN_FIT_DIMENSION) {
      break;
    }
    dimension = Math.max(MIN_FIT_DIMENSION, Math.round(dimension * 0.75));
  }

  // Still over the cap: send the smallest attempt and let the provider decide.
  // The caller falls back to local OCR if the provider rejects it.
  return { buffer: smallest ?? buffer, converted: Boolean(smallest) };
}
