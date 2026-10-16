/**
 * Focused end-to-end test: daily export quota enforcement on
 * POST /api/pdf/edit-text (phase-2 hardening item #3).
 *
 * Verifies against the REAL Express app that:
 *   1. A malformed request (missing textLayers) is rejected with 400 and does
 *      NOT consume quota.
 *   2. A free-tier user can complete exactly 3 successful exports (the same
 *      atomic 3/day allowance as /api/pdf/upload).
 *   3. The 4th and 5th attempts are rejected with 403.
 *   4. A Pro user is unaffected by the free cap.
 *
 * Run with:  npx tsx tests/edit_text_quota_test.ts
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

// Start from a clean local fallback DB so the free user's counters are at
// zero regardless of test order. This file only exists when running the app
// in dev/test mode without Supabase.
const DB_FILE = path.join('/tmp', 'db_fallback.json');
try { fs.rmSync(DB_FILE, { force: true }); } catch { /* ignore */ }

async function main() {
  console.log('=====================================================');
  console.log('EDIT-TEXT EXPORT QUOTA TEST (/api/pdf/edit-text)');
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

  // demo-user-id is seeded (outside production) with plan 'free'.
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer demo-user-id' };
  const validPayload = {
    fileName: 'Quota_Test.pdf',
    textLayers: [{ id: 't1', text: 'Hello quota', x: 80, y: 700, page: 1, size: 12 }]
  };

  let passed = 0;
  let failed = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) { console.log(`[PASS] ${name}`); passed++; }
    else { console.error(`[FAIL] ${name}${detail ? ' - ' + detail : ''}`); failed++; }
  }

  try {
    // 1) Malformed request must not burn quota.
    const bad = await fetch(`${baseUrl}/api/pdf/edit-text`, {
      method: 'POST', headers: auth, body: JSON.stringify({ fileName: 'x.pdf' })
    });
    assert(bad.status === 400, 'Malformed request rejected with 400 before any quota is consumed', `status=${bad.status}`);

    // 2)+3) Three successes, then two rejections.
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/api/pdf/edit-text`, {
        method: 'POST', headers: auth, body: JSON.stringify(validPayload)
      });
      if (i <= 3) {
        assert(res.ok, `Export #${i} succeeds within the free daily allowance`, `status=${res.status}`);
        if (res.ok) {
          const data: any = await res.json();
          const p = path.join(uploadDir, path.basename(String(data.fileUrl || '')));
          if (p !== uploadDir) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
        }
      } else {
        assert(res.status === 403, `Export #${i} blocked with 403 (daily limit exceeded)`, `status=${res.status}`);
      }
    }

    // 4) Pro user unaffected — admin-user-id is seeded with plan 'pro'.
    const proRes = await fetch(`${baseUrl}/api/pdf/edit-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-user-id' },
      body: JSON.stringify(validPayload)
    });
    assert(proRes.ok, 'Pro user can still export after the free limit would be exhausted', `status=${proRes.status}`);
    if (proRes.ok) {
      const d: any = await proRes.json();
      const p = path.join(uploadDir, path.basename(String(d.fileUrl || '')));
      if (p !== uploadDir) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
    }
  } catch (err) {
    failed++;
    console.error('[FAIL] Unexpected error during test run:', err);
  } finally {
    for (const sock of openSockets) sock.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n=====================================================');
  console.log(`EDIT-TEXT QUOTA RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
