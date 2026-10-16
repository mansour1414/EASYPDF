/**
 * Focused end-to-end test for Smart Redaction enforcement in
 * POST /api/pdf/edit-text (server.ts).
 *
 * What it verifies, against the REAL Express app + REAL pdf-lib output:
 *   1. A block flagged `redacted` whose text was stripped by the client
 *      (text: '' + a length hint) is rendered as an opaque bar and the
 *      original string appears NOWHERE in the extracted text layer.
 *   2. A malicious/naive client that sends `redacted: true` WITH the full
 *      original text still gets the text stripped server-side — the string
 *      must not appear in the output (server-side enforcement).
 *   3. Non-redacted blocks are rendered normally and remain extractable.
 *   4. The produced file is a structurally valid single-page PDF.
 *
 * Run with:  npx tsx tests/redaction_test.ts
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

const SECRET_A = 'TOP-SECRET-ALPHA-7788-CLEARANCE';
const SECRET_B = 'CLASSIFIED-BRAVO-PIN-9911';

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
  console.log('====================================================');
  console.log('SMART REDACTION ENFORCEMENT TEST (/api/pdf/edit-text)');
  console.log('====================================================\n');

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

  // Mirror server.ts's writable-root logic: with VERCEL=1 the writable root
  // is '/tmp', so dev-fallback files land in <cwd-drive>:/tmp/uploads.
  const uploadDir = path.join('/tmp', 'uploads');

  let passed = 0;
  let failed = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) { console.log(`[PASS] ${name}`); passed++; }
    else { console.error(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`); failed++; }
  }

  try {
    const payload = {
      fileName: 'Redaction_Test.pdf',
      textLayers: [
        // Scenario 1: honest client — text stripped before sending.
        { id: 't1', text: '', redacted: true, redactedTextLength: SECRET_A.length, x: 80, y: 700, page: 1, size: 16 },
        // Scenario 2: naive/malicious client — flag set but full secret text included.
        { id: 't2', text: SECRET_B, redacted: true, x: 80, y: 640, page: 1, size: 12 },
        // Scenario 3: normal public text that must remain untouched.
        { id: 't3', text: 'PUBLIC-VISIBLE-LINE-OK', x: 80, y: 580, page: 1, size: 12 }
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

    assert(res.ok, 'POST /api/pdf/edit-text returns 200', `status=${res.status}`);
    const data: any = await res.json();
    assert(data?.success === true && typeof data.fileUrl === 'string' && data.fileUrl.startsWith('/uploads/'),
      'Response reports success with a dev-fallback /uploads URL', JSON.stringify(data));
    if (!data?.fileUrl) throw new Error('Cannot continue without a generated file');

    const fileName = path.basename(data.fileUrl);
    const filePath = path.join(uploadDir, fileName);
    assert(fs.existsSync(filePath), 'Generated PDF exists on disk', filePath);

    const bytes: Buffer = fs.readFileSync(filePath);
    assert(bytes.subarray(0, 5).toString('latin1').startsWith('%PDF-'), 'Output is a valid %PDF file');

    const text = await extractPdfText(bytes);

    assert(!text.includes(SECRET_A), 'Scenario 1: stripped redacted secret NOT present as extractable text');
    assert(!text.includes(SECRET_B), 'Scenario 2: server strips text of redacted blocks sent by a non-compliant client');
    assert(text.includes('PUBLIC-VISIBLE-LINE-OK'), 'Scenario 3: non-redacted text remains normally extractable');

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

  console.log('\n====================================================');
  console.log(`REDACTION TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
