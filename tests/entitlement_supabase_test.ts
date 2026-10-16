/**
 * H5 regression: Supabase is the authoritative source of Pro entitlement.
 * Runs the REAL server.ts (production mode) against local Supabase test doubles.
 *
 * Run with:  npx tsx tests/entitlement_supabase_test.ts
 */
import fs from 'fs';
import { boot, makeRunner } from './support/harness';

async function main() {
  const t = makeRunner('ENTITLEMENT: SUPABASE IS AUTHORITATIVE (H5)');

  // Seed a STALE per-instance cache that says "Pro", exactly what a warm
  // serverless instance could hold after an admin revoked Pro elsewhere.
  const stale = {
    users: [{ id: 'u-stale', email: 'stale@test.dev', plan: 'pro', admin_granted_pro: true, created_at: new Date().toISOString(), uploads_count_today: 0, ai_count_today: 0, last_usage_reset_date: new Date().toISOString().split('T')[0] }],
    subscriptions: [{ id: 's1', user_id: 'u-stale', stripe_subscription_id: 'sub_stale', status: 'active', created_at: new Date().toISOString() }],
    files: [],
  };
  fs.writeFileSync('/tmp/db_fallback.json', JSON.stringify(stale));

  const h = await boot();
  const { supa, call } = h;

  // ---- A. stale local Pro must NOT grant Pro and must not be written back ----
  supa.addUser('u-stale', { plan: 'free', admin_granted_pro: false });
  let r = await call('/api/user/me', { token: 'tok:u-stale' });
  t.check('A1 stale local admin_granted_pro/active-sub does not grant Pro (Supabase says free)', r.status === 200 && r.json.plan === 'free', JSON.stringify(r.json));
  t.check("A2 stale cache never writes plan='pro' back to Supabase", !supa.writes.some(w => w.method === 'PATCH' && w.body?.plan === 'pro'), JSON.stringify(supa.writes));

  // ---- B. Supabase grant -> Pro; revoke -> Free immediately ----
  supa.addUser('u-admin-pro', { admin_granted_pro: true, plan: 'free' });
  r = await call('/api/user/me', { token: 'tok:u-admin-pro' });
  t.check('B1 admin_granted_pro in Supabase => Pro', r.status === 200 && r.json.plan === 'pro', JSON.stringify(r.json));
  supa.users.get('u-admin-pro')!.admin_granted_pro = false;
  r = await call('/api/user/me', { token: 'tok:u-admin-pro' });
  t.check('B2 revocation in Supabase takes effect on the very next request', r.status === 200 && r.json.plan === 'free', JSON.stringify(r.json));
  t.check("B3 plan column is re-synced from Supabase-derived entitlement ('free')", supa.users.get('u-admin-pro')!.plan === 'free');

  // ---- C. Stripe subscription status from Supabase ----
  supa.addUser('u-sub');
  supa.subs.push({ user_id: 'u-sub', status: 'active' });
  r = await call('/api/user/me', { token: 'tok:u-sub' });
  t.check('C1 active subscription in Supabase => Pro', r.json.plan === 'pro', JSON.stringify(r.json));
  supa.subs[0].status = 'canceled';
  r = await call('/api/user/me', { token: 'tok:u-sub' });
  t.check('C2 canceled subscription in Supabase => Free (no stale grant)', r.json.plan === 'free', JSON.stringify(r.json));

  // ---- D. Supabase failure => fail closed (503), never a guess ----
  supa.addUser('u-fail', { plan: 'pro', admin_granted_pro: true });
  const writesBefore = supa.writes.length;
  supa.failUsersRead = true;
  r = await call('/api/user/me', { token: 'tok:u-fail' });
  t.check('D1 users lookup failure => 503 on /api/user/me', r.status === 503, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call('/api/summarize', { token: 'tok:u-fail', body: { text: 'hello world' } });
  t.check('D2 users lookup failure => 503 on /api/summarize (no AI call, no fake plan)', r.status === 503, `${r.status}`);
  r = await call('/api/pdf/ocr', { token: 'tok:u-fail', body: { imageBase64: 'aGk=' } });
  t.check('D3 users lookup failure => 503 on /api/pdf/ocr', r.status === 503, `${r.status}`);
  r = await call('/api/copilot/command', { token: 'tok:u-fail', body: { message: 'hi', textLayers: [], imageFilters: {} } });
  t.check('D4 users lookup failure => 503 on /api/copilot/command', r.status === 503, `${r.status}`);
  const up = await fetch(h.base + '/api/pdf/upload', { method: 'POST', headers: { Authorization: 'Bearer tok:u-fail' }, body: (() => { const f = new FormData(); f.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], { type: 'application/pdf' }), 'a.pdf'); return f; })() });
  t.check('D5 users lookup failure => 503 on /api/pdf/upload (no unhandled rejection)', up.status === 503, `${up.status}`);
  t.check('D6 no plan column overwrite happened during the outage', supa.writes.length === writesBefore, JSON.stringify(supa.writes.slice(writesBefore)));
  t.check("D7 error text does not leak internals", !JSON.stringify(r.json).includes('simulated'));
  supa.failUsersRead = false;

  supa.failSubsRead = true;
  r = await call('/api/user/me', { token: 'tok:u-fail' });
  t.check('D8 subscriptions lookup failure => 503', r.status === 503, `${r.status}`);
  supa.failSubsRead = false;
  r = await call('/api/user/me', { token: 'tok:u-fail' });
  t.check('D9 recovers to the real Pro state after the outage', r.status === 200 && r.json.plan === 'pro', JSON.stringify(r.json));

  // ---- E. missing users row is created with the VERIFIED auth email ----
  r = await call('/api/user/me', { token: 'tok:u-new' });
  const inserted = supa.writes.find(w => w.method === 'POST');
  t.check('E1 new user => Free', r.status === 200 && r.json.plan === 'free', JSON.stringify(r.json));
  t.check('E2 auto-created row uses the verified auth email, not a placeholder', inserted?.body?.[0]?.email === 'u-new@test.dev', JSON.stringify(inserted?.body));

  // ---- F. admin update-plan must report real save failures ----
  supa.addUser('u-admin', { is_admin: true });
  supa.addUser('u-target');
  r = await call('/api/admin/update-plan', { token: 'tok:u-admin', body: { userId: 'u-target', plan: 'pro' } });
  t.check('F1 update-plan saves admin_granted_pro and returns pro', r.status === 200 && r.json.user?.plan === 'pro' && supa.users.get('u-target')!.admin_granted_pro === true, JSON.stringify(r.json));
  r = await call('/api/admin/update-plan', { token: 'tok:u-admin', body: { userId: 'nobody', plan: 'pro' } });
  t.check('F2 update-plan for a non-existent user => 404, not fake success', r.status === 404, `${r.status} ${JSON.stringify(r.json)}`);
  supa.failUserPatch = true;
  r = await call('/api/admin/update-plan', { token: 'tok:u-admin', body: { userId: 'u-target', plan: 'free' } });
  t.check('F3 update-plan DB write failure => 500, not success:true', r.status === 500 && r.json.success !== true, `${r.status} ${JSON.stringify(r.json)}`);
  supa.failUserPatch = false;
  r = await call('/api/user/me', { token: 'tok:u-target' });
  t.check('F4 a failed revoke did not change entitlement', r.json.plan === 'pro', JSON.stringify(r.json));
  r = await call('/api/admin/update-plan', { token: 'tok:u-target', body: { userId: 'u-target', plan: 'free' } });
  t.check('F5 non-admin cannot call update-plan', r.status === 403, `${r.status}`);

  h.close();
  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
