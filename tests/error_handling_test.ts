/**
 * M5 regression: malformed JSON => 400, oversized JSON => 413, real bugs => 500
 * (generic, no leaked internals). Also a smoke test that multipart upload still
 * works after the multer/express/qs security updates.
 *
 * Run with:  npx tsx tests/error_handling_test.ts
 */
import { boot, makeRunner } from './support/harness';

async function main() {
  const t = makeRunner('ERROR HANDLING (M5) + UPLOAD SMOKE TEST AFTER DEPENDENCY UPDATE');
  const h = await boot();
  const { supa, call } = h;
  supa.addUser('u1');

  // ---- body-parser errors ----
  let r = await fetch(h.base + '/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  let j: any = await r.json();
  t.check('1 malformed JSON => 400', r.status === 400 && /invalid json/i.test(j.error), `${r.status} ${JSON.stringify(j)}`);

  r = await fetch(h.base + '/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(6 * 1024 * 1024) }) });
  j = await r.json();
  t.check('2 JSON larger than the limit => 413', r.status === 413 && /too large/i.test(j.error), `${r.status} ${JSON.stringify(j)}`);

  const big = await call('/api/summarize', { token: 'tok:u1', body: { text: 'a'.repeat(1000) } });
  t.check('3 a normal request is unaffected by the new handler', big.status === 200 || big.status === 502 || big.status === 403, `${big.status}`);

  // ---- other statuses keep their meaning ----
  r = await fetch(h.base + '/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  t.check('4 missing auth still => 401', r.status === 401, `${r.status}`);
  r = await fetch(h.base + '/api/does-not-exist');
  t.check('5 unknown API route still => 404', r.status === 404, `${r.status}`);

  // ---- unexpected errors stay 500 and never leak ----
  const mod: any = await import('../server');
  const generic = mod.resolveErrorResponse(new Error('db password is hunter2 at /srv/app/secret.ts'));
  t.check('6 unexpected error => 500', generic.status === 500, `${generic.status}`);
  t.check('7 500 body is generic (no internals leaked)', !JSON.stringify(generic.body).includes('hunter2') && !JSON.stringify(generic.body).includes('/srv/'), JSON.stringify(generic.body));
  const ent = mod.resolveErrorResponse(new mod.EntitlementLookupError('x'));
  t.check('8 entitlement lookup failure => 503', ent.status === 503, `${ent.status}`);
  const weird = mod.resolveErrorResponse({ type: 'something.else', status: 418, message: 'teapot' });
  t.check('9 unknown error shapes never become 4xx with raw messages', weird.status === 500 && !JSON.stringify(weird.body).includes('teapot'));

  // ---- multipart upload smoke test (multer 2.x) ----
  const form = (name: string, type: string, bytes: Buffer) => { const f = new FormData(); f.append('file', new Blob([bytes], { type }), name); return f; };
  r = await fetch(h.base + '/api/pdf/upload', { method: 'POST', headers: { Authorization: 'Bearer tok:u1' }, body: form('ok.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')) });
  j = await r.json();
  t.check('10 valid PDF upload => 200 with a stored object', r.status === 200 && j.success === true && supa.storedObjects.length === 1, `${r.status} ${JSON.stringify(j)}`);
  t.check('11 upload consumed exactly one UPLOAD credit', supa.users.get('u1')!.uploads_count_today === 1, `${supa.users.get('u1')!.uploads_count_today}`);
  r = await fetch(h.base + '/api/pdf/upload', { method: 'POST', headers: { Authorization: 'Bearer tok:u1' }, body: form('x.exe', 'application/x-msdownload', Buffer.from('MZ')) });
  t.check('12 non-PDF upload is rejected with a 4xx', r.status >= 400 && r.status < 500, `${r.status}`);
  t.check('13 rejected upload consumed no credit', supa.users.get('u1')!.uploads_count_today === 1);

  h.close();
  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
