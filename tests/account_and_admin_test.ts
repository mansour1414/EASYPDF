/**
 * H1 (real self-service account deletion) and H4 (real admin ban/unban +
 * admin delete) regressions. Runs the REAL server.ts (production mode)
 * against local Supabase Auth/PostgREST/Storage test doubles.
 *
 * Note: Supabase's admin API (deleteUser/updateUserById) validates that the
 * user id is a real UUID before even sending the request, so every user id
 * used here that goes through those calls must be a real UUID (not the
 * short ids like "u1" used in the other test files).
 */
import crypto from 'crypto';
import { boot, makeRunner } from './support/harness';

async function main() {
  const t = makeRunner('ACCOUNT DELETION (H1) + ADMIN BAN/DELETE (H4)');
  const h = await boot();
  const { supa, call } = h;

  const uid = () => crypto.randomUUID();

  // ===================== Self-service account deletion =====================
  const alice = uid();
  supa.addUser(alice, { email: 'alice@test.dev' });
  supa.subs.push({ user_id: alice, status: 'active' });
  await h.call('/api/pdf/upload', {}); // (no-op placeholder call kept out of the way)

  // Seed some storage objects under alice's own prefixes, the exact shape
  // the real upload/edit-text routes use (pdfs/{userId}/..., edited/{userId}/...).
  supa.storedObjects.push(`/storage/v1/object/documents/pdfs/${alice}/a.pdf`, `/storage/v1/object/documents/edited/${alice}/b.pdf`);

  let r = await call('/api/user/account', { token: `tok:${alice}`, method: 'DELETE', body: {} });
  t.check('1  missing confirmation => 400, nothing changed', r.status === 400 && supa.users.has(alice), `${r.status}`);

  r = await call('/api/user/account', { token: `tok:${alice}`, method: 'DELETE', body: { confirm: 'delete' } });
  t.check('2  wrong-case confirmation string => 400 (must be exact)', r.status === 400 && supa.users.has(alice), `${r.status}`);

  r = await call('/api/user/account', { token: `tok:${alice}`, method: 'DELETE', body: { confirm: 'DELETE' } });
  t.check('3  correct confirmation => 200 success', r.status === 200 && r.json.success === true, `${r.status} ${JSON.stringify(r.json)}`);
  t.check('4  users row actually removed', !supa.users.has(alice));
  t.check('5  subscriptions rows actually removed', !supa.subs.some((s) => s.user_id === alice));
  t.check('6  storage objects under both prefixes removed', !supa.storedObjects.some((p) => p.includes(`/${alice}/`)), JSON.stringify(supa.storedObjects));
  t.check('7  the auth identity was actually deleted (GoTrue)', supa.deletedUserIds.has(alice));

  r = await call('/api/user/me', { token: `tok:${alice}` });
  t.check('8  the deleted account\'s own token no longer authenticates', r.status === 401, `${r.status}`);

  // ---- Partial failure: never claim full success ----
  const bob = uid();
  supa.addUser(bob, { email: 'bob@test.dev' });
  supa.failUsersDelete = true;
  r = await call('/api/user/account', { token: `tok:${bob}`, method: 'DELETE', body: { confirm: 'DELETE' } });
  t.check('9  a failed DB delete => 500, not a fake success', r.status === 500 && r.json.success !== true, `${r.status} ${JSON.stringify(r.json)}`);
  t.check('10 the steps are reported so the failure is visible, not hidden', Array.isArray(r.json.steps) && r.json.steps.some((s: any) => s.step === 'table:users' && s.ok === false), JSON.stringify(r.json.steps));
  supa.failUsersDelete = false;
  r = await call('/api/user/me', { token: `tok:${bob}` });
  t.check('11 a partially-failed deletion leaves the account usable (not half-deleted-but-broken)', r.status === 200, `${r.status}`);

  // ===================== Admin: ban / unban =====================
  const admin = uid();
  supa.addUser(admin, { email: 'admin@test.dev', is_admin: true });
  const carol = uid();
  supa.addUser(carol, { email: 'carol@test.dev' });

  r = await call(`/api/admin/users/${carol}/ban`, { token: `tok:${carol}`, method: 'POST', body: { action: 'ban' } });
  t.check('12 a non-admin cannot ban anyone', r.status === 403, `${r.status}`);

  r = await call(`/api/admin/users/${admin}/ban`, { token: `tok:${admin}`, method: 'POST', body: { action: 'ban' } });
  t.check('13 an admin cannot ban their own account', r.status === 400, `${r.status}`);

  r = await call(`/api/admin/users/${carol}/ban`, { token: `tok:${admin}`, method: 'POST', body: { action: 'nonsense' } });
  t.check('14 an invalid action is rejected', r.status === 400, `${r.status}`);

  r = await call(`/api/admin/users/${carol}/ban`, { token: `tok:${admin}`, method: 'POST', body: { action: 'ban' } });
  t.check('15 banning carol succeeds', r.status === 200 && r.json.banned === true, `${r.status} ${JSON.stringify(r.json)}`);
  t.check('16 ban_duration was really set in Supabase Auth (far future)', !!supa.bannedUntil.get(carol) && new Date(supa.bannedUntil.get(carol)!).getTime() > Date.now() + 1000 * 3600 * 24 * 365, supa.bannedUntil.get(carol));

  r = await call('/api/admin/users', { token: `tok:${admin}` });
  const carolRow = (r.json as any[]).find((u) => u.id === carol);
  t.check('17 the admin users listing reflects the real ban status', carolRow?.banned === true, JSON.stringify(carolRow));

  r = await call(`/api/admin/users/${carol}/ban`, { token: `tok:${admin}`, method: 'POST', body: { action: 'unban' } });
  t.check('18 unbanning carol succeeds', r.status === 200 && r.json.banned === false, `${r.status}`);
  t.check('19 ban_duration was really cleared', !supa.bannedUntil.has(carol));

  // ===================== Admin: delete another user =====================
  const dave = uid();
  supa.addUser(dave, { email: 'dave@test.dev' });

  r = await call(`/api/admin/users/${dave}`, { token: `tok:${carol}`, method: 'DELETE', body: { confirmEmail: 'dave@test.dev' } });
  t.check('20 a non-admin cannot delete anyone', r.status === 403, `${r.status}`);

  r = await call(`/api/admin/users/${admin}`, { token: `tok:${admin}`, method: 'DELETE', body: { confirmEmail: 'admin@test.dev' } });
  t.check('21 an admin cannot delete themselves via the admin route', r.status === 400 && supa.users.has(admin), `${r.status}`);

  r = await call(`/api/admin/users/${dave}`, { token: `tok:${admin}`, method: 'DELETE', body: { confirmEmail: 'wrong@test.dev' } });
  t.check('22 wrong confirmation email => 400, nothing changed, and the real email is hinted', r.status === 400 && supa.users.has(dave) && r.json.expectedEmail === 'dave@test.dev', `${r.status} ${JSON.stringify(r.json)}`);

  r = await call(`/api/admin/users/${uid()}`, { token: `tok:${admin}`, method: 'DELETE', body: { confirmEmail: 'nobody@test.dev' } });
  t.check('23 deleting a non-existent user => 404', r.status === 404, `${r.status}`);

  r = await call(`/api/admin/users/${dave}`, { token: `tok:${admin}`, method: 'DELETE', body: { confirmEmail: 'DAVE@TEST.DEV' } });
  t.check('24 confirmation email match is case-insensitive', r.status === 200 && r.json.success === true, `${r.status} ${JSON.stringify(r.json)}`);
  t.check('25 dave is really gone (users row + auth identity)', !supa.users.has(dave) && supa.deletedUserIds.has(dave));

  h.close();
  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
