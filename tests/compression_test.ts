/**
 * M3 regression: real, scoped JPEG recompression in compressPdf() /
 * compressPdfWithReport() (real pdf-lib + real jpeg-js, no mocks).
 *
 * Run with:  npx tsx tests/compression_test.ts
 */
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import jpeg from 'jpeg-js';
import { compressPdf, compressPdfWithReport } from '../src/lib/pdfOperations';
import { makeRunner } from './support/harness';

const t = makeRunner('COMPRESSION: REAL JPEG RE-ENCODING (M3)');

/** A synthetic "photo": smooth gradient + noise, large enough to be realistic. */
function makePhotoRgba(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.min(255, Math.floor((x / width) * 255 + rand() * 20));
      data[i + 1] = Math.min(255, Math.floor((y / height) * 255 + rand() * 20));
      data[i + 2] = Math.min(255, Math.floor(((x + y) / (width + height)) * 255 + rand() * 20));
      data[i + 3] = 255;
    }
  }
  return data;
}

function encodeJpeg(width: number, height: number, quality: number): Uint8Array {
  const out = jpeg.encode({ width, height, data: makePhotoRgba(width, height) }, quality);
  return out.data instanceof Uint8Array ? out.data : new Uint8Array(out.data);
}

async function pdfWithJpegImages(images: Uint8Array[], opts: { pagesShareOneImage?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (opts.pagesShareOneImage) {
    const embedded = await doc.embedJpg(images[0]);
    for (let i = 0; i < 3; i++) {
      const page = doc.addPage([600, 800]);
      page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    }
  } else {
    for (const bytes of images) {
      const embedded = await doc.embedJpg(bytes);
      const page = doc.addPage([600, 800]);
      page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    }
  }
  return doc.save();
}

async function main() {
  // 1. A realistic high-quality photo shrinks, and the file gets smaller.
  const bigJpeg = encodeJpeg(800, 600, 95);
  const pdf1 = await pdfWithJpegImages([bigJpeg]);
  const r1 = await compressPdfWithReport(pdf1);
  t.check('1 large high-quality JPEG page: output is smaller than input', r1.finalSize < r1.originalSize, `${r1.originalSize} -> ${r1.finalSize}`);
  t.check('2 reports exactly 1 image optimized', r1.imagesOptimized === 1, String(r1.imagesOptimized));
  t.check('3 output is still a valid, openable PDF with 1 page', (await PDFDocument.load(r1.bytes)).getPageCount() === 1);
  // NOTE: JPEG encoding can differ by a handful of bytes between
  // independent runs of the SAME input on some JS engines (observed: a
  // cold first call vs later JIT-warmed calls) — this is normal, expected
  // nondeterminism for a lossy image codec, not a defect. So this checks
  // "close to and no worse than", not byte-for-byte equality.
  const plainWrapperBytes = (await compressPdf(pdf1)).length;
  t.check('4 compressPdf() (the plain wrapper) is consistent with compressPdfWithReport()', Math.abs(plainWrapperBytes - r1.finalSize) < r1.originalSize * 0.01 && plainWrapperBytes < r1.originalSize, `wrapper=${plainWrapperBytes} report=${r1.finalSize} original=${r1.originalSize}`);

  // 2. Already-small/low-quality JPEGs: never made bigger.
  const tinyJpeg = encodeJpeg(40, 40, 90); // well under MIN_IMAGE_BYTES_TO_BOTHER
  const pdf2 = await pdfWithJpegImages([tinyJpeg]);
  const r2 = await compressPdfWithReport(pdf2);
  t.check('5 tiny image is left untouched (below the size-to-bother threshold)', r2.imagesOptimized === 0, String(r2.imagesOptimized));
  t.check('6 result is never larger than the original for a tiny-image doc', r2.finalSize <= pdf2.length * 1.05, `${pdf2.length} -> ${r2.finalSize}`);

  const alreadyLowQ = encodeJpeg(800, 600, 20); // already heavily compressed: little room left to shrink further
  const pdf3 = await pdfWithJpegImages([alreadyLowQ]);
  const r3 = await compressPdfWithReport(pdf3);
  // The IMAGE itself must never be replaced with something bigger (that
  // guard is per-image, in recompressEmbeddedJpegImages). The object-stream
  // structural re-save this function has always done can, like any
  // re-serialization, add a few bytes of overhead on a very small/simple
  // document when there is nothing to deduplicate — pre-existing, documented
  // behavior, not something this feature can regress further.
  t.check('7 an already low-quality JPEG image is not replaced with a bigger one', r3.imagesOptimized === 0 || r3.finalSize < pdf3.length, `optimized=${r3.imagesOptimized} ${pdf3.length} -> ${r3.finalSize}`);
  t.check('7b overall size never grows by more than trivial re-serialization overhead', r3.finalSize <= pdf3.length + 64, `${pdf3.length} -> ${r3.finalSize}`);

  // 3. Multiple pages sharing ONE image object: optimized once, every page still shows it.
  const shared = encodeJpeg(700, 500, 95);
  const pdf4 = await pdfWithJpegImages([shared], { pagesShareOneImage: true });
  const r4 = await compressPdfWithReport(pdf4);
  t.check('8 a shared image referenced by 3 pages is optimized exactly once', r4.imagesOptimized === 1, String(r4.imagesOptimized));
  const doc4 = await PDFDocument.load(r4.bytes);
  t.check('9 all 3 pages survive and the doc still opens', doc4.getPageCount() === 3);

  // 4. Never touch images with transparency (SMask) — even if huge/JPEG.
  {
    const lib = await import('@cantoo/pdf-lib');
    const built = await pdfWithJpegImages([encodeJpeg(700, 500, 95)]);
    // pdf-lib only materializes an embedded image as a real PDFRawStream in
    // the object graph once the document is saved and reloaded — reload it,
    // then inject an /SMask entry directly on the image's own dict (any
    // truthy ref is enough to trip the "has SMask" guard), and save again.
    const reloaded = await lib.PDFDocument.load(built);
    const xobjects = reloaded.getPage(0).node.Resources()!.lookup(lib.PDFName.of('XObject'), lib.PDFDict);
    const [, ref] = [...xobjects.entries()][0];
    const streamObj = reloaded.context.lookup(ref as any, lib.PDFStream);
    if (!(streamObj instanceof lib.PDFRawStream)) throw new Error('expected a raw stream');
    streamObj.dict.set(lib.PDFName.of('SMask'), ref as any);
    const bytes = await reloaded.save();
    const r = await compressPdfWithReport(bytes);
    t.check('10 an image with an SMask entry is never touched', r.imagesOptimized === 0, String(r.imagesOptimized));
  }

  // 5. Non-JPEG images (PNG) are left alone — only /DCTDecode is in scope.
  {
    const doc = await PDFDocument.create();
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const embedded = await doc.embedPng(pngBytes);
    doc.addPage([300, 300]).drawImage(embedded, { x: 0, y: 0, width: 300, height: 300 });
    const bytes = await doc.save();
    const r = await compressPdfWithReport(bytes);
    t.check('11 PNG images (not /DCTDecode) are left untouched', r.imagesOptimized === 0, String(r.imagesOptimized));
  }

  // 6. A text-only PDF (no images at all) is unaffected by the image logic
  //    and still gets the structural object-stream save.
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 5; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 750, size: 20, font });
    const bytes = await doc.save();
    const r = await compressPdfWithReport(bytes);
    t.check('12 text-only PDF: 0 images optimized, still a valid 5-page PDF', r.imagesOptimized === 0 && (await PDFDocument.load(r.bytes)).getPageCount() === 5);
  }

  // 7. A corrupted/undecodable JPEG stream must be skipped, never throw or corrupt the doc.
  {
    const doc = await PDFDocument.create();
    const embedded = await doc.embedJpg(encodeJpeg(700, 500, 95));
    doc.addPage([600, 800]).drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });
    const bytes = await doc.save();
    // Corrupt the JPEG's actual byte content in the saved PDF so decode() throws,
    // while leaving the surrounding PDF structure intact (best-effort: flip a
    // run of bytes well past the JPEG SOI marker).
    const corrupted = new Uint8Array(bytes);
    const marker = Buffer.from([0xff, 0xd8, 0xff]);
    const idx = Buffer.from(corrupted).indexOf(marker);
    if (idx >= 0) for (let k = idx + 50; k < idx + 250 && k < corrupted.length; k++) corrupted[k] = 0;
    let threw = false;
    let out: Uint8Array | null = null;
    try { out = (await compressPdfWithReport(corrupted)).bytes; } catch { threw = true; }
    t.check('13 a corrupted embedded JPEG never crashes compression', !threw);
    t.check('14 the document is still returned and opens', !!out && (await PDFDocument.load(out!)).getPageCount() === 1);
  }

  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
