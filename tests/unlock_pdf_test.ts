/**
 * Focused unit test: unlockPdf safety (phase-2 hardening item #8).
 *
 * Verifies against the REAL src/lib/pdfOperations implementation that:
 *   1. An encrypted PDF opened WITHOUT a password fails with a clear error
 *      instead of silently producing a corrupt output file.
 *   2. A WRONG password also fails clearly.
 *   3. The CORRECT password unlocks the document and produces a valid,
 *      unencrypted, parseable PDF.
 *   4. Unencrypted documents continue to work exactly as before.
 *
 * Run with:  npx tsx tests/unlock_pdf_test.ts
 */

import { unlockPdf, protectPdf } from '../src/lib/pdfOperations';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

async function makeEncryptedFixture(password: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('TOP SECRET FIXTURE', { x: 20, y: 150, size: 12, font });
  await (doc as any).encrypt({ userPassword: password, ownerPassword: password });
  return await doc.save();
}

async function makePlainFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('PLAIN FIXTURE', { x: 20, y: 150, size: 12, font });
  return await doc.save();
}

async function main() {
  console.log('=====================================================');
  console.log('UNLOCK PDF SAFETY TEST (src/lib/pdfOperations.unlockPdf)');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) { console.log(`[PASS] ${name}`); passed++; }
    else { console.error(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`); failed++; }
  }

  try {
    const PASSWORD = 'Correct-Horse-9';

    // 1) Encrypted + no password → must throw, not corrupt.
    const encBytes = await makeEncryptedFixture(PASSWORD);
    let threwNoPw: any = null;
    try { await unlockPdf(encBytes); } catch (e: any) { threwNoPw = e; }
    assert(!!threwNoPw && /password|protect|decrypt/i.test(threwNoPw.message),
      'Encrypted PDF without password → clear error (no corrupt output)',
      threwNoPw?.message);

    // 2) Wrong password → clear error.
    let threwWrongPw: any = null;
    try { await unlockPdf(encBytes, 'wrong-pass'); } catch (e: any) { threwWrongPw = e; }
    assert(!!threwWrongPw && /password|decrypt/i.test(threwWrongPw.message),
      'Wrong password → clear "incorrect password" error',
      threwWrongPw?.message);

    // 3) Correct password → valid decrypted output.
    const unlocked = await unlockPdf(encBytes, PASSWORD);
    const reparsed = await PDFDocument.load(unlocked, {});
    assert(reparsed.getPageCount() === 1 && (reparsed as any).isEncrypted !== true,
      'Correct password yields a valid, unencrypted single-page PDF');

    // 4) Plain (unencrypted) file keeps working with and without a password arg.
    const plain = await makePlainFixture();
    const out1 = await unlockPdf(plain);
    const out2 = await unlockPdf(plain, 'ignored-for-plain-files');
    assert(out1.byteLength > 0 && out2.byteLength > 0, 'Unencrypted documents still process normally');
  } catch (err) {
    failed++;
    console.error('[FAIL] Unexpected error during test run:', err);
  }

  console.log('\n=====================================================');
  console.log(`UNLOCK PDF RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
