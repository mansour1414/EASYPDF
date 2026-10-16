import * as pdfjsLib from 'pdfjs-dist';
// Vite bundles this worker file as a fingerprinted asset and gives us its
// final URL at build time — see the comment below for why this replaced a
// CDN URL.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Self-host the pdf.js worker instead of loading it from cdnjs.cloudflare.com
// (Sep 2026 reliability fix). The CDN copy has to be published at the exact
// version pdfjs-dist reports at runtime — if cdnjs is slow to mirror a new
// release, blocked by the visitor's network, or simply down, every feature
// that renders a PDF page (thumbnails, PDF-to-image, OCR's page capture)
// silently breaks with no useful error. Bundling the worker guarantees an
// exact version match and removes that third-party dependency entirely.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PageThumbnail {
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Render all pages of a PDF document as data URLs for visual thumbnail management.
 */
export async function renderPdfThumbnails(
  pdfBytes: Uint8Array,
  maxPages = 100,
  scale = 0.3
): Promise<PageThumbnail[]> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDoc = await loadingTask.promise;
    const thumbnails: PageThumbnail[] = [];
    const count = Math.min(pdfDoc.numPages, maxPages);

    for (let i = 1; i <= count; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport,
        canvas
      } as any).promise;

      thumbnails.push({
        pageIndex: i - 1,
        dataUrl: canvas.toDataURL('image/jpeg', 0.8),
        width: viewport.width,
        height: viewport.height,
        rotation: 0
      });
    }

    return thumbnails;
  } catch (err) {
    console.error('Error rendering PDF thumbnails:', err);
    return [];
  }
}

/**
 * Extract text from a scanned PDF page or image using client-side canvas extraction
 */
export async function extractPdfPageImage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale = 1.5
): Promise<string | null> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDoc = await loadingTask.promise;
    if (pageIndex < 0 || pageIndex >= pdfDoc.numPages) return null;

    const page = await pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
      canvas
    } as any).promise;

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Error rendering PDF page image:', err);
    return null;
  }
}

/**
 * Number of pages in a PDF, for progress reporting before rendering starts.
 */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdfDoc = await loadingTask.promise;
  return pdfDoc.numPages;
}

export interface RenderedPageImage {
  pageIndex: number; // 0-based
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Convert PDF → PNG/JPEG (Sept 2026, Convert tool completion).
 *
 * Renders EVERY page of the PDF to a real, format-encoded image via the
 * canvas API — this is a genuine re-encoding of the rendered pixels, not
 * a renamed/relabeled file. `canvas.toBlob(..., 'image/jpeg', quality)`
 * produces an actual JPEG bitstream; `canvas.toBlob(..., 'image/png')`
 * produces an actual PNG bitstream.
 *
 * For JPEG output specifically: JPEG has no alpha channel, and pdf.js
 * renders onto a transparent canvas by default. Without filling a white
 * background first, any transparent area of the page would be encoded as
 * solid BLACK once flattened to JPEG (transparent -> black is the browser's
 * default canvas compositing behavior), which would corrupt the visual
 * output for any PDF with transparency. We fill white first to match how
 * a printed/exported page normally looks.
 */
export async function renderPdfPagesToImages(
  pdfBytes: Uint8Array,
  format: 'png' | 'jpeg',
  options: {
    scale?: number;
    jpegQuality?: number; // 0..1, only used for format === 'jpeg'
    maxPages?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<RenderedPageImage[]> {
  const { scale = 2, jpegQuality = 0.92, maxPages, onProgress } = options;
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdfDoc = await loadingTask.promise;
  const total = maxPages ? Math.min(pdfDoc.numPages, maxPages) : pdfDoc.numPages;
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const results: RenderedPageImage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (format === 'jpeg') {
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({
      canvasContext: context,
      viewport,
      canvas
    } as any).promise;

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        mimeType,
        format === 'jpeg' ? jpegQuality : undefined
      );
    });

    if (blob) {
      results.push({ pageIndex: i - 1, blob, width: viewport.width, height: viewport.height });
    }

    onProgress?.(i, total);

    // Release canvas memory promptly — matters for large/multi-page PDFs.
    canvas.width = 0;
    canvas.height = 0;
  }

  return results;
}

/**
 * Extract the real embedded text layer from a PDF (not OCR) so AI endpoints
 * (smart-rename, extract-data, summarize) can analyze the user's actual document
 * instead of a generic placeholder.
 */
export async function extractPdfText(
  pdfBytes: Uint8Array,
  maxPages = 5,
  maxChars = 4000
): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDoc = await loadingTask.promise;
    const count = Math.min(pdfDoc.numPages, maxPages);
    let combined = '';

    for (let i = 1; i <= count; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      combined += pageText + '\n\n';
      if (combined.length >= maxChars) break;
    }

    return combined.trim().substring(0, maxChars);
  } catch (err) {
    console.error('Error extracting PDF text layer:', err);
    return '';
  }
}
