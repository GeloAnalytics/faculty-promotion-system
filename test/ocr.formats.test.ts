import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCanvas } from '@napi-rs/canvas';
import UTIF from 'utif2';
import {
  extractImageTextWithOcr,
  resetOcrSpaceRateLimitForTests,
  resolveEffectiveOcrProvider,
  terminateOcrWorkers,
  type OcrConfig,
} from '../src/ocr';
import { decodeImagePagesForOcr, fitImageUnderBytes } from '../src/ocrImage';
import { isPdfTextInsufficient } from '../src/utils/document.utils';

after(() => terminateOcrWorkers());

const SAMPLE_LINES = ['CERTIFICATE OF TRAINING', 'Faculty Development Seminar', 'Research Workshop 2025'];

function renderTextCanvas(lines = SAMPLE_LINES, { transparent = false, width = 1400, height = 600 } = {}) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!transparent) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.fillStyle = '#000000';
  context.font = 'bold 64px sans-serif';
  lines.forEach((line, index) => context.fillText(line, 60, 140 + index * 140));
  return canvas;
}

function rgbaOf(canvas: ReturnType<typeof createCanvas>) {
  return new Uint8Array(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
}

/** Minimal 24-bit BMP encoder; canvas libraries can decode BMP but not write it. */
function encodeBmp(canvas: ReturnType<typeof createCanvas>) {
  const { width, height } = canvas;
  const rgba = rgbaOf(canvas);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const buffer = Buffer.alloc(54 + rowSize * height);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      buffer[rowOffset + x * 3] = rgba[source + 2];
      buffer[rowOffset + x * 3 + 1] = rgba[source + 1];
      buffer[rowOffset + x * 3 + 2] = rgba[source];
    }
  }
  return buffer;
}

/**
 * Image-only PDF (no text layer), the shape phone scanner apps produce. Each
 * canvas becomes one A4-proportioned page.
 */
function canvasesToScannedPdf(canvases: Array<ReturnType<typeof createCanvas>>) {
  const pageWidth = 595;
  const pageHeight = 842;
  // Objects 1-2 are the catalog and page tree; each page then takes three
  // consecutive objects: page, image, content stream.
  const pageObjectNumber = (index: number) => 3 + index * 3;
  const objects: Array<Buffer[]> = [
    [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>')],
    [
      Buffer.from(
        `<< /Type /Pages /Kids [${canvases.map((_, index) => `${pageObjectNumber(index)} 0 R`).join(' ')}] /Count ${canvases.length} >>`,
      ),
    ],
  ];
  canvases.forEach((canvas, index) => {
    const pageNumber = pageObjectNumber(index);
    const jpeg = canvas.toBuffer('image/jpeg', 85);
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    objects.push(
      [
        Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${pageNumber + 1} 0 R >> >> /Contents ${pageNumber + 2} 0 R >>`,
        ),
      ],
      [
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        ),
        jpeg,
        Buffer.from('\nendstream'),
      ],
      [Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)],
    );
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    for (const part of [Buffer.from(`${index + 1} 0 obj\n`), ...body, Buffer.from('\nendobj\n')]) {
      chunks.push(part);
      length += part.length;
    }
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

const tesseractOnly: OcrConfig = {
  provider: 'tesseract',
  scriptPath: '',
  apiKeyHeader: 'Authorization',
  fileFieldName: 'file',
  timeoutMs: 5000,
};

function assertReadsSample(text: string) {
  assert.match(text.toUpperCase(), /CERTIFICATE/);
  assert.match(text.toUpperCase(), /SEMINAR/);
}

test('OCR reads PNG, JPEG, BMP and transparent PNG uploads', async () => {
  const canvas = renderTextCanvas();
  const uploads: Array<[string, Buffer]> = [
    ['certificate.png', canvas.toBuffer('image/png')],
    ['certificate.JPG', canvas.toBuffer('image/jpeg', 85)],
    ['certificate.bmp', encodeBmp(canvas)],
    ['transparent.png', renderTextCanvas(SAMPLE_LINES, { transparent: true }).toBuffer('image/png')],
  ];

  for (const [name, buffer] of uploads) {
    const result = await extractImageTextWithOcr(buffer, name, tesseractOnly);
    assertReadsSample(result.text);
  }
});

test('OCR reads every page of a multi-page TIFF', async () => {
  // UTIF.encode only writes the IFD headers; uncompressed RGBA strips are laid
  // out after them by hand, the same way UTIF.encodeImage does for one page.
  const headerBytes = 4000;
  const pagePixels = [
    renderTextCanvas(['CERTIFICATE OF TRAINING']),
    renderTextCanvas(['SPECIAL ORDER MEMORANDUM']),
  ].map((canvas) => ({ width: canvas.width, height: canvas.height, rgba: rgbaOf(canvas) }));
  let stripOffset = headerBytes;
  const ifds = pagePixels.map(({ width, height, rgba }) => {
    const ifd = {
      t256: [width], t257: [height], t258: [8, 8, 8, 8], t259: [1], t262: [2], t273: [stripOffset],
      t277: [4], t278: [height], t279: [rgba.length], t284: [1], t338: [1],
    };
    stripOffset += rgba.length;
    return ifd;
  });
  const multiPage = Buffer.alloc(stripOffset);
  Buffer.from(UTIF.encode(ifds as unknown as UTIF.IFD[])).copy(multiPage, 0);
  let writeOffset = headerBytes;
  for (const { rgba } of pagePixels) {
    multiPage.set(rgba, writeOffset);
    writeOffset += rgba.length;
  }

  const pages = await decodeImagePagesForOcr(multiPage, 5);
  assert.equal(pages?.length, 2);

  const result = await extractImageTextWithOcr(multiPage, 'scan.tiff', tesseractOnly);
  assert.match(result.text.toUpperCase(), /CERTIFICATE/);
  assert.match(result.text.toUpperCase(), /MEMORANDUM/);
});

test('OCR reads an image-only scanned PDF', async () => {
  const pdf = canvasesToScannedPdf([renderTextCanvas(SAMPLE_LINES, { width: 1240, height: 1754 })]);
  const result = await extractImageTextWithOcr(pdf, 'scanned.pdf', tesseractOnly, 'PDF');
  assertReadsSample(result.text);
});

// Word markers rather than digits: Tesseract can misread a lone digit in the
// test font, and these tests are about page coverage, not digit accuracy.
const PAGE_MARKERS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'LIMA'];

/** Pages of a scanned thesis; page 1 is keyword-heavy like a real title page. */
function scannedThesisPdf(pageCount: number) {
  const pages = Array.from({ length: pageCount }, (_, index) =>
    renderTextCanvas(
      index === 0
        ? ['MASTER OF ARTS THESIS', 'Research on Faculty Training', 'Degree Requirement']
        : ['CHAPTER FINDINGS', `Marker ${PAGE_MARKERS[index]}`],
      { width: 1240, height: 1754 },
    ),
  );
  return canvasesToScannedPdf(pages);
}

test('every page of a long scanned thesis is read, not just the title page', async () => {
  const result = await extractImageTextWithOcr(scannedThesisPdf(12), 'thesis.pdf', tesseractOnly, 'PDF');
  for (let page = 2; page <= 12; page++) {
    assert.match(result.text.toUpperCase(), new RegExp(PAGE_MARKERS[page - 1]), `page ${page} missing from OCR text`);
  }
  assert.equal(result.pagesRead, 12);
  assert.equal(result.totalPages, 12);
  assert.equal(result.stoppedEarly, undefined);
});

test('a document longer than the page limit is marked as partially read', async () => {
  const result = await extractImageTextWithOcr(scannedThesisPdf(4), 'thesis.pdf', { ...tesseractOnly, maxPages: 2 }, 'PDF');
  assert.equal(result.pagesRead, 2);
  assert.equal(result.totalPages, 4);
  assert.equal(result.stoppedEarly, 'page-limit');
});

test('large photos are compressed under the cloud OCR upload cap', async () => {
  const canvas = createCanvas(3200, 2400);
  const context = canvas.getContext('2d');
  const noise = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < noise.data.length; i++) {
    noise.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  }
  context.putImageData(noise, 0, 0);
  const original = canvas.toBuffer('image/jpeg', 95);
  assert.ok(original.length > 1024 * 1024, 'fixture should exceed the 1 MB cap');

  const fitted = await fitImageUnderBytes(original, 1024 * 1024);
  assert.equal(fitted.converted, true);
  assert.ok(fitted.buffer.length <= 1024 * 1024, `got ${fitted.buffer.length} bytes`);
});

/** Stands in for api.ocr.space: enforces the upload cap or simulates an outage. */
async function startFakeOcrSpace(mode: { maxBytes: number; fail?: boolean; delayMs?: number; rateLimited?: boolean }) {
  const received: number[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      if (mode.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, mode.delayMs));
      }
      const body = Buffer.concat(chunks);
      received.push(body.length);
      res.setHeader('content-type', 'application/json');
      if (mode.rateLimited) {
        res.statusCode = 429;
        res.end('{"error":"E553: Rate limit exceeded. Max 180 requests per 3600s","retryAfter":900}');
      } else if (mode.fail) {
        res.statusCode = 503;
        res.end('{}');
      } else if (body.length > mode.maxBytes) {
        res.statusCode = 413;
        res.end('{"ErrorMessage":"File too large"}');
      } else {
        res.end(JSON.stringify({ ParsedResults: [{ ParsedText: 'CERTIFICATE OF TRAINING from cloud OCR' }] }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/parse/image`, received, close: () => server.close() };
}

test('oversized uploads are compressed so OCR.space accepts them instead of returning 413', async () => {
  const fake = await startFakeOcrSpace({ maxBytes: 300 * 1024 });
  try {
    const canvas = renderTextCanvas(SAMPLE_LINES, { width: 3000, height: 2200 });
    const original = canvas.toBuffer('image/png');
    const config: OcrConfig = {
      ...tesseractOnly,
      provider: 'ocrspace',
      apiUrl: fake.url,
      apiKey: 'test-key',
      maxUploadBytes: 250 * 1024,
    };

    const result = await extractImageTextWithOcr(original, 'photo.png', config);
    assert.equal(result.provider, 'ocrspace');
    assert.match(result.text, /cloud OCR/);
    assert.ok(fake.received.every((size) => size <= 300 * 1024));
  } finally {
    fake.close();
  }
});

test('an OCR.space outage falls back to local OCR instead of saving empty text', async () => {
  const fake = await startFakeOcrSpace({ maxBytes: Infinity, fail: true });
  try {
    const config: OcrConfig = { ...tesseractOnly, provider: 'ocrspace', apiUrl: fake.url, apiKey: 'test-key' };
    const result = await extractImageTextWithOcr(renderTextCanvas().toBuffer('image/png'), 'certificate.png', config);
    assert.equal(result.provider, 'tesseract');
    assertReadsSample(result.text);
  } finally {
    fake.close();
  }
});

test('small multi-page PDFs go to OCR.space page by page, past its 3-page free limit', async () => {
  const fake = await startFakeOcrSpace({ maxBytes: Infinity });
  try {
    const pdf = scannedThesisPdf(5);
    assert.ok(pdf.length < 1024 * 1024, 'fixture should qualify for a single whole-file request');
    const config: OcrConfig = { ...tesseractOnly, provider: 'ocrspace', apiUrl: fake.url, apiKey: 'test-key' };
    const result = await extractImageTextWithOcr(pdf, 'thesis.pdf', config, 'PDF');
    assert.equal(fake.received.length, 5);
    assert.equal(result.pagesRead, 5);
  } finally {
    fake.close();
  }
});

test('a scan too long for one request is resumed from nextPage until every page is read once', async () => {
  const fake = await startFakeOcrSpace({ maxBytes: Infinity, delayMs: 300 });
  try {
    const pdf = scannedThesisPdf(6);
    const config: OcrConfig = {
      ...tesseractOnly,
      provider: 'ocrspace',
      apiUrl: fake.url,
      apiKey: 'test-key',
      totalBudgetMs: 700,
    };

    const first = await extractImageTextWithOcr(pdf, 'thesis.pdf', config, 'PDF');
    assert.equal(first.stoppedEarly, 'time-budget');
    assert.equal(first.nextPage, (first.pagesRead ?? 0) + 1);
    assert.ok((first.pagesRead ?? 0) >= 1 && (first.pagesRead ?? 0) < 6);

    let progress = first;
    let passes = 1;
    while (progress.nextPage) {
      const startPage = progress.nextPage;
      progress = await extractImageTextWithOcr(pdf, 'thesis.pdf', config, 'PDF', { startPage });
      assert.ok((progress.pagesRead ?? 0) >= startPage, 'each pass must read at least one page');
      passes += 1;
      assert.ok(passes <= 6, 'resuming must terminate');
    }
    assert.equal(progress.pagesRead, 6);
    assert.equal(progress.totalPages, 6);
    assert.equal(progress.stoppedEarly, undefined);
    assert.equal(fake.received.length, 6, 'every page is sent to OCR exactly once across passes');
  } finally {
    fake.close();
  }
});

test('after OCR.space reports its hourly limit, later pages and uploads go straight to local OCR', async () => {
  const fake = await startFakeOcrSpace({ maxBytes: Infinity, rateLimited: true });
  try {
    const config: OcrConfig = { ...tesseractOnly, provider: 'ocrspace', apiUrl: fake.url, apiKey: 'test-key' };
    const first = await extractImageTextWithOcr(scannedThesisPdf(3), 'thesis.pdf', config, 'PDF');
    assert.equal(first.pagesRead, 3);
    assert.match(first.text.toUpperCase(), /CHARLIE/);
    const second = await extractImageTextWithOcr(renderTextCanvas().toBuffer('image/png'), 'certificate.png', config);
    assertReadsSample(second.text);
    assert.equal(fake.received.length, 1, 'only the request that hit the limit reaches OCR.space');
  } finally {
    resetOcrSpaceRateLimitForTests();
    fake.close();
  }
});

test('an OCR.space key is not mistaken for a Google Vision key on cloud deployments', () => {
  const config: OcrConfig = {
    ...tesseractOnly,
    provider: 'windows',
    scriptPath: '/missing/ocr-image.ps1',
    apiUrl: 'https://api.ocr.space/parse/image',
    apiKey: 'K00000000000000',
  };
  assert.equal(resolveEffectiveOcrProvider(config), 'ocrspace');
  assert.equal(resolveEffectiveOcrProvider({ ...config, googleVisionApiKey: 'google-key' }), 'google-vision');
});

test('multi-page PDFs whose only text is page footers still get OCR', () => {
  const footersOnly = Array.from({ length: 10 }, (_, index) => `Page ${index + 1} of 10 - LSPU`).join('\n');
  assert.equal(isPdfTextInsufficient(footersOnly, 1), false);
  assert.equal(isPdfTextInsufficient(footersOnly, 10), true);
  assert.equal(isPdfTextInsufficient('Lorem ipsum dolor sit amet '.repeat(200), 10), false);
});
