/**
 * Text helpers for drawing user-supplied text (watermarks, page numbers) into
 * a PDF with @cantoo/pdf-lib.
 *
 * WHY THIS EXISTS: pdf-lib's standard fonts (Helvetica, ...) only cover the
 * WinAnsi character set. Arabic (and any other non-Latin text) silently turned
 * into "?" characters. This module applies the same approach the server uses
 * for /api/pdf/edit-text: embed the bundled Amiri font through fontkit and run
 * Arabic through the project's shaper (contextual forms + visual RTL order),
 * because pdf-lib itself performs no bidi/shaping.
 *
 * Rules:
 *  - Text that fits WinAnsi keeps using the standard font (English output is
 *    byte-for-byte the same approach as before).
 *  - Anything else uses Amiri. If the text contains characters that Amiri
 *    cannot draw either (e.g. Cyrillic, CJK, emoji) we THROW a clear error
 *    instead of silently exporting "?" or empty boxes.
 */
import type { PDFDocument, PDFFont } from '@cantoo/pdf-lib';
import { needsArabicShaping, shapeArabicText } from '../../arabicShaper';

// Same WinAnsi coverage test as server.ts (WINANSI_SAFE_RE).
const WINANSI_SAFE_RE =
  /^[\u0000-\u00FF\u20AC\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2013\u2014\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2122\n\r\t]*$/;

export function isWinAnsiSafe(text: string): boolean {
  return WINANSI_SAFE_RE.test(text);
}

/** Public path of the bundled font (public/fonts/Amiri-Regular.ttf). */
export const UNICODE_FONT_URL = '/fonts/Amiri-Regular.ttf';

/** Error whose message is available in English and Arabic. */
export class LocalizedPdfError extends Error {
  readonly code: string;
  readonly messageAr: string;
  constructor(code: string, message: string, messageAr: string) {
    super(message);
    this.name = 'LocalizedPdfError';
    this.code = code;
    this.messageAr = messageAr;
  }
}

/** Picks the message for the UI language for any thrown value. */
export function pdfErrorMessage(err: unknown, lang: string, fallback = ''): string {
  if (err instanceof LocalizedPdfError) {
    return lang === 'ar' ? err.messageAr : err.message;
  }
  const msg = (err as any)?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

let fontBytesCache: Uint8Array | null = null;
let fontkitCache: any = null;

function looksLikeFont(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  // TrueType 0x00010000, 'true', OpenType 'OTTO'
  return (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === 'true' || tag === 'OTTO';
}

/**
 * Returns the Amiri font bytes. `provided` lets tests/Node callers pass the
 * bytes directly; in the browser it is fetched once from /fonts and cached.
 */
export async function loadUnicodeFontBytes(provided?: Uint8Array): Promise<Uint8Array> {
  if (provided) return provided;
  if (fontBytesCache) return fontBytesCache;
  if (typeof fetch !== 'function') {
    throw new LocalizedPdfError(
      'FONT_UNAVAILABLE',
      'The Arabic/Unicode font could not be loaded, so this text cannot be added safely.',
      'تعذّر تحميل الخط العربي، لذلك لا يمكن إضافة هذا النص بأمان.'
    );
  }
  let bytes: Uint8Array | null = null;
  try {
    const res = await fetch(UNICODE_FONT_URL);
    if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    bytes = null;
  }
  // An SPA host may answer a missing file with index.html (HTTP 200): verify.
  if (!bytes || !looksLikeFont(bytes)) {
    throw new LocalizedPdfError(
      'FONT_UNAVAILABLE',
      'The Arabic/Unicode font could not be loaded, so this text cannot be added safely. Check your connection and try again.',
      'تعذّر تحميل الخط العربي، لذلك لا يمكن إضافة هذا النص بأمان. تحقّق من اتصالك وحاول مرة أخرى.'
    );
  }
  fontBytesCache = bytes;
  return bytes;
}

async function getFontkit(): Promise<any> {
  if (!fontkitCache) {
    const m: any = await import('@pdf-lib/fontkit');
    fontkitCache = m.default ?? m;
  }
  return fontkitCache;
}

export interface PreparedText {
  /** Font to pass to page.drawText / widthOfTextAtSize. */
  font: PDFFont;
  /** Text to actually draw (shaped/reordered when Arabic). */
  text: string;
  /** True when the Unicode (Amiri) font is used. */
  unicode: boolean;
}

/**
 * Chooses the font for `rawText` and returns the exact string to draw.
 * `standardFont` is the caller's existing WinAnsi font; `getUnicodeFont`
 * memoizes the embedded Amiri font per document so it is embedded once.
 */
export function createTextPreparer(
  pdfDoc: PDFDocument,
  standardFont: PDFFont,
  unicodeFontBytes?: Uint8Array
) {
  let unicodeFont: PDFFont | null = null;

  return async function prepare(rawText: string): Promise<PreparedText> {
    if (isWinAnsiSafe(rawText)) {
      return { font: standardFont, text: rawText, unicode: false };
    }

    if (!unicodeFont) {
      const bytes = await loadUnicodeFontBytes(unicodeFontBytes);
      pdfDoc.registerFontkit(await getFontkit());
      // Subsetting stays OFF: pdf-lib's subsetter breaks on Amiri's complex
      // GSUB/GPOS tables (same choice as the server-side edit-text export).
      unicodeFont = await pdfDoc.embedFont(bytes);
    }

    const drawText = needsArabicShaping(rawText) ? shapeArabicText(rawText) : rawText;

    // Never export "?" or empty boxes silently: reject text the font cannot draw.
    const supported = new Set(unicodeFont.getCharacterSet());
    const missing = Array.from(new Set(Array.from(drawText).filter(
      (ch) => !/\s/.test(ch) && !supported.has(ch.codePointAt(0)!)
    )));
    if (missing.length > 0) {
      const shown = missing.slice(0, 6).join(' ');
      throw new LocalizedPdfError(
        'UNSUPPORTED_CHARACTERS',
        `This text contains characters that cannot be written into the PDF (${shown}). Supported: English, Arabic and common Latin letters.`,
        `يحتوي النص على أحرف لا يمكن كتابتها داخل ملف PDF (${shown}). المدعوم: الإنجليزية والعربية والحروف اللاتينية الشائعة.`
      );
    }

    return { font: unicodeFont, text: drawText, unicode: true };
  };
}
