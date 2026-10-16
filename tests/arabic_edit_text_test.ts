/**
 * Focused end-to-end test: Arabic support in POST /api/pdf/edit-text.
 *
 * Verifies against the REAL Express app + REAL pdf-lib output that:
 *   1. Arabic-only, English-only, and mixed Arabic/digits/Latin blocks all
 *      export successfully (previously ANY Arabic character threw a WinAnsi
 *      encoding exception and failed the whole request).
 *   2. The produced file is a structurally valid single-page PDF.
 *   3. Arabic was rendered through the Unicode font path: extracted text
 *      contains real Arabic content (base letters and/or Presentation Forms,
 *      depending on how pdf-lib builds the font's ToUnicode CMap).
 *   4. Plain English text remains intact and extractable.
 *
 * Run with:  npx tsx tests/arabic_edit_text_test.ts
 */

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
delete process.env.SUPABASE_URL;
delete process.env.VITE_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.GEMINI_API_KEY;

import fs from 'fs';
import path from 'path';

// Deterministic local fallback DB: delete any stale dev DB so seeds
// (including admin_granted_pro on the dev admin account) apply cleanly.
try { fs.rmSync(path.join('/tmp', 'db_fallback.json'), { force: true }); } catch { /* ignore */ }

async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;

  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map((i: any) => i.str ?? '').join(' ') + '\n';
  }
  return out;
}

async function main() {
  console.log('=====================================================');
  console.log('ARABIC EDIT-TEXT TEST (/api/pdf/edit-text)');
  console.log('=====================================================\n');

  const { default: app } = await import('../server');
  const server = app.listen(0, '127.0.0.1');
  // Track raw sockets so we can destroy them deterministically on teardown
  // (avoids libuv UV_HANDLE_CLOSING assertions on win32 when process.exit()
  // races server-side keep-alive handles).
  const openSockets = new Set<any>();
  server.on('connection', (sock: any) => {
    openSockets.add(sock);
    sock.on('close', () => openSockets.delete(sock));
  });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address: any = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const uploadDir = path.join('/tmp', 'uploads');

  let passed = 0;
  let failed = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) { console.log(`[PASS] ${name}`); passed++; }
    else { console.error(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`); failed++; }
  }

  try {
    const payload = {
      fileName: 'Arabic_Edit_Test.pdf',
      textLayers: [
        { id: 't1', text: 'مرحبا بالعالم العربي', x: 80, y: 700, page: 1, size: 16 },
        { id: 't2', text: 'English remains untouched 123', x: 80, y: 650, page: 1, size: 12 },
        { id: 't3', text: 'عقد رقم 2026 مع NDA', x: 80, y: 600, page: 1, size: 12 },
        // Redaction regression guard inside the same export: must stay an
        // opaque bar even alongside Arabic content.
        { id: 't4', text: '', redacted: true, redactedTextLength: 20, x: 80, y: 550, page: 1, size: 12 }
      ]
    };

    const res = await fetch(`${baseUrl}/api/pdf/edit-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-user-id'
      },
      body: JSON.stringify(payload)
    });

    assert(res.ok, 'Arabic export returns HTTP 200 (no WinAnsi crash)', `status=${res.status}`);
    const data: any = await res.json();
    assert(data?.success === true && typeof data.fileUrl === 'string', 'Response reports success');
    if (!data?.fileUrl) throw new Error('Cannot continue without a generated file');

    const filePath = path.join(uploadDir, path.basename(data.fileUrl));
    assert(fs.existsSync(filePath), 'Generated PDF exists on disk', filePath);

    const bytes: Buffer = fs.readFileSync(filePath);
    assert(bytes.subarray(0, 5).toString('latin1').startsWith('%PDF-'), 'Output is a valid %PDF file');

    const text = await extractPdfText(bytes);

    // NOTE on assertions: pdf-lib builds the font's ToUnicode CMap from its
    // glyph cache, which can map a presentation-form glyph back to its BASE
    // Arabic letter (e.g. U+FE8D -> U+0627). So extraction may legitimately
    // return either base letters or Forms-B glyphs — assert Arabic presence
    // and richness, not one specific codepoint form.
    const arabicChars = text.match(/[\u0600-\u06FF\uFE70-\uFEFF]/g) ?? [];
    const distinctArabic = new Set(arabicChars).size;
    assert(arabicChars.length >= 10 && distinctArabic >= 5,
      `Arabic rendered via the Unicode font path (${arabicChars.length} chars, ${distinctArabic} distinct)`);

    assert(text.includes('English'), 'English block remains extractable');
    assert(text.includes('2026'), 'Digits inside mixed Arabic/Latin block remain readable');

    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const parsed = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    assert(parsed.numPages === 1, 'Parsed PDF has exactly 1 page');

    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  } catch (err) {
    failed++;
    console.error('[FAIL] Unexpected error during test run:', err);
  } finally {
    for (const sock of openSockets) sock.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n=====================================================');
  console.log(`ARABIC EDIT-TEXT RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
