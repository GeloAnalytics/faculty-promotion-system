import { createCanvas, loadImage, PDFDocument, type SKRSContext2D } from '@napi-rs/canvas';
import type { Rng } from './rng';

// Real PDFs via Skia (the hand-rolled writer was rejected by pdf-parse's old
// pdf.js for roughly half of the documents): a born-digital text-layer PDF and
// a "scanned" PDF (one page-sized JPEG), so the app's pdf-parse and OCR paths
// both run exactly as they do for uploads.

const PAGE_W = 595;
const PAGE_H = 842;
const META = { producer: 'PDF Writer', creator: 'Document Scanner' };

function wrapLines(text: string, maxChars: number) {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > maxChars) {
        out.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    out.push(line);
  }
  return out;
}

export function textPdf(text: string): Buffer {
  const lines = wrapLines(text, 88);
  const perPage = 50;
  const pageCount = Math.max(1, Math.ceil(lines.length / perPage));
  const doc = new PDFDocument(META);
  for (let page = 0; page < pageCount; page += 1) {
    const ctx = doc.beginPage(PAGE_W, PAGE_H);
    ctx.fillStyle = '#000000';
    ctx.font = '11px Arial';
    lines.slice(page * perPage, (page + 1) * perPage).forEach((line, index) => ctx.fillText(line, 56, 56 + index * 15));
    doc.endPage();
  }
  return doc.close();
}

/** Renders text as a scan-like page: slight skew, speckle and JPEG compression. */
export function renderScanJpeg(text: string, rng: Rng): Buffer {
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(250,249,246)';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rng.float(-0.01, 0.01));
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = 'rgb(28,28,28)';
  const lines = wrapLines(text, 70);
  let y = 150;
  lines.forEach((line, index) => {
    const heading = index < 4;
    ctx.font = heading ? 'bold 32px Arial' : '28px Arial';
    ctx.textAlign = heading ? 'center' : 'left';
    ctx.fillText(line, heading ? width / 2 : 120, y);
    y += heading ? 46 : 40;
  });
  ctx.restore();
  for (let i = 0; i < 2500; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${rng.float(0.05, 0.3)})`;
    ctx.fillRect(rng.int(0, width), rng.int(0, height), rng.int(1, 2), rng.int(1, 2));
  }
  return canvas.toBuffer('image/jpeg', 70);
}

/** A PDF whose only content is the page image, i.e. no text layer. */
export async function scanPdf(jpeg: Buffer): Promise<Buffer> {
  const image = await loadImage(jpeg);
  const doc = new PDFDocument({ ...META, rasterDPI: 150, encodingQuality: 70 });
  // beginPage is typed as the DOM context; the runtime object is canvas's SKRSContext2D.
  const ctx = doc.beginPage(PAGE_W, PAGE_H) as SKRSContext2D;
  ctx.drawImage(image, 0, 0, PAGE_W, PAGE_H);
  doc.endPage();
  return doc.close();
}
