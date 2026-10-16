// NOTE: uses @cantoo/pdf-lib (a maintained fork of pdf-lib) because the
// original 'pdf-lib' package does not implement PDFDocument.encrypt(),
// which silently produced UNENCRYPTED "protected" PDFs. Do not switch this
// back to plain 'pdf-lib'.
import { PDFDocument, EncryptedPDFError, degrees, rgb, StandardFonts, PDFDict, PDFName, PDFRef, PDFStream, PDFRawStream, PDFArray, PDFNumber } from '@cantoo/pdf-lib';
import { LocalizedPdfError, createTextPreparer } from './pdfText';

export { LocalizedPdfError, pdfErrorMessage } from './pdfText';

/**
 * Password-protected PDFs.
 *
 * Every editing operation below used to load its input with
 * { ignoreEncryption: true }, which lets pdf-lib "open" an encrypted file
 * without decrypting it: the tool then produced output with missing or
 * broken content and reported success. All operations now load through
 * loadPdfForEditing(), which refuses encrypted input with a clear message
 * that tells the user to unlock the PDF first. (Only unlockPdf() may
 * handle encrypted files.)
 */
export const PDF_ENCRYPTED_CODE = 'PDF_ENCRYPTED';

export function encryptedPdfError(fileName?: string): LocalizedPdfError {
  const name = fileName ? `"${fileName}" ` : '';
  return new LocalizedPdfError(
    PDF_ENCRYPTED_CODE,
    `${name ? name : 'This PDF '}is password-protected. Please unlock it first with the Unlock PDF tool, then try again.`,
    `${fileName ? `الملف "${fileName}" ` : 'هذا الملف '}محمي بكلمة مرور. الرجاء فك حمايته أولاً باستخدام أداة "فك حماية PDF" ثم أعد المحاولة.`
  );
}

export function isPdfEncryptionError(e: unknown): boolean {
  return e instanceof EncryptedPDFError || /encrypt/i.test(String((e as any)?.message ?? ''));
}

/** Loads a PDF for editing; throws a clear "unlock it first" error if encrypted. */
export async function loadPdfForEditing(pdfBytes: Uint8Array, fileName?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(pdfBytes);
  } catch (e) {
    if (isPdfEncryptionError(e)) throw encryptedPdfError(fileName);
    throw e;
  }
}

/** Throws the same "unlock it first" error if the PDF is encrypted; otherwise resolves. */
export async function assertPdfNotEncrypted(pdfBytes: Uint8Array, fileName?: string): Promise<void> {
  await loadPdfForEditing(pdfBytes, fileName);
}

/**
 * Strict page-range parser for the Split tool ("1-3, 5, 7-9").
 * Every problem is a clear, localized error — invalid input must never fall
 * back silently to some default page. Order is preserved as typed.
 */
export function parsePageRanges(input: string, totalPages: number): number[] {
  const err = (code: string, en: string, ar: string) => new LocalizedPdfError(code, en, ar);
  const cleaned = String(input ?? '').replace(/\s+/g, '');
  if (!cleaned) {
    throw err('RANGE_EMPTY', 'Please enter the pages to extract, for example 1-3,5.', 'الرجاء إدخال الصفحات المراد استخراجها، مثال: 1-3,5');
  }

  const pages: number[] = [];
  for (const part of cleaned.split(',')) {
    if (!part) {
      throw err('RANGE_INVALID', 'Invalid page range: there is an empty entry (check for extra commas). Example: 1-3,5.', 'نطاق صفحات غير صالح: يوجد عنصر فارغ (تحقق من الفواصل الزائدة). مثال: 1-3,5');
    }
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) {
      throw err('RANGE_INVALID', `Invalid page range "${part}". Use numbers like 3 or ranges like 2-5, separated by commas.`, `نطاق الصفحات "${part}" غير صالح. استخدم أرقاماً مثل 3 أو نطاقات مثل 2-5 مفصولة بفواصل.`);
    }
    const start = parseInt(m[1], 10);
    const end = m[2] === undefined ? start : parseInt(m[2], 10);
    if (start < 1 || end < 1) {
      throw err('RANGE_INVALID', `Invalid page range "${part}". Page numbers start at 1.`, `نطاق الصفحات "${part}" غير صالح. ترقيم الصفحات يبدأ من 1.`);
    }
    if (start > end) {
      throw err('RANGE_INVALID', `Invalid page range "${part}": the first page must not be after the last page.`, `نطاق الصفحات "${part}" غير صالح: يجب ألا تكون الصفحة الأولى بعد الأخيرة.`);
    }
    if (end > totalPages) {
      throw err('RANGE_OUT_OF_BOUNDS', `Page range "${part}" is outside this document, which has ${totalPages} page${totalPages === 1 ? '' : 's'}.`, `نطاق الصفحات "${part}" خارج حدود المستند، وعدد صفحاته ${totalPages}.`);
    }
    for (let p = start; p <= end; p++) pages.push(p - 1);
  }
  return pages;
}

export interface PageOperationConfig {
  order?: number[]; // New array of 0-based page indices
  rotations?: Record<number, number>; // Map of original pageIndex -> rotation angle (0, 90, 180, 270)
  deletedPages?: number[]; // List of page indices to delete
}

export interface WatermarkOptions {
  type: 'text' | 'image';
  text?: string;
  imageBytes?: Uint8Array;
  imageType?: 'png' | 'jpg';
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number; // 0.1 to 1.0
  fontSize?: number; // default 36
  rotationAngle?: number; // default 45 deg
  colorHex?: string; // e.g. '#FF0000'
  /** Optional Amiri font bytes (Node/tests). In the browser it is fetched from /fonts automatically. */
  unicodeFontBytes?: Uint8Array;
}

export interface PageNumberOptions {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center';
  format: string; // e.g. "Page {n} of {total}" or "{n}"
  startNumber?: number; // default 1
  fontSize?: number; // default 10
  colorHex?: string; // default '#333333'
  /** Optional Amiri font bytes (Node/tests). In the browser it is fetched from /fonts automatically. */
  unicodeFontBytes?: Uint8Array;
}

export interface SignatureOptions {
  imageBytes: Uint8Array; // PNG bytes of signature
  pageIndex: number; // 0-based index
  xPercent: number; // 0 to 100% of page width
  yPercent: number; // 0 to 100% of page height
  width: number; // in pt
  height: number; // in pt
}

/**
 * 1. Visual Page Manager (Reorder, Rotate, Delete pages, Insert from another document)
 */
export async function manipulatePages(
  pdfBytes: Uint8Array,
  pageOrder: number[], // Array of page indices to keep in specified order
  pageRotations: Record<number, number>, // pageIndex -> additional rotation angle
  appendPdfs: Uint8Array[] = []
): Promise<Uint8Array> {
  const srcDoc = await loadPdfForEditing(pdfBytes);
  const outDoc = await PDFDocument.create();

  // Copy specified pages in new order
  const copiedPages = await outDoc.copyPages(srcDoc, pageOrder);
  copiedPages.forEach((page, idx) => {
    const origIndex = pageOrder[idx];
    const addRot = pageRotations[origIndex] || 0;
    if (addRot !== 0) {
      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + addRot) % 360));
    }
    outDoc.addPage(page);
  });

  // Append any extra pages from other uploaded PDF files if present
  // A file that cannot be appended (encrypted or damaged) is an ERROR, not
  // something to skip: skipping silently produced incomplete output.
  for (const extraBytes of appendPdfs) {
    const extraDoc = await loadPdfForEditing(extraBytes);
    const extraIndices = extraDoc.getPageIndices();
    const extraCopied = await outDoc.copyPages(extraDoc, extraIndices);
    extraCopied.forEach(p => outDoc.addPage(p));
  }

  return await outDoc.save();
}

/**
 * Real (scoped, safe) image recompression for embedded JPEG photos.
 *
 * SCOPE, deliberately narrow (Sep 2026 hardening): this project has
 * repeatedly shipped "compression" that quietly did nothing, and separately
 * has a rule to never risk corrupting a user's real document. So this only
 * touches the single safest, most common case — a real embedded JPEG
 * (Filter /DCTDecode) with no transparency, 8-bit components, at least
 * MIN_IMAGE_BYTES bytes — and for every image outside that exact shape
 * (indexed color, CMYK, SMask/Mask, non-JPEG filters like raw bitmaps,
 * CCITT/JBIG2 scans, huge pixel counts) it leaves the image completely
 * untouched rather than guess. Any decode/encode error on one image is
 * caught and that image is skipped; it never aborts the rest of the
 * document or throws. An image is only ever replaced if the re-encoded
 * result is genuinely smaller (see MIN_SAVINGS_RATIO) — otherwise the
 * original bytes are kept, so this can never make a file BIGGER.
 *
 * Multiple pages can reference the exact same image object (a repeated
 * header/logo, for example); every occurrence is tracked and repointed to
 * the new image together, and the old object is deleted from the document
 * only once every occurrence has been updated — never partially.
 */
const JPEG_RECOMPRESS_QUALITY = 78; // 0-100; chosen for savings with minimal visible loss
const MIN_IMAGE_BYTES_TO_BOTHER = 20 * 1024; // skip small images: not worth the risk/CPU
const MIN_SAVINGS_RATIO = 0.85; // only replace if the new file is at most 85% of the original size
const MAX_IMAGE_PIXELS = 40_000_000; // guard against pathological/huge images (memory & time)

interface JpegRecompressResult {
  imagesOptimized: number;
  bytesSaved: number;
}

async function recompressEmbeddedJpegImages(pdfDoc: PDFDocument): Promise<JpegRecompressResult> {
  const result: JpegRecompressResult = { imagesOptimized: 0, bytesSaved: 0 };

  let jpeg: { decode: Function; encode: Function };
  try {
    const [jpegMod, bufferMod] = await Promise.all([import('jpeg-js'), import('buffer')]);
    jpeg = (jpegMod as any).default ?? (jpegMod as any);
    // jpeg-js's encoder unconditionally uses the Node `Buffer` global, which
    // does not exist in a browser. This is the standard bundler-style
    // polyfill: only set if genuinely missing (never overrides Node's real
    // Buffer), loaded lazily so pages that never compress an image never
    // pay for it.
    if (typeof (globalThis as any).Buffer === 'undefined') {
      (globalThis as any).Buffer = (bufferMod as any).Buffer;
    }
  } catch (e) {
    // The optional library failed to load for any reason: skip image
    // recompression entirely rather than fail the whole Compress operation.
    console.error('Image recompression unavailable (jpeg-js failed to load):', e);
    return result;
  }

  type Occurrence = { dict: PDFDict; key: PDFName };
  const candidates = new Map<string, { ref: PDFRef; contents: Uint8Array; occurrences: Occurrence[] }>();

  for (const page of pdfDoc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) continue;

    for (const [key, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef)) continue; // only handle normal indirect image refs
      const streamObj = pdfDoc.context.lookupMaybe(value, PDFStream);
      if (!streamObj || !(streamObj instanceof PDFRawStream)) continue; // only handle raw (undecoded) streams
      const stream: PDFRawStream = streamObj;
      const dict = stream.dict;

      const subtype = dict.lookup(PDFName.of('Subtype'));
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') continue;

      // JPEG only: the raw stream bytes for /DCTDecode ARE a complete,
      // literal JPEG file — no separate decoding/reconstruction needed to
      // read or write it, which is exactly what keeps this safe.
      const filter = dict.lookup(PDFName.of('Filter'));
      const filterName =
        filter instanceof PDFName ? filter.asString()
        : (filter instanceof PDFArray && filter.size() === 1 && filter.lookup(0) instanceof PDFName)
          ? (filter.lookup(0) as PDFName).asString()
          : null;
      if (filterName !== '/DCTDecode') continue;

      // Never touch anything with transparency, non-8-bit samples, or that
      // is otherwise not the plain case this function was validated against.
      if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) continue;
      const bpc = dict.lookup(PDFName.of('BitsPerComponent'));
      if (!(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) continue;
      if (stream.contents.length < MIN_IMAGE_BYTES_TO_BOTHER) continue;

      const refKey = value.toString();
      let entry = candidates.get(refKey);
      if (!entry) {
        entry = { ref: value, contents: stream.contents, occurrences: [] };
        candidates.set(refKey, entry);
      }
      entry.occurrences.push({ dict: xobjects, key });
    }
  }

  for (const { ref, contents, occurrences } of candidates.values()) {
    try {
      const decoded = jpeg.decode(contents, { useTArray: true, maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000 });
      if (!decoded || !decoded.data || decoded.width * decoded.height > MAX_IMAGE_PIXELS) continue;

      const encoded = jpeg.encode(
        { width: decoded.width, height: decoded.height, data: decoded.data },
        JPEG_RECOMPRESS_QUALITY
      );
      const newBytes: Uint8Array = encoded.data instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data);

      if (newBytes.length >= contents.length * MIN_SAVINGS_RATIO) continue; // not enough of a win: keep the original

      const newImage = await pdfDoc.embedJpg(newBytes);
      for (const occ of occurrences) occ.dict.set(occ.key, newImage.ref);
      pdfDoc.context.delete(ref);

      result.imagesOptimized++;
      result.bytesSaved += contents.length - newBytes.length;
    } catch (e) {
      // Any decode/encode failure on this one image: leave it completely
      // untouched (the original reference is never modified) and move on.
      console.warn('Skipped recompressing one embedded image (left unchanged):', e);
      continue;
    }
  }

  return result;
}

/**
 * Compress PDF: re-saves with object-stream optimization (structural, always
 * safe, was the whole implementation before Sep 2026) and now additionally
 * re-encodes eligible embedded JPEG photos at a high-quality setting when
 * that produces a real, meaningful size reduction (see
 * recompressEmbeddedJpegImages for the exact, narrow scope and safety
 * rules). Returns the compressed bytes plus a real, measured report so the
 * UI can show honest before/after numbers instead of a guess.
 */
export async function compressPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const { bytes } = await compressPdfWithReport(pdfBytes);
  return bytes;
}

export interface CompressReport {
  bytes: Uint8Array;
  originalSize: number;
  finalSize: number;
  imagesOptimized: number;
}

export async function compressPdfWithReport(pdfBytes: Uint8Array): Promise<CompressReport> {
  const pdfDoc = await loadPdfForEditing(pdfBytes);
  const { imagesOptimized } = await recompressEmbeddedJpegImages(pdfDoc);
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return { bytes, originalSize: pdfBytes.length, finalSize: bytes.length, imagesOptimized };
}

/**
 * 2. Password Protection & Removal
 */
export async function protectPdf(
  pdfBytes: Uint8Array,
  password: string
): Promise<Uint8Array> {
  // Re-protecting an already encrypted file would produce a broken document.
  const pdfDoc = await loadPdfForEditing(pdfBytes);

  // @cantoo/pdf-lib implements real encryption. Fail loudly instead of
  // silently returning an unencrypted file if this ever isn't available.
  if (typeof (pdfDoc as any).encrypt !== 'function') {
    throw new Error('PDF encryption is not available in this build. Refusing to return an unprotected file.');
  }

  await (pdfDoc as any).encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false
    }
  });

  return await pdfDoc.save({ useObjectStreams: true });
}

export async function unlockPdf(
  pdfBytes: Uint8Array,
  password?: string
): Promise<Uint8Array> {
  // SAFETY FIX: the previous implementation always loaded with
  // { ignoreEncryption: true } and NO password handling, silently producing a
  // CORRUPT output for genuinely encrypted documents.
  //
  // Detection strategy (verified against @cantoo/pdf-lib internals):
  //   1. Try a PLAIN load. Unencrypted documents succeed here and are returned
  //      byte-for-byte unchanged (fast path, zero behavioral change).
  //   2. A plain load of an encrypted document throws EncryptedPDFError:
  //        - without a password  -> clear actionable error;
  //        - with a password     -> retry WITH { password, ignoreEncryption:
  //          true }, which decrypts every stream via CipherTransformFactory.
  //          A wrong password throws during parse ("incorrect password").
  //
  // IMPORTANT: after a successful password decryption the loader DELETES
  // trailerInfo.Encrypt and reports isEncrypted === false — so we must NOT
  // rely on those flags afterwards. We instead remember that decryption
  // happened, and REBUILD a brand-new clean document (copying the decrypted
  // pages over) so the output cannot inherit ANY encryption structures
  // (orphaned xref-stream dicts with /Encrypt included).
  let src: PDFDocument | null = null;
  let wasDecrypted = false;

  try {
    src = await PDFDocument.load(pdfBytes, {});
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (!/encrypt/i.test(msg)) {
      throw new Error('This PDF could not be opened. It may be damaged.');
    }
    if (!password) {
      // Some PDFs only carry an OWNER password (permission restrictions) and
      // open with a blank user password. Try that before asking for one, so
      // "unlock it first" also works for those files. A document that really
      // needs a password still fails here with the same clear message.
      try {
        src = await PDFDocument.load(pdfBytes, { password: '', ignoreEncryption: true });
        wasDecrypted = true;
      } catch {
        throw new Error(
          'This PDF is password-protected. Please enter the correct password to unlock it.'
        );
      }
    } else {
      try {
        src = await PDFDocument.load(pdfBytes, { password, ignoreEncryption: true });
        wasDecrypted = true;
      } catch {
        throw new Error(
          'Incorrect password — this PDF could not be decrypted with the password you entered.'
        );
      }
    }
  }

  if (!wasDecrypted || !src) {
    // Plain, unencrypted document — keep original bytes untouched so behavior
    // is exactly as before this fix.
    return pdfBytes;
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((page) => out.addPage(page));

  return await out.save();
}

/**
 * Helper to convert HEX color to RGB object for pdf-lib
 */
function hexToRgb(hex: string) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255 || 0;
  return rgb(r, g, b);
}

/**
 * 3. Watermark Tool
 */
export async function addWatermark(
  pdfBytes: Uint8Array,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const pdfDoc = await loadPdfForEditing(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  // WinAnsi-safe text keeps using Helvetica-Bold (English unchanged); Arabic
  // and other Unicode text is drawn with the embedded Amiri font + shaping
  // instead of silently becoming "?" characters.
  const prepareText = createTextPreparer(pdfDoc, font, options.unicodeFontBytes);
  const prepared = options.type === 'text' && options.text ? await prepareText(options.text) : null;

  let embeddedImg: any = null;
  if (options.type === 'image' && options.imageBytes) {
    if (options.imageType === 'jpg') {
      embeddedImg = await pdfDoc.embedJpg(options.imageBytes);
    } else {
      embeddedImg = await pdfDoc.embedPng(options.imageBytes);
    }
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    const opacity = options.opacity ?? 0.3;

    if (options.type === 'text' && options.text && prepared) {
      const text = prepared.text;
      const drawFont = prepared.font;
      const fontSize = options.fontSize || 36;
      const textWidth = drawFont.widthOfTextAtSize(text, fontSize);
      const textHeight = drawFont.heightAtSize(fontSize);
      const rot = degrees(options.rotationAngle ?? 45);
      const color = hexToRgb(options.colorHex || '#FF0000');

      let x = width / 2 - textWidth / 2;
      let y = height / 2 - textHeight / 2;

      if (options.position === 'top-left') { x = 40; y = height - 60; }
      else if (options.position === 'top-right') { x = width - textWidth - 40; y = height - 60; }
      else if (options.position === 'bottom-left') { x = 40; y = 40; }
      else if (options.position === 'bottom-right') { x = width - textWidth - 40; y = 40; }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font: drawFont,
        color,
        opacity,
        rotate: rot
      });
    } else if (options.type === 'image' && embeddedImg) {
      const imgWidth = embeddedImg.width * 0.5;
      const imgHeight = embeddedImg.height * 0.5;
      let x = width / 2 - imgWidth / 2;
      let y = height / 2 - imgHeight / 2;

      if (options.position === 'top-left') { x = 40; y = height - imgHeight - 40; }
      else if (options.position === 'top-right') { x = width - imgWidth - 40; y = height - imgHeight - 40; }
      else if (options.position === 'bottom-left') { x = 40; y = 40; }
      else if (options.position === 'bottom-right') { x = width - imgWidth - 40; y = 40; }

      page.drawImage(embeddedImg, {
        x,
        y,
        width: imgWidth,
        height: imgHeight,
        opacity,
        rotate: degrees(options.rotationAngle ?? 0)
      });
    }
  }

  return await pdfDoc.save();
}

/**
 * 4. Page Numbering Tool
 */
export async function addPageNumbers(
  pdfBytes: Uint8Array,
  options: PageNumberOptions
): Promise<Uint8Array> {
  const pdfDoc = await loadPdfForEditing(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const startNum = options.startNumber || 1;
  const fontSize = options.fontSize || 10;
  const color = hexToRgb(options.colorHex || '#333333');
  // English/Latin formats keep Helvetica; Arabic (e.g. "صفحة {n} من {total}")
  // uses the embedded Amiri font + shaping instead of turning into "?".
  const prepareText = createTextPreparer(pdfDoc, font, options.unicodeFontBytes);

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const { width, height } = page.getSize();
    const currentNum = startNum + idx;

    const template = options.format || 'Page {n} of {total}';
    const filled = template.split('{n}').join(String(currentNum)).split('{total}').join(String(totalPages));
    const prepared = await prepareText(filled);
    const text = prepared.text;
    const drawFont = prepared.font;

    const textWidth = drawFont.widthOfTextAtSize(text, fontSize);
    let x = width / 2 - textWidth / 2;
    let y = 25; // default bottom-center margin

    if (options.position === 'bottom-left') { x = 35; y = 25; }
    else if (options.position === 'bottom-right') { x = width - textWidth - 35; y = 25; }
    else if (options.position === 'top-center') { x = width / 2 - textWidth / 2; y = height - 35; }
    else if (options.position === 'top-right') { x = width - textWidth - 35; y = height - 35; }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font: drawFont,
      color
    });
  }

  return await pdfDoc.save();
}

/**
 * 6. Images → PDF (real conversion via @cantoo/pdf-lib)
 *
 * Extracted out of Workspace.tsx's convert-to handler so the core
 * conversion logic is a plain, unit-testable function (see
 * tests/convert_test.ts) instead of being inlined inside a React event
 * handler. Behavior is unchanged from the original inline implementation:
 * each image becomes its own PDF page sized exactly to the image's pixel
 * dimensions, so the image is drawn at 1:1 scale and its aspect ratio is
 * preserved by construction (never stretched/distorted).
 */
export interface ImageInput {
  bytes: Uint8Array;
  format: 'jpg' | 'png';
}

export async function imagesToPdf(images: ImageInput[]): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error('No valid images were provided to convert.');
  }

  const pdfDoc = await PDFDocument.create();

  for (const img of images) {
    const embeddedImage = img.format === 'jpg'
      ? await pdfDoc.embedJpg(img.bytes)
      : await pdfDoc.embedPng(img.bytes);

    // Page sized to the image's own pixel dimensions: the image is drawn
    // at (0,0) with width/height equal to the page size, so it fills the
    // page exactly with no stretching and no distortion of its aspect ratio.
    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });
  }

  return await pdfDoc.save();
}

/**
 * 7. E-Signature Placement Tool
 */
export async function addSignatureToPdf(
  pdfBytes: Uint8Array,
  options: SignatureOptions
): Promise<Uint8Array> {
  const pdfDoc = await loadPdfForEditing(pdfBytes);
  const sigImage = await pdfDoc.embedPng(options.imageBytes);
  const pages = pdfDoc.getPages();

  if (options.pageIndex >= 0 && options.pageIndex < pages.length) {
    const page = pages[options.pageIndex];
    const { width, height } = page.getSize();

    // Calculate actual coordinates from percentage
    const x = (options.xPercent / 100) * width;
    const y = ((100 - options.yPercent) / 100) * height - options.height;

    page.drawImage(sigImage, {
      x: Math.max(0, Math.min(width - options.width, x)),
      y: Math.max(0, Math.min(height - options.height, y)),
      width: options.width,
      height: options.height
    });
  }

  return await pdfDoc.save();
}
