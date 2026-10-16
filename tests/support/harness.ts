/**
 * Test doubles for the production-hardening regression tests.
 *
 * IMPORTANT: these are LOCAL TEST DOUBLES that speak just enough of the
 * Supabase (PostgREST + GoTrue) and Gemini HTTP protocols for the REAL
 * server.ts code (and the real supabase-js / @google/genai clients) to run
 * against them. They verify our server's logic. They do NOT verify anything
 * about the live Supabase project, live Gemini, RLS, or SQL grants.
 */
import http from 'http';
import type { AddressInfo } from 'net';

export type Row = Record<string, any>;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

const today = () => new Date().toISOString().split('T')[0];

/** Minimal in-memory Supabase (auth + PostgREST + the two RPCs the server uses). */
export class FakeSupabase {
  users = new Map<string, Row>();
  subs: Row[] = [];
  failUsersRead = false;
  failSubsRead = false;
  failUserPatch = false;
  writes: { table: string; method: string; body: any }[] = [];
  rpcCalls: { name: string; args: any }[] = [];
  storedObjects: string[] = [];
  bannedUntil = new Map<string, string>(); // userId -> ISO date string (far future = banned)
  deletedUserIds = new Set<string>();
  failAuthDeleteUser = false;
  failUsersDelete = false;
  server!: http.Server;
  url = '';

  addUser(id: string, patch: Row = {}) {
    this.users.set(id, {
      id,
      email: `${id}@test.dev`,
      plan: 'free',
      admin_granted_pro: false,
      is_admin: false,
      uploads_count_today: 0,
      ai_count_today: 0,
      last_usage_reset_date: today(),
      created_at: new Date().toISOString(),
      ...patch,
    });
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
      const u = new URL(req.url || '/', 'http://x');
      const body = await readBody(req);
      const send = (status: number, obj?: any) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(obj === undefined ? '' : JSON.stringify(obj));
      };
      const eq = (k: string) => (u.searchParams.get(k) || '').replace(/^eq\./, '');

      // ---- GoTrue: token verification. Token format: "tok:<userId>"
      if (u.pathname === '/auth/v1/user') {
        const tok = (req.headers.authorization || '').replace('Bearer ', '');
        if (!tok.startsWith('tok:')) return send(401, { msg: 'invalid token' });
        const id = tok.slice(4);
        if (this.deletedUserIds.has(id)) return send(401, { msg: 'User not found' });
        return send(200, { id, aud: 'authenticated', role: 'authenticated', email: this.users.get(id)?.email || `${id}@test.dev`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
      }

      // ---- RPCs
      if (u.pathname === '/rest/v1/rpc/check_rate_limit') {
        return send(200, [{ allowed: true, retry_after_seconds: 0 }]);
      }
      if (u.pathname === '/rest/v1/rpc/increment_daily_quota') {
        const a = JSON.parse(body || '{}');
        this.rpcCalls.push({ name: 'increment_daily_quota', args: a });
        const row = this.users.get(a.p_user_id);
        if (!row) return send(400, { message: 'user not found' });
        if (row.last_usage_reset_date !== today()) {
          row.uploads_count_today = 0; row.ai_count_today = 0; row.last_usage_reset_date = today();
        }
        const key = a.p_counter_type === 'ai' ? 'ai_count_today' : 'uploads_count_today';
        if (!a.p_is_pro && row[key] >= a.p_free_limit) {
          return send(200, [{ allowed: false, ai_count_today: row.ai_count_today, uploads_count_today: row.uploads_count_today }]);
        }
        row[key] += 1;
        return send(200, [{ allowed: true, ai_count_today: row.ai_count_today, uploads_count_today: row.uploads_count_today }]);
      }

      // ---- PostgREST tables
      const table = u.pathname.replace('/rest/v1/', '');
      const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');

      if (req.method === 'GET' && table === 'users') {
        if (this.failUsersRead) return send(500, { message: 'simulated users outage', code: 'XX000' });
        const id = eq('id');
        const rows = id ? [this.users.get(id)].filter(Boolean) : [...this.users.values()];
        if (wantsObject) return rows.length === 1 ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'no rows' });
        return send(200, rows);
      }
      if (req.method === 'GET' && table === 'subscriptions') {
        if (this.failSubsRead) return send(500, { message: 'simulated subscriptions outage', code: 'XX000' });
        const uid = eq('user_id');
        return send(200, this.subs.filter((s) => !uid || s.user_id === uid));
      }
      if (req.method === 'PATCH' && table === 'users') {
        const patch = JSON.parse(body || '{}');
        this.writes.push({ table, method: 'PATCH', body: patch });
        if (this.failUserPatch) return send(500, { message: 'simulated write failure', code: 'XX000' });
        const row = this.users.get(eq('id'));
        if (!row) return String(req.headers.prefer || '').includes('representation') ? send(200, []) : send(204);
        Object.assign(row, patch);
        return String(req.headers.prefer || '').includes('representation') ? send(200, [row]) : send(204);
      }
      if (req.method === 'POST' && table === 'users') {
        const rows = JSON.parse(body || '[]');
        this.writes.push({ table, method: 'POST', body: rows });
        for (const r of [].concat(rows as any)) this.users.set((r as any).id, r as any);
        return send(201);
      }
      // ---- Storage (upload + signed URL) and the uploaded_files table
      if (u.pathname.startsWith('/storage/v1/object/sign/')) {
        return send(200, { signedURL: u.pathname.replace('/storage/v1', '') + '?token=fake' });
      }
      // list(prefix) -> POST /storage/v1/object/list/{bucket}, body { prefix, ... }
      { const m = u.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/); if (req.method === 'POST' && m) {
        const bucket = m[1];
        const { prefix } = JSON.parse(body || '{}');
        const base = `/storage/v1/object/${bucket}/${prefix}`.replace(/\/+$/, '');
        const matches = this.storedObjects
          .filter((p) => p.startsWith(base + '/'))
          .map((p) => ({ name: p.slice(base.length + 1) }));
        return send(200, matches);
      } }
      // remove(paths) -> DELETE /storage/v1/object/{bucket}, body { prefixes: [...] }
      { const m2 = u.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/); if (req.method === 'DELETE' && m2) {
        const bucket = m2[1];
        const { prefixes } = JSON.parse(body || '{}');
        this.storedObjects = this.storedObjects.filter((p) => !(prefixes || []).some((pre: string) => p === `/storage/v1/object/${bucket}/${pre}`));
        return send(200, (prefixes || []).map((name: string) => ({ name })));
      } }
      if (req.method === 'POST' && u.pathname.startsWith('/storage/v1/object/')) {
        this.storedObjects.push(u.pathname);
        return send(200, { Key: u.pathname });
      }
      if (req.method === 'POST' && table === 'uploaded_files') {
        this.writes.push({ table, method: 'POST', body: JSON.parse(body || '[]') });
        return send(201);
      }
      // DELETE on a PostgREST table: users / uploaded_files / subscriptions
      if (req.method === 'DELETE' && ['users', 'uploaded_files', 'subscriptions'].includes(table)) {
        this.writes.push({ table, method: 'DELETE', body: Object.fromEntries(u.searchParams) });
        const idFilter = eq('id');
        const userIdFilter = eq('user_id');
        if (table === 'users' && idFilter) {
          if (this.failUsersDelete) return send(500, { message: 'simulated users delete failure', code: 'XX000' });
          this.users.delete(idFilter);
        } else if (userIdFilter) {
          if (table === 'subscriptions') this.subs = this.subs.filter((sub) => sub.user_id !== userIdFilter);
          if (table === 'uploaded_files') { /* no in-memory uploaded_files store yet: nothing to filter */ }
        }
        return send(200, []);
      }
      // ---- GoTrue Admin API (ban/unban, delete, list) ----
      if (req.method === 'GET' && u.pathname === '/auth/v1/admin/users') {
        const users = [...this.users.keys()].filter((id) => !this.deletedUserIds.has(id)).map((id) => ({
          id,
          email: this.users.get(id)?.email,
          banned_until: this.bannedUntil.get(id) || null,
        }));
        return send(200, { users, aud: 'authenticated', next_page: null, last_page: 0, total: users.length });
      }
      { const m = u.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/); if (m) {
        const uid = m[1];
        if (req.method === 'PUT') {
          const { ban_duration } = JSON.parse(body || '{}');
          if (ban_duration && ban_duration !== 'none') {
            this.bannedUntil.set(uid, new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString());
          } else {
            this.bannedUntil.delete(uid);
          }
          return send(200, { id: uid, email: this.users.get(uid)?.email, banned_until: this.bannedUntil.get(uid) || null });
        }
        if (req.method === 'DELETE') {
          if (this.failAuthDeleteUser) return send(500, { msg: 'simulated auth delete failure' });
          this.deletedUserIds.add(uid);
          this.users.delete(uid);
          this.bannedUntil.delete(uid);
          return send(200, { id: uid });
        }
      } }
      return send(404, { message: `fake supabase: unhandled ${req.method} ${u.pathname}` });
    });
    this.url = await listen(this.server);
    return this.url;
  }
  stop() { this.server?.close(); }
}

/** Minimal Gemini generateContent endpoint. */
export class FakeGemini {
  mode: 'ok' | 'error' | 'empty' = 'ok';
  text = '[{"id":"t1","text":"Hello","x":10,"y":10,"fontSize":12}]';
  calls: { path: string; model: string }[] = [];
  server!: http.Server;
  url = '';

  async start() {
    this.server = http.createServer(async (req, res) => {
      await readBody(req);
      const m = /\/models\/([^:/]+):generateContent/.exec(req.url || '');
      if (!m) { res.writeHead(404); return res.end('{}'); }
      this.calls.push({ path: req.url || '', model: decodeURIComponent(m[1]) });
      if (this.mode === 'error') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 500, message: 'simulated Gemini outage', status: 'INTERNAL' } })); }
      const text = this.mode === 'empty' ? '' : this.text;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: text ? [{ text }] : [] }, finishReason: 'STOP', index: 0 }] }));
    });
    this.url = await listen(this.server);
    return this.url;
  }
  stop() { this.server?.close(); }
}

export interface Harness {
  base: string;
  supa: FakeSupabase;
  gemini: FakeGemini;
  call: (path: string, opts?: { token?: string; method?: string; body?: any }) => Promise<{ status: number; json: any }>;
  close: () => void;
}

/** Boots fakes + the real server app in PRODUCTION mode (no dev fallbacks). */
export async function boot(extraEnv: Record<string, string> = {}): Promise<Harness> {
  const supa = new FakeSupabase();
  const gemini = new FakeGemini();
  const supaUrl = await supa.start();
  const geminiUrl = await gemini.start();

  process.env.NODE_ENV = 'production';
  process.env.VERCEL = '1'; // serverless-like: no listen(), local cache lives in /tmp
  process.env.SUPABASE_URL = supaUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GOOGLE_GEMINI_BASE_URL = geminiUrl;
  delete process.env.STRIPE_SECRET_KEY;
  for (const [k, v] of Object.entries(extraEnv)) process.env[k] = v;

  const mod: any = await import('../../server');
  const server = http.createServer(mod.default);
  const base = await listen(server);

  const call: Harness['call'] = async (path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let body: any;
    if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    const r = await fetch(base + path, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, json };
  };

  return { base, supa, gemini, call, close: () => { server.close(); supa.stop(); gemini.stop(); } };
}

/** Tiny assertion runner matching the existing tests' style. */
export function makeRunner(title: string) {
  let passed = 0, failed = 0;
  console.log('=====================================================');
  console.log(title);
  console.log('=====================================================\n');
  return {
    check(name: string, ok: boolean, detail = '') {
      if (ok) { passed++; console.log(`  PASS  ${name}`); }
      else { failed++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
    },
    finish(): never {
      console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
      process.exit(failed === 0 ? 0 : 1);
    },
  };
}
