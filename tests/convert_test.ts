/**
 * Focused unit test: Convert tool completion (Sept 2026).
 *
 * Covers the parts of the Convert tool that are pure functions and can run
 * in plain Node (no browser/canvas), against the REAL implementations used
 * by Workspace.tsx:
 *   1. sniffImageType() correctly identifies real PNG/JPEG magic bytes and
 *      rejects non-image bytes, regardless of any claimed file extension.
 *   2. imagesToPdf() produces a real, valid, multi-page PDF from real PNG
 *      input, with the exact page count and aspect ratio preserved.
 *
 * NOT covered here (requires a real browser Canvas/pdf.js runtime, which
 * this sandboxed Node test environment does not have — see the
 * Implementation Report's "Remaining Manual Steps" section):
 *   - renderPdfPagesToImages() (PDF -> PNG/JPG rendering via pdf.js+canvas)
 *   - the Workspace.tsx UI flow itself (direction switcher, ZIP download)
 *
 * Run with:  npx tsx tests/convert_test.ts
 */

import { imagesToPdf } from '../src/lib/pdfOperations';
import { sniffImageType } from '../src/lib/fileValidation';
import { PDFDocument } from '@cantoo/pdf-lib';

// Smallest valid 1x1 PNG (well-known minimal fixture), decoded from base64.
const PNG_1PX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Smallest valid 1x1 baseline JPEG (well-known minimal fixture).
const JPEG_1PX_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function main() {
  console.log('=====================================================');
  console.log('CONVERT TOOL TEST (sniffImageType + imagesToPdf)');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) { console.log(`[PASS] ${name}`); passed++; }
    else { console.error(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`); failed++; }
  }

  const pngBytes = b64ToBytes(PNG_1PX_BASE64);
  const jpegBytes = b64ToBytes(JPEG_1PX_BASE64);
  const notAnImage = new TextEncoder().encode('This is definitely not an image file.');

  // 1) sniffImageType correctness
  assert(sniffImageType(pngBytes) === 'png', 'sniffImageType identifies real PNG bytes as png');
  assert(sniffImageType(jpegBytes) === 'jpg', 'sniffImageType identifies real JPEG bytes as jpg');
  assert(sniffImageType(notAnImage) === null, 'sniffImageType rejects plain text bytes (not fooled by a fake .png filename elsewhere in the app)');
  assert(sniffImageType(new Uint8Array([0x89, 0x50])) === null, 'sniffImageType rejects truncated/too-short byte arrays instead of throwing');

  // 2) imagesToPdf: real multi-page PDF from real PNG input
  try {
    const pdfBytes = await imagesToPdf([
      { bytes: pngBytes, format: 'png' },
      { bytes: pngBytes, format: 'png' },
      { bytes: pngBytes, format: 'png' },
    ]);

    assert(pdfBytes.length > 0, 'imagesToPdf returns non-empty output bytes');

    const magic = new TextDecoder().decode(pdfBytes.slice(0, 5));
    assert(magic === '%PDF-', 'Output starts with the real %PDF- header (not a renamed/fake file)');

    const parsed = await PDFDocument.load(pdfBytes);
    assert(parsed.getPageCount() === 3, 'Output PDF has exactly 3 pages (one per input image)', `got ${parsed.getPageCount()}`);

    const page = parsed.getPage(0);
    const { width, height } = page.getSize();
    // The 1x1 fixture PNG is 1x1 — the page must be sized to the image's
    // own pixel dimensions (1x1), proving the page was NOT stretched to
    // some fixed/unrelated page size and the image was drawn at its native
    // aspect ratio.
    assert(width === 1 && height === 1, 'Page size matches the source image pixel dimensions (aspect ratio preserved, not stretched)', `got ${width}x${height}`);
  } catch (e: any) {
    assert(false, 'imagesToPdf(png fixtures) completes without throwing', e?.message);
  }

  // 3) imagesToPdf: empty input is rejected with a clear error, not a
  //    silently "successful" empty/fake PDF.
  try {
    await imagesToPdf([]);
    assert(false, 'imagesToPdf([]) throws instead of returning a fake result');
  } catch (e: any) {
    assert(/no valid images/i.test(e?.message || ''), 'imagesToPdf([]) throws a clear, specific error message', e?.message);
  }

  // 4) imagesToPdf: real JPEG input also embeds successfully (exercises the
  //    embedJpg() code path, same as sniffImageType would route a real JPEG
  //    upload to in Workspace.tsx).
  try {
    const pdfBytes = await imagesToPdf([{ bytes: jpegBytes, format: 'jpg' }]);
    const parsed = await PDFDocument.load(pdfBytes);
    assert(parsed.getPageCount() === 1, 'imagesToPdf embeds a real JPEG fixture into a 1-page PDF', `got ${parsed.getPageCount()} pages`);
  } catch (e: any) {
    assert(false, 'imagesToPdf(jpeg fixture) completes without throwing', e?.message);
  }

  console.log('\n=====================================================');
  console.log(`CONVERT TOOL TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================');

  if (failed > 0) process.exit(1);
}

main();
