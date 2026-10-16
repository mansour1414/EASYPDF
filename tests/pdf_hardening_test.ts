/**
 * PDF tool hardening regressions (real src/lib code, real PDFs):
 *   M1  Arabic text in Watermark / Page Numbers is rendered, not turned into "?"
 *   M2  Password-protected PDFs are refused with a clear "unlock first" error
 *       instead of producing incomplete output
 *   Split page-range validation (no silent fallback to page 1)
 *
 * Run with:  npx tsx tests/pdf_hardening_test.ts
 */
import fs from 'fs';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  addWatermark, addPageNumbers, addSignatureToPdf, compressPdf, protectPdf, unlockPdf,
  manipulatePages, loadPdfForEditing, assertPdfNotEncrypted, parsePageRanges,
  LocalizedPdfError, PDF_ENCRYPTED_CODE,
} from '../src/lib/pdfOperations';
import http from 'http';
import { makeRunner } from './support/harness';

const FONT = new Uint8Array(fs.readFileSync('public/fonts/Amiri-Regular.ttf'));
const t = makeRunner('PDF HARDENING: ARABIC TEXT, ENCRYPTED INPUT, SPLIT RANGES');

async function plain(pages = 3): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`Body ${i + 1}`, { x: 50, y: 750, size: 20, font: f });
  return await d.save();
}
async function encrypted(userPw: string, ownerPw = userPw, pages = 2): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([300, 300]).drawText('SECRET', { x: 20, y: 150, size: 12, font: f });
  await (d as any).encrypt({ userPassword: userPw, ownerPassword: ownerPw });
  return await d.save();
}
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it: any) => it.str).join(''));
  }
  return out;
}
const arabicCount = (s: string) => (s.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
const has = (bytes: Uint8Array, needle: string) => Buffer.from(bytes).toString('latin1').includes(needle);
async function code(fn: () => Promise<any>): Promise<{ code?: string; msg: string; ar?: string; err?: any }> {
  try { await fn(); return { msg: '<no error>' }; }
  catch (e: any) { return { code: e instanceof LocalizedPdfError ? e.code : undefined, msg: String(e?.message), ar: (e as any)?.messageAr, err: e }; }
}

async function main() {
  const base = await plain();

  // ================= M1: Arabic =================
  const wmAr = await addWatermark(base, { type: 'text', text: 'سري للغاية', position: 'center', opacity: 0.3, unicodeFontBytes: FONT });
  const wmArTexts = await pageTexts(wmAr);
  t.check('M1-1 Arabic watermark contains Arabic glyph text on every page', wmArTexts.every(s => arabicCount(s) >= 5), JSON.stringify(wmArTexts));
  t.check('M1-2 Arabic watermark produced no "?" replacement characters', wmArTexts.every(s => !s.includes('?')), JSON.stringify(wmArTexts));
  t.check('M1-3 original body text is still there', wmArTexts.every((s, i) => s.includes(`Body ${i + 1}`)));
  t.check('M1-4 output has 3 pages and re-opens', (await PDFDocument.load(wmAr)).getPageCount() === 3);

  const wmMixed = await addWatermark(base, { type: 'text', text: 'سري CONFIDENTIAL', position: 'center', opacity: 0.2, unicodeFontBytes: FONT });
  const mixed = (await pageTexts(wmMixed))[0];
  t.check('M1-5 mixed Arabic + English watermark keeps both scripts', arabicCount(mixed) >= 2 && /CONFIDENTIAL|LAITNEDIFNOC/.test(mixed), mixed);

  const pnAr = await addPageNumbers(base, { position: 'bottom-center', format: 'صفحة {n} من {total}', unicodeFontBytes: FONT });
  const pnArTexts = await pageTexts(pnAr);
  t.check('M1-6 Arabic page numbers render Arabic text on every page', pnArTexts.every(s => arabicCount(s) >= 4), JSON.stringify(pnArTexts));
  t.check('M1-7 Arabic page numbers have no "?" and carry the numbers', pnArTexts.every((s, i) => !s.includes('?') && s.includes(String(i + 1)) && s.includes('3')), JSON.stringify(pnArTexts));

  // English must be unchanged: standard font, no Amiri embedded, same text
  const wmEn = await addWatermark(base, { type: 'text', text: 'DRAFT', position: 'center', opacity: 0.3 });
  t.check('M1-8 English watermark still works (no font bytes needed)', (await pageTexts(wmEn)).every(s => s.includes('DRAFT')));
  t.check('M1-9 English watermark does NOT embed the Arabic font', !has(wmEn, 'Amiri'));
  t.check('M1-10 Arabic watermark DOES embed the Arabic font', has(wmAr, 'Amiri'));
  const pnEn = await addPageNumbers(base, { position: 'bottom-center', format: 'Page {n} of {total}' });
  const pnEnTexts = await pageTexts(pnEn);
  t.check('M1-11 English page numbers unchanged ("Page N of 3")', pnEnTexts.every((s, i) => s.includes(`Page ${i + 1} of 3`)), JSON.stringify(pnEnTexts));
  t.check('M1-12 English page numbers do NOT embed the Arabic font', !has(pnEn, 'Amiri'));
  const pnFmt = await addPageNumbers(base, { position: 'bottom-right', format: '{n}/{total} - {n}', startNumber: 5 });
  t.check('M1-13 every {n}/{total} placeholder is replaced', (await pageTexts(pnFmt)).every((s, i) => s.includes(`${5 + i}/3 - ${5 + i}`)));

  // Characters no bundled font can draw must be an error, never "?"/boxes
  const cyr = await code(() => addWatermark(base, { type: 'text', text: 'Секретно', position: 'center', opacity: 0.3, unicodeFontBytes: FONT }));
  t.check('M1-14 unsupported script (Cyrillic) => clear UNSUPPORTED_CHARACTERS error', cyr.code === 'UNSUPPORTED_CHARACTERS' && !!cyr.ar, `${cyr.code} ${cyr.msg}`);
  const emoji = await code(() => addPageNumbers(base, { position: 'bottom-center', format: 'Page {n} 😀', unicodeFontBytes: FONT }));
  t.check('M1-15 emoji in page-number format => clear error', emoji.code === 'UNSUPPORTED_CHARACTERS', `${emoji.code} ${emoji.msg}`);
  const nofont = await code(() => addWatermark(base, { type: 'text', text: 'سري', position: 'center', opacity: 0.3 }));
  t.check('M1-16 Arabic text with the font unavailable => clear FONT_UNAVAILABLE error (no "?" output)', nofont.code === 'FONT_UNAVAILABLE', `${nofont.code} ${nofont.msg}`);

  // The browser path: the font is fetched from /fonts/Amiri-Regular.ttf.
  // A tiny static host stands in for the site; `fetch` resolves relative URLs against it.
  let hostMode: 'font' | 'spa-html' = 'spa-html';
  const host = http.createServer((req, res) => {
    if (req.url === '/fonts/Amiri-Regular.ttf' && hostMode === 'font') { res.writeHead(200, { 'Content-Type': 'font/ttf' }); return res.end(Buffer.from(FONT)); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><body>app shell</body></html>'); // SPA fallback answers 200 for a missing file
  });
  await new Promise<void>((r) => host.listen(0, '127.0.0.1', () => r()));
  const hostBase = `http://127.0.0.1:${(host.address() as any).port}`;
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = (u: any, i?: any) => realFetch(typeof u === 'string' && u.startsWith('/') ? hostBase + u : u, i);
  const spa = await code(() => addWatermark(base, { type: 'text', text: 'سري', position: 'center', opacity: 0.3 }));
  t.check('M1-17 site answers the font URL with an HTML page (missing file) => FONT_UNAVAILABLE, not a corrupt font', spa.code === 'FONT_UNAVAILABLE', `${spa.code} ${spa.msg}`);
  hostMode = 'font';
  const viaFetch = await addWatermark(base, { type: 'text', text: 'سري للغاية', position: 'center', opacity: 0.3 });
  t.check('M1-18 browser path: font fetched from /fonts and Arabic renders (no font bytes passed in)', (await pageTexts(viaFetch)).every(s => arabicCount(s) >= 5 && !s.includes('?')));
  hostMode = 'spa-html'; // proves the loaded font is cached: a second call must not need the network
  const cached = await addPageNumbers(base, { position: 'bottom-center', format: 'صفحة {n}' });
  t.check('M1-19 the fetched font is cached for later operations', (await pageTexts(cached)).every(s => arabicCount(s) >= 3));
  (globalThis as any).fetch = realFetch; host.close();

  // ================= M2: encrypted input =================
  const enc = await encrypted('pw12345');
  const ops: [string, () => Promise<any>][] = [
    ['addWatermark', () => addWatermark(enc, { type: 'text', text: 'DRAFT', position: 'center', opacity: 0.3 })],
    ['addPageNumbers', () => addPageNumbers(enc, { position: 'bottom-center', format: 'Page {n} of {total}' })],
    ['addSignatureToPdf', () => addSignatureToPdf(enc, { imageBytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')), pageIndex: 0, xPercent: 10, yPercent: 10, width: 50, height: 20 })],
    ['compressPdf', () => compressPdf(enc)],
    ['manipulatePages', () => manipulatePages(enc, [0], {})],
    ['manipulatePages (encrypted append)', () => manipulatePages(base, [0, 1], {}, [enc])],
    ['protectPdf (re-protecting)', () => protectPdf(enc, 'newpw')],
    ['loadPdfForEditing (merge/split path)', () => loadPdfForEditing(enc, 'locked.pdf')],
    ['assertPdfNotEncrypted (pdf.js paths)', () => assertPdfNotEncrypted(enc)],
  ];
  for (const [name, fn] of ops) {
    const r = await code(fn);
    t.check(`M2 ${name} refuses a protected PDF with the "unlock first" error`, r.code === PDF_ENCRYPTED_CODE && /unlock/i.test(r.msg), `${r.code} ${r.msg}`);
  }
  const named = await code(() => loadPdfForEditing(enc, 'locked.pdf'));
  t.check('M2 error names the offending file', named.msg.includes('locked.pdf') && (named.ar || '').includes('locked.pdf'));
  t.check('M2 error has an Arabic message telling the user to unlock first', /فك/.test(named.ar || ''), named.ar);

  // unprotected files are unaffected
  t.check('M2 plain PDFs still load through the guard', (await loadPdfForEditing(base)).getPageCount() === 3);
  t.check('M2 plain PDFs still compress', (await PDFDocument.load(await compressPdf(base))).getPageCount() === 3);

  // "unlock first" really works, then the operation succeeds with real content
  const unlocked = await unlockPdf(enc, 'pw12345');
  const wmAfter = await addWatermark(unlocked, { type: 'text', text: 'DRAFT', position: 'center', opacity: 0.3 });
  const afterTexts = await pageTexts(wmAfter);
  t.check('M2 unlock -> watermark succeeds and the watermark text is really in the output', afterTexts.every(s => s.includes('SECRET') && s.includes('DRAFT')), JSON.stringify(afterTexts));

  // owner-password-only PDFs (open without a password) can be unlocked with no password entered
  const ownerOnly = await encrypted('', 'owner-secret');
  const blocked = await code(() => addWatermark(ownerOnly, { type: 'text', text: 'X', position: 'center', opacity: 0.3 }));
  t.check('M2 owner-password-only PDF is also refused by editing tools', blocked.code === PDF_ENCRYPTED_CODE, `${blocked.code} ${blocked.msg}`);
  const ownerUnlocked = await unlockPdf(ownerOnly);
  t.check('M2 ...but Unlock works without typing a password (so "unlock first" is possible)', (await pageTexts(ownerUnlocked)).every(s => s.includes('SECRET')));
  const stillNeeds = await code(() => unlockPdf(enc));
  t.check('M2 a PDF that really needs a password still asks for one', /password/i.test(stillNeeds.msg) && stillNeeds.msg !== '<no error>', stillNeeds.msg);

  // ================= Split ranges =================
  const ok = (s: string, n: number) => JSON.stringify(parsePageRanges(s, n));
  t.check('S1 "1-3,5" on 5 pages => [0,1,2,4]', ok('1-3,5', 5) === '[0,1,2,4]');
  t.check('S2 whitespace is tolerated: " 2 - 3 , 5 "', ok(' 2 - 3 , 5 ', 5) === '[1,2,4]');
  t.check('S3 single page "4"', ok('4', 4) === '[3]');
  t.check('S4 order as typed is preserved ("5,1")', ok('5,1', 5) === '[4,0]');
  const bad: [string, number, string][] = [
    ['', 5, 'RANGE_EMPTY'], ['   ', 5, 'RANGE_EMPTY'],
    ['abc', 5, 'RANGE_INVALID'], ['1-', 5, 'RANGE_INVALID'], ['-3', 5, 'RANGE_INVALID'], ['1--3', 5, 'RANGE_INVALID'],
    ['1,,2', 5, 'RANGE_INVALID'], ['1,', 5, 'RANGE_INVALID'], ['0', 5, 'RANGE_INVALID'], ['0-2', 5, 'RANGE_INVALID'],
    ['5-3', 5, 'RANGE_INVALID'], ['1.5', 5, 'RANGE_INVALID'],
    ['9', 5, 'RANGE_OUT_OF_BOUNDS'], ['1-9', 5, 'RANGE_OUT_OF_BOUNDS'], ['3,6', 5, 'RANGE_OUT_OF_BOUNDS'],
  ];
  for (const [input, n, expected] of bad) {
    let got: any = null;
    try { parsePageRanges(input, n); } catch (e) { got = e; }
    t.check(`S5 invalid range ${JSON.stringify(input)} (${n} pages) => ${expected}, never page 1`, got instanceof LocalizedPdfError && got.code === expected && !!got.messageAr, got ? `${got.code}` : 'returned a result');
  }
  let msg = ''; try { parsePageRanges('9', 5); } catch (e: any) { msg = e.message; }
  t.check('S6 out-of-bounds message tells the real page count', msg.includes('5 pages'), msg);

  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
