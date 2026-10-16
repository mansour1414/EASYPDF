import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
// NOTE (Sep 2026): `vite` used to be a static top-level import even though
// createViteServer() is only ever called in the local-dev branch below. In
// the production esbuild bundle (`--packages=external`), a static import is
// hoisted to an unconditional `require('vite')` that runs on EVERY cold
// start, pulling in Vite's whole module graph (which the deployed server
// never uses in production, since Vercel serves the pre-built `dist/`
// output instead). It is now a dynamic import evaluated only inside that
// dev-only branch, so it never loads in production.
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { needsArabicShaping, shapeArabicText } from './arabicShaper';

/**
 * Express 4 does not automatically forward rejected promises from async
 * route handlers to the error middleware — an unhandled rejection would
 * bypass registerGlobalErrorHandler() entirely (and crash the process on
 * Node's default behavior). Every async route handler below is wrapped with
 * asyncRoute(), which simply forwards the rejection via next(err).
 */
const asyncRoute = (
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const app = express();
app.set('trust proxy', 1);

// Security-audit fix (Aug 2026): the app previously sent NO hardening HTTP
// response headers at all (no X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Referrer-Policy, etc.) — every response only
// had Express's defaults. helmet() adds the standard, low-risk set of
// these headers regardless of the CSP setting below.
//
// CSP (Aug 2026 audit, second pass): every external resource this app
// actually loads was traced through the code:
//   - Fonts: index.html <link> tags load Geist/Inter CSS + font files from
//     cdn.jsdelivr.net (src/index.css itself only has `@import "tailwindcss"`,
//     no other remote @import/url()).
//   - PDF rendering: src/lib/pdfRenderer.ts explicitly sets
//     pdfjsLib.GlobalWorkerOptions.workerSrc to a URL on cdnjs.cloudflare.com.
//   - OCR: tesseract.js's browser defaults (node_modules/tesseract.js's own
//     defaultOptions/getCore.js) load its worker script, core wasm, and
//     language traineddata all from cdn.jsdelivr.net.
//   - Supabase: REST/Auth calls go to the project's own *.supabase.co
//     origin (URL is only known at runtime via env vars, hence a wildcard).
//   - Google OAuth and Stripe Checkout: both are handled via a full-page
//     redirect (`window.location` / `supabase.auth.signInWithOAuth`'s
//     default redirect, and `window.location.href = session.url`) — NOT
//     an iframe or fetch() call — so neither needs a CSP allowance here
//     (frame-src/connect-src don't apply to top-level navigation).
//   - No inline <script> tags exist anywhere in index.html or the built
//     output; Vite's production build does not inject inline scripts.
//
// This produces a real, specific policy below — but it is NOT enabled by
// default. This sandbox cannot launch a real browser to confirm the OCR
// worker / wasm loading, the pdf.js worker, and Framer Motion's inline
// style usage all still function correctly with these directives (worker
// script-loading and WASM-via-fetch CSP behavior has real cross-browser
// nuance that static code review can't fully guarantee). Flipping this on
// blindly in production risks silently breaking OCR or PDF preview for
// every user. Set ENABLE_STRICT_CSP=true (in a Vercel PREVIEW deployment
// first) to turn it on and manually verify: Google/email sign-in, PDF
// upload+preview, OCR (both en/ar), image enhance, and the AI Copilot —
// then promote to production once confirmed. See the chat report's CSP
// section for the exact manual test checklist.
const STRICT_CSP_ENABLED = process.env.ENABLE_STRICT_CSP === 'true';

app.use(helmet({
  contentSecurityPolicy: STRICT_CSP_ENABLED ? {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'wasm-unsafe-eval': tesseract.js fetches and instantiates its WASM
      // core from cdn.jsdelivr.net; modern browsers gate WebAssembly
      // compilation behind this token. Without it the OCR worker would fail
      // under strict CSP in Chrome/Firefox.
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', "'wasm-unsafe-eval'"],
      workerSrc: ["'self'", 'blob:', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', "'wasm-unsafe-eval'"],
      // 'unsafe-inline' kept for style-src only (not script-src): Framer
      // Motion / Tailwind may set inline style="" in edge cases this
      // review couldn't fully rule out in a real browser. This is a
      // deliberately conservative tradeoff — inline styles are a much
      // smaller XSS surface than inline scripts — and can be tightened
      // to a nonce-based approach later once verified safe to remove.
      styleSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
      connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://*.supabase.co', 'wss://*.supabase.co'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Vercel's serverless filesystem is READ-ONLY except for /tmp, and /tmp does
// not persist between invocations. Everywhere we write to local disk as a
// dev/fallback convenience, we must write under a writable, per-environment
// directory instead of assuming process.cwd() is writable.
const isServerlessLike = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const writableRoot = isServerlessLike ? '/tmp' : process.cwd();
/**
 * Security hardening (Sep 2026): several dev-only bypasses (mock tokens,
 * the local-JSON-DB admin/entitlement fallback, seeded demo users) were
 * gated on `NODE_ENV === 'production'` alone. A real Vercel Production
 * deployment that, for whatever reason, doesn't have NODE_ENV=production
 * set would silently fall back to dev-mode auth bypasses while still being
 * reachable on the public internet.
 *
 * `VERCEL_ENV` (distinct from the generic `VERCEL` flag `isServerlessLike`
 * above checks) is Vercel's own System Environment Variable that is always
 * "production", "preview", or "development" on every real Vercel
 * deployment — unlike the bare `VERCEL` flag, it can't be true for a
 * Preview deployment or a local test harness that just wants the /tmp
 * writable-root behavior (several of this project's own tests set
 * `VERCEL=1` for exactly that, while intentionally still using mock
 * tokens), so it's the correct, narrow signal for "this is genuinely a
 * production deployment" specifically.
 */
const isProductionLike = () => process.env.NODE_ENV === 'production'
  || process.env.VERCEL_ENV === 'production'
  || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const uploadDir = path.join(writableRoot, 'uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create local uploads directory (expected on read-only filesystems):', e);
}

// Only PDF and common image types are ever accepted for upload.
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

function sanitizeOriginalFileName(originalName: string): string {
  // Strip any path components and anything that isn't a safe filename
  // character, to prevent path traversal / arbitrary file writes via a
  // crafted "originalname" (e.g. "../../etc/cron.d/x").
  const baseName = path.basename(originalName || 'file');
  const ext = path.extname(baseName).toLowerCase();
  const stem = baseName.slice(0, baseName.length - ext.length);
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80) || 'file';
  const safeExt = ALLOWED_UPLOAD_EXTENSIONS.has(ext) ? ext : '';
  return `${safeStem}${safeExt}`;
}

// ---------------------------------------------------------------------------
// Unicode / Arabic font support for /api/pdf/edit-text
// ---------------------------------------------------------------------------
// Standard PDF fonts (Helvetica etc.) are WinAnsi-encoded and CANNOT encode
// Arabic (or any non-Latin script) — drawText would throw and fail the whole
// export. When a text block contains characters outside WinAnsi, we embed the
// bundled Amiri font (SIL OFL — public/fonts/Amiri-Regular.ttf, copied to
// dist/fonts by the Vite build so vercel.json's includeFiles covers it on
// serverless) together with @pdf-lib/fontkit, which pdf-lib requires for any
// custom-font embedding. Arabic strings are additionally run through
// shapeArabicText() because pdf-lib performs no OpenType shaping or bidi.
const WINANSI_SAFE_RE =
  /^[\u0000-\u00FF\u20AC\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2013\u2014\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2122\n\r\t]*$/;

let unicodeFontBytesCache: Buffer | null = null;
function loadUnicodeFontBytes(): Buffer {
  if (unicodeFontBytesCache) return unicodeFontBytesCache;
  const candidates = [
    path.join(process.cwd(), 'dist', 'fonts', 'Amiri-Regular.ttf'),
    path.join(process.cwd(), 'public', 'fonts', 'Amiri-Regular.ttf'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      unicodeFontBytesCache = fs.readFileSync(p);
      return unicodeFontBytesCache;
    }
  }
  throw new Error(
    'Unicode/Arabic font asset not found (expected public/fonts/Amiri-Regular.ttf). ' +
    'The deployment is missing this bundled file.'
  );
}

let fontkitModule: any = null;
async function getFontkit(): Promise<any> {
  if (!fontkitModule) {
    const m: any = await import('@pdf-lib/fontkit');
    fontkitModule = m.default ?? m;
  }
  return fontkitModule;
}

/**
 * Safely escape a value for inclusion in a double-quoted CSV field:
 *  1. Escapes embedded double-quotes ("" per RFC 4180).
 *  2. Neutralizes formula/CSV injection: if the value starts with
 *     =, +, -, @, tab, or CR (characters Excel/Sheets interpret as the
 *     start of a formula), prefix it with a leading apostrophe so it's
 *     always treated as literal text when the CSV is opened in a
 *     spreadsheet app. This matters here because extracted "value" data
 *     can be AI-derived or, in principle, influenced by attacker-controlled
 *     document content.
 */
function csvEscape(raw: any): string {
  let value = String(raw ?? '');
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  return value.replace(/"/g, '""');
}

// Multer storage configuration for local PDF/image uploads (temporary —
// files are pushed to Supabase Storage right after upload when configured).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `${uniqueSuffix}-${sanitizeOriginalFileName(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only PDF and image files (PNG, JPG, WEBP) are allowed.'));
    }
    cb(null, true);
  }
});

/**
 * Security fix (Sep 2026): the multer fileFilter above only checked the
 * `Content-Type` the CLIENT declared for the part — a value the browser
 * sends and a malicious client can set to anything, regardless of what the
 * file actually contains. This reads the first bytes of the file ALREADY
 * SAVED to disk and confirms they match a real signature for the claimed
 * type, so an attacker can't upload arbitrary content (e.g. HTML/JS) merely
 * by lying about its Content-Type. Only covers the types this app accepts.
 */
function fileSignatureMatches(buffer: Buffer, claimedMimeType: string): boolean {
  const startsWith = (bytes: number[]) => bytes.every((b, i) => buffer[i] === b);
  switch (claimedMimeType) {
    case 'application/pdf':
      return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
    case 'image/jpg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'image/webp':
      return startsWith([0x52, 0x49, 0x46, 0x46]) // "RIFF"
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50; // "WEBP"
    default:
      return false; // unknown declared type: never treated as a match
  }
}

// JSON and URL-encoded body parsers.
// IMPORTANT: these must NOT run on /api/stripe/webhook — Stripe signature
// verification requires the raw, unparsed request body. If express.json()
// consumes the body first, stripe.webhooks.constructEvent() will fail.
const STRIPE_WEBHOOK_PATH = '/api/stripe/webhook';

// Security/reliability fix (Aug 2026 audit): a single flat 50MB JSON limit
// was applied to EVERY route, including small text-only endpoints
// (/api/summarize, /api/copilot/command, /api/pdf/edit-text,
// /api/admin/*). That's far more memory than any of those legitimately
// need, and — combined with the in-memory rate limiter also being
// per-instance (see the rate limiter section below) — made it easier for
// a burst of large requests to pressure a single serverless instance's
// memory. Only the AI routes that actually accept a base64-encoded
// rendered page image need a larger limit; everything else gets a much
// smaller default. This does NOT reduce what OCR / image-enhance /
// extract-data can handle (still 15MB, comfortably more than a single
// rendered page needs) — only routes that never send images got smaller.
const LARGE_JSON_BODY_PATHS = new Set<string>([
  '/api/pdf/ocr',
  '/api/ai/enhance-image',
  '/api/ai/extract-data',
]);
const DEFAULT_JSON_BODY_LIMIT = '5mb';
const IMAGE_JSON_BODY_LIMIT = '15mb';
const jsonParserDefault = express.json({ limit: DEFAULT_JSON_BODY_LIMIT });
const jsonParserForImages = express.json({ limit: IMAGE_JSON_BODY_LIMIT });

app.use((req, res, next) => {
  if (req.originalUrl === STRIPE_WEBHOOK_PATH) return next();
  if (LARGE_JSON_BODY_PATHS.has(req.path)) {
    return jsonParserForImages(req, res, next);
  }
  return jsonParserDefault(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === STRIPE_WEBHOOK_PATH) return next();
  // No route in this app actually consumes a urlencoded (form-submitted)
  // body — every client request is JSON or multipart (multer). Kept only
  // as defensive middleware in case a future route needs it; given a
  // small limit since it's not a real usage path today.
  express.urlencoded({ extended: true, limit: '1mb' })(req, res, next);
});

// Static uploads serving
// NOTE: the old `app.use('/uploads', express.static(uploadDir))` served every
// uploaded file to anyone who guessed/enumerated a filename, with zero
// ownership check. It has been replaced below (after authenticateUser /
// requireAdmin / loadLocalDB are defined) with a per-file, ownership-checked
// route that denies access by default when no ownership record exists.

// ----------------------------------------------------------------------------
// Rate limiting (fixed, Aug 2026 audit)
// ----------------------------------------------------------------------------
// PROBLEM: express-rate-limit's default store is an in-memory Map, scoped to
// a single Node process. On Vercel's serverless runtime, concurrent
// requests are routinely served by DIFFERENT function instances, each with
// its own empty Map — there is no shared state between them. A limiter
// configured as "20 requests / 15 minutes" can therefore actually allow
// roughly 20 requests PER CONCURRENT INSTANCE, which is not a meaningful
// limit under real traffic or a deliberate abuse burst.
//
// FIX: reuse this project's own Supabase database as the shared store
// (via the check_rate_limit() Postgres function — see
// supabase_atomic_quota_and_rate_limit.sql) instead of introducing a new
// external service (e.g. Redis) purely for this. This keeps the
// architecture simple and avoids new infrastructure/cost, while still
// giving a real, cross-instance limit. When Supabase isn't configured
// (local dev without a project), this transparently falls back to the
// original in-memory limiter, which is perfectly fine for a single local
// dev server process.
function createDistributedRateLimiter(opts: {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
  message: string;
}) {
  // In-memory fallback limiter, used only when Supabase isn't configured.
  const fallback = rateLimit({
    windowMs: opts.windowSeconds * 1000,
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: opts.message },
  });

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const supabase = getSupabase();
    if (!supabase) {
      return fallback(req, res, next);
    }

    // Prefer the authenticated user's id as the bucket key (authenticateUser
    // runs before this middleware on every route it's paired with in this
    // app); fall back to IP for any route reachable pre-auth.
    const identity = req.user?.id || req.ip || 'unknown';
    const bucketKey = `${opts.keyPrefix}:${identity}`;

    try {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_key: bucketKey,
        p_window_seconds: opts.windowSeconds,
        p_max_requests: opts.max,
      });

      if (error) {
        // Fail OPEN on infrastructure errors here (not fail-closed): a
        // rate limiter is defense-in-depth, not the primary security
        // control (the atomic daily quota is). Blocking all legitimate
        // traffic because the rate-limit RPC itself had a transient
        // error would be a worse outcome than temporarily relying on
        // the in-memory fallback for this one request.
        console.error(`check_rate_limit RPC error for ${bucketKey}:`, error.message);
        return fallback(req, res, next);
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.allowed) {
        return next();
      }

      res.setHeader('Retry-After', String(row.retry_after_seconds ?? opts.windowSeconds));
      return res.status(429).json({ error: opts.message });
    } catch (err) {
      console.error(`Distributed rate limiter unexpected error for ${bucketKey}:`, err);
      return fallback(req, res, next);
    }
  };
}

const authRateLimiter = createDistributedRateLimiter({
  windowSeconds: 15 * 60,
  max: 20,
  keyPrefix: 'auth',
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const aiRateLimiter = createDistributedRateLimiter({
  windowSeconds: 60,
  max: 15,
  keyPrefix: 'ai',
  message: 'Too many AI requests. Please slow down and try again shortly.',
});

// NOTE (audit, Aug 2026): /api/pdf/upload previously had no rate limiter at
// all — every other resource-intensive, quota-consuming endpoint
// (checkout, AI routes) does. The daily upload quota (3/day free) still
// caps eventual usage, but without this, nothing stops a burst of rapid
// requests from hammering multer's disk I/O and the Supabase Storage
// upload call before that quota check is even reached.
const uploadRateLimiter = createDistributedRateLimiter({
  windowSeconds: 5 * 60,
  max: 20,
  keyPrefix: 'upload',
  message: 'Too many upload requests. Please wait a few minutes and try again.',
});

// Fallback JSON-file database to allow full out-of-the-box local testing.
// NOTE: on serverless hosts (Vercel) this file lives under /tmp and is NOT
// persistent — it's a dev convenience / cache only. Supabase is always the
// source of truth when configured; local DB writes must never be allowed to
// fail a request that already succeeded against Supabase.
const DB_FILE = path.join(writableRoot, 'db_fallback.json');

interface LocalUser {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  admin_granted_pro?: boolean;
  created_at: string;
  uploads_count_today: number;
  ai_count_today: number;
  last_usage_reset_date: string;
}

interface LocalFile {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

interface LocalStripeEvent {
  event_id: string;
  event_type: string;
  event_created_at: string;
  status: 'processing' | 'completed' | 'failed';
  claimed_at?: string;
  lease_expires_at?: string;
  processed_at: string;
}

interface LocalSubscription {
  id?: string;
  user_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id: string;
  status: string;
  last_event_created_at?: string;
  created_at: string;
  updated_at?: string;
}

interface DBStructure {
  users: LocalUser[];
  files: LocalFile[];
  paymentMethods: {
    card: boolean;
    applepay: boolean;
    googlepay: boolean;
    paypal: boolean;
    bank: boolean;
  };
  // Master ON/OFF switch for subscription purchasing, dev/no-Supabase cache
  // only — see loadSubscriptionEnabled/saveSubscriptionEnabled below for the
  // real (Supabase app_settings-backed) source of truth.
  subscriptionEnabled?: boolean;
  stripeEvents?: LocalStripeEvent[];
  subscriptions?: LocalSubscription[];
}

const loadLocalDB = (): DBStructure => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading fallback DB, resetting...', e);
  }
  
  // NOTE (Aug 2026 audit): the two seed users below (admin@easypdf.com,
  // demo@easypdf.com) exist solely to support the local-dev-only
  // mock-token auth convenience in authenticateUser()/requireAdmin()
  // above (both already strictly gated behind `!isProduction`). They
  // must never be reachable in production, where a Supabase failure
  // should surface as a real error, not silently show fake identities
  // in the Admin Dashboard (GET /api/admin/users). So this fallback DB
  // only seeds them outside production; in production it starts empty.
  const defaultDB: DBStructure = {
    users: isProductionLike() ? [] : [
      {
        id: 'admin-user-id',
        email: 'admin@easypdf.com',
        plan: 'pro',
        // ENTITLEMENT FIX: plan is DERIVED from admin_granted_pro /
        // subscription status (see calculateEntitlementForUser), never read
        // from the stored `plan` column alone. The seeded dev admin must
        // therefore carry the flag, otherwise quota'd endpoints treat this
        // account as free-tier despite its plan field saying 'pro'.
        admin_granted_pro: true,
        created_at: new Date().toISOString(),
        uploads_count_today: 0,
        ai_count_today: 0,
        last_usage_reset_date: new Date().toISOString().split('T')[0]
      },
      {
        id: 'demo-user-id',
        email: 'demo@easypdf.com',
        plan: 'free',
        created_at: new Date().toISOString(),
        uploads_count_today: 0,
        ai_count_today: 0,
        last_usage_reset_date: new Date().toISOString().split('T')[0]
      }
    ],
    files: [],
    paymentMethods: {
      card: true,
      applepay: true,
      googlepay: true,
      paypal: true,
      bank: true
    }
  };
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
  } catch (e) {
    console.warn('Could not write initial local fallback DB (non-fatal, expected on read-only filesystems):', e);
  }
  return defaultDB;
};

const saveLocalDB = (db: DBStructure) => {
  // Never let a local-cache write failure (e.g. read-only filesystem on
  // serverless hosts) bubble up and fail a request that otherwise succeeded.
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.warn('Could not persist local fallback DB (non-fatal, expected on read-only filesystems):', e);
  }
};

const STRINGS_FILE = path.join(writableRoot, 'app_strings_fallback.json');
const loadFallbackStrings = () => {
  try {
    if (fs.existsSync(STRINGS_FILE)) {
      const raw = fs.readFileSync(STRINGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading fallback strings:', e);
  }
  return [];
};
const saveFallbackStrings = (data: any) => {
  try {
    fs.writeFileSync(STRINGS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving fallback strings:', e);
  }
};

// Lazy initialization helpers for external SDKs (to prevent startup crashes)
let supabaseClient: any = null;
let loggedServiceRoleWarning = false;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fallbackKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const key = serviceRoleKey || fallbackKey;

  if (!url) {
    // NOTE: this used to silently default to a specific hardcoded Supabase
    // project URL. That's dangerous for anyone who forks/redeploys this
    // repo without setting SUPABASE_URL — they'd unknowingly connect to a
    // different project's database with whatever key they configured.
    // Fail closed instead.
    console.log('SUPABASE_URL (or VITE_SUPABASE_URL) missing. Running auth and database via high-fidelity local state.');
    return null;
  }
  if (!key) {
    console.log('Supabase key missing. Running auth and database via high-fidelity local state.');
    return null;
  }

  const isProductionEnv = process.env.NODE_ENV === 'production';

  // CRITICAL (hardened, Aug 2026 audit): every write this backend performs
  // (webhook plan updates, atomic AI/upload quota RPCs, admin actions, file
  // records) relies on the SERVICE ROLE key to bypass Row Level Security.
  // Once the RLS lockdown migrations are applied (supabase_users_rls_lockdown.sql,
  // supabase_subscriptions_rls_lockdown.sql, supabase_uploaded_files_rls_lockdown.sql,
  // supabase_atomic_quota_and_rate_limit.sql), an anon-key client has NO
  // write access to these tables/functions at all.
  //
  // Previously this only logged a warning and continued running with the
  // anon key. That is dangerous specifically because it's a PARTIALLY
  // working failure mode: some reads still succeed, some writes may still
  // succeed if RLS isn't fully applied yet, and PostgREST table UPDATEs
  // blocked by RLS affect 0 rows WITHOUT throwing an error — so the app
  // looks like it's working (200 OK, "success: true") while quietly not
  // persisting anything. That is worse than an outage: real users could be
  // told their AI/upload quota was recorded, their PDF was saved, or their
  // Pro plan was activated, when none of that actually happened.
  //
  // In PRODUCTION specifically, if a real Supabase project is configured
  // (SUPABASE_URL is set — meaning this deployment is NOT meant to be
  // running on the local-JSON-file fallback) but the service role key is
  // missing, refuse to use the anon key at all. Returning null here makes
  // every caller of getSupabase() treat this exactly like "Supabase not
  // configured", and authenticateUser/requireAdmin already fail CLOSED
  // (401/403) in production when that happens — so the app stops cleanly
  // and loudly instead of silently corrupting data. Local development is
  // unaffected: outside production, the anon-key fallback below still
  // works as before, since local/test Supabase projects often don't have
  // RLS fully configured yet.
  if (isProductionEnv && !serviceRoleKey) {
    if (!loggedServiceRoleWarning) {
      loggedServiceRoleWarning = true;
      console.error(
        '[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is not set in production. Refusing to fall back to the ' +
        'anon key, because doing so risks silently failing writes (RLS-blocked UPDATEs return 0 rows ' +
        'affected without an error) while appearing to succeed. All Supabase-backed routes will now ' +
        'return 401/503 until SUPABASE_SERVICE_ROLE_KEY is set in the Vercel production environment.'
      );
    }
    return null;
  }

  if (!serviceRoleKey && !loggedServiceRoleWarning) {
    loggedServiceRoleWarning = true;
    console.error(
      '[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is not set — falling back to the anon key. ' +
      'This is only tolerated outside production (NODE_ENV !== "production"). If Row Level Security ' +
      'is enabled on public.users / public.subscriptions / public.uploaded_files (as it should be — ' +
      'see the *_rls_lockdown.sql migrations), backend writes to these tables will silently fail. ' +
      'Set SUPABASE_SERVICE_ROLE_KEY in the deployment environment (Vercel project settings) before ' +
      'promoting this to production.'
    );
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
    return supabaseClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
};

let stripeClient: Stripe | null = null;
const getStripe = (): Stripe | null => {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.log('Stripe secret key is missing. Operating in simulated Stripe billing mode.');
    return null;
  }
  try {
    stripeClient = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
    return stripeClient;
  } catch (err) {
    console.error('Failed to initialize Stripe client:', err);
    return null;
  }
};

/**
 * Single source of truth for the Gemini model used by EVERY AI route.
 * Override with the GEMINI_MODEL environment variable (e.g. in Vercel) to
 * switch models without a code change; the default is unchanged.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let geminiClient: GoogleGenAI | null = null;
const getGemini = (): GoogleGenAI | null => {
  if (geminiClient) return geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY is missing. Gemini summarizes will use mock-AI fallback.');
    return null;
  }
  try {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    return geminiClient;
  } catch (err) {
    console.error('Failed to initialize Gemini client:', err);
    return null;
  }
};

// Daily usage reset helper for usage limit checks
const verifyAndResetDailyLimits = (user: LocalUser): LocalUser => {
  const today = new Date().toISOString().split('T')[0];
  if (user.last_usage_reset_date !== today) {
    user.uploads_count_today = 0;
    user.ai_count_today = 0;
    user.last_usage_reset_date = today;
  }
  return user;
};

/**
 * Thrown when the server cannot determine a user's plan/entitlement from its
 * authoritative source. Callers must FAIL CLOSED (never guess "pro", never
 * silently fall back to a local cache). Mapped to HTTP 503 by
 * resolveErrorResponse() below.
 */
export class EntitlementLookupError extends Error {
  status = 503;
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'EntitlementLookupError';
  }
}

const ENTITLEMENT_UNAVAILABLE_MESSAGE =
  'Could not verify your subscription status right now. Please try again in a moment.';

/**
 * Total entitlement = admin_granted_pro OR an active/trialing Stripe subscription.
 *
 * AUTHORITY RULES (production hardening, Sep 2026):
 *  - When Supabase is configured, Supabase is the ONLY source of truth. The
 *    local JSON cache (/tmp/db_fallback.json on Vercel) is per-instance and can
 *    be arbitrarily stale, so it must never grant Pro (an old
 *    admin_granted_pro=true or an old "active" subscription would otherwise
 *    survive a revocation/cancellation on warm serverless instances).
 *  - If the Supabase lookup fails, throw EntitlementLookupError (fail closed).
 *    Do NOT downgrade to "free" on error either: that would let a transient
 *    error write plan='free' over a real Pro user's row.
 *  - The local fallback is used ONLY in development/test when Supabase is not
 *    configured. In production with no Supabase this also fails closed.
 */
async function calculateEntitlementForUser(userId: string): Promise<{ isPro: boolean; plan: 'free' | 'pro'; adminGrantedPro: boolean }> {
  const supabase = getSupabase();

  let adminGrantedPro = false;
  let hasActiveStripeSub = false;

  if (supabase) {
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('admin_granted_pro, plan')
      .eq('id', userId)
      .maybeSingle();
    if (userErr) {
      console.error(`Entitlement lookup (users) failed for ${userId}:`, userErr);
      throw new EntitlementLookupError(ENTITLEMENT_UNAVAILABLE_MESSAGE, userErr);
    }
    adminGrantedPro = userRow?.admin_granted_pro === true;

    const { data: subs, error: subsErr } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId);
    if (subsErr) {
      console.error(`Entitlement lookup (subscriptions) failed for ${userId}:`, subsErr);
      throw new EntitlementLookupError(ENTITLEMENT_UNAVAILABLE_MESSAGE, subsErr);
    }
    hasActiveStripeSub = !!subs && subs.some((s: any) => s.status === 'active' || s.status === 'trialing');
  } else if (isProductionLike()) {
    // Production must never derive entitlement from a local file.
    throw new EntitlementLookupError(ENTITLEMENT_UNAVAILABLE_MESSAGE);
  } else {
    // Development / tests without Supabase only.
    const localDB = loadLocalDB();
    const localUser = localDB.users.find(u => u.id === userId);
    adminGrantedPro = localUser?.admin_granted_pro === true;
    if (localDB.subscriptions) {
      hasActiveStripeSub = localDB.subscriptions
        .filter(s => s.user_id === userId)
        .some(s => s.status === 'active' || s.status === 'trialing');
    }
  }

  const isPro = adminGrantedPro || hasActiveStripeSub;
  const plan: 'free' | 'pro' = isPro ? 'pro' : 'free';

  return { isPro, plan, adminGrantedPro };
}

type UserProfileSummary = { plan: 'free' | 'pro'; uploads_count_today: number; ai_count_today: number; last_usage_reset_date: string; email: string };

/**
 * Load a user's plan + daily counters.
 *
 * Supabase configured  -> everything comes from Supabase (users + subscriptions).
 *                         The local cache is neither read nor written, and any
 *                         Supabase error throws EntitlementLookupError.
 * No Supabase (dev/test)-> the local JSON DB is used (never in production).
 *
 * `authEmail` (the verified email from the auth token) is only used when the
 * users row has to be auto-created, so we never store a placeholder email.
 */
async function getOrSyncUserProfile(userId: string, authEmail?: string): Promise<UserProfileSummary> {
  const today = new Date().toISOString().split('T')[0];
  const supabase = getSupabase();

  if (supabase) {
    // Authoritative entitlement first: throws (fail closed) on any lookup error.
    const { plan: finalPlan, adminGrantedPro } = await calculateEntitlementForUser(userId);

    const { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error(`Profile lookup failed for ${userId}:`, profileErr);
      throw new EntitlementLookupError(ENTITLEMENT_UNAVAILABLE_MESSAGE, profileErr);
    }

    if (userProfile) {
      let uploadsToday = userProfile.uploads_count_today ?? 0;
      let aiToday = userProfile.ai_count_today ?? 0;
      let resetDate = userProfile.last_usage_reset_date ?? today;

      if (resetDate !== today) {
        uploadsToday = 0;
        aiToday = 0;
        resetDate = today;
        const { error: resetErr } = await supabase.from('users').update({
          uploads_count_today: 0,
          ai_count_today: 0,
          last_usage_reset_date: today
        }).eq('id', userId);
        if (resetErr) console.error(`Daily counter reset failed for ${userId}:`, resetErr);
      }

      // Keep the (display-only) plan column aligned with the entitlement that
      // was just derived from Supabase itself.
      if (userProfile.plan !== finalPlan) {
        const { error: planErr } = await supabase.from('users').update({ plan: finalPlan }).eq('id', userId);
        if (planErr) console.error(`Plan column sync failed for ${userId}:`, planErr);
      }

      return {
        plan: finalPlan,
        uploads_count_today: uploadsToday,
        ai_count_today: aiToday,
        last_usage_reset_date: resetDate,
        email: userProfile.email || authEmail || ''
      };
    }

    // No users row yet: create it with the VERIFIED auth email.
    const { error: insertErr } = await supabase.from('users').insert([{
      id: userId,
      email: authEmail || 'anonymous@easypdf.com',
      plan: finalPlan,
      admin_granted_pro: adminGrantedPro,
      uploads_count_today: 0,
      ai_count_today: 0,
      last_usage_reset_date: today,
      created_at: new Date().toISOString()
    }]);
    // 23505 = the client created the row at the same moment; that is fine.
    if (insertErr && (insertErr as any).code !== '23505') {
      console.error(`Auto-creating users row failed for ${userId}:`, insertErr);
    }
    return {
      plan: finalPlan,
      uploads_count_today: 0,
      ai_count_today: 0,
      last_usage_reset_date: today,
      email: authEmail || 'anonymous@easypdf.com'
    };
  }

  if (isProductionLike()) {
    // Supabase is mandatory in production; never run on the local cache.
    throw new EntitlementLookupError(ENTITLEMENT_UNAVAILABLE_MESSAGE);
  }

  // ---- Development / tests without Supabase: local JSON DB only ----
  const localDB = loadLocalDB();
  let user = localDB.users.find(u => u.id === userId);
  if (!user) {
    user = {
      id: userId,
      email: authEmail || 'anonymous@easypdf.com',
      plan: 'free',
      admin_granted_pro: false,
      created_at: new Date().toISOString(),
      uploads_count_today: 0,
      ai_count_today: 0,
      last_usage_reset_date: today
    };
    localDB.users.push(user);
    saveLocalDB(localDB);
  }

  user = verifyAndResetDailyLimits(user);
  const { plan: localPlan } = await calculateEntitlementForUser(userId);
  user.plan = localPlan;
  const userIdx = localDB.users.findIndex(u => u.id === userId);
  if (userIdx !== -1) {
    localDB.users[userIdx].plan = localPlan;
    saveLocalDB(localDB);
  }

  return {
    plan: user.plan,
    uploads_count_today: user.uploads_count_today,
    ai_count_today: user.ai_count_today,
    last_usage_reset_date: user.last_usage_reset_date,
    email: user.email
  };
}

// NOTE (audit, Aug 2026): updateUserCounters() (the old blind "write these
// exact numbers" helper) has been REMOVED. It was always called as the
// WRITE half of a READ -> CHECK -> INCREMENT -> WRITE sequence performed in
// application code, which is exactly the pattern that made the AI/upload
// daily quota vulnerable to a race condition: concurrent requests could
// all READ the same counter value before any of them WRITEs the
// incremented value back, letting a free user exceed the 3/day limit by
// firing requests in parallel. Do not re-add a helper with this shape —
// all quota increments must go through atomicIncrementQuota() below, which
// performs the read+check+increment+write as a single atomic operation
// (a row-locked Postgres function when Supabase is configured, or a
// per-user in-process mutex for the local-dev fallback).

// Per-user async mutex, used ONLY by the local-dev (no Supabase configured)
// fallback path of atomicIncrementQuota(). Serializes concurrent quota
// operations for the same user within this single Node process, since
// there's no database row lock available to do it in local dev.
const localQuotaLocks = new Map<string, Promise<any>>();
function withLocalQuotaLock<T>(userId: string, fn: () => T): Promise<T> {
  const prior = localQuotaLocks.get(userId) || Promise.resolve();
  const next = prior.then(fn, fn); // run fn regardless of whether the prior chain link rejected
  // Store a version of the chain that never rejects, so a single failure
  // doesn't permanently wedge this user's future lock acquisitions.
  localQuotaLocks.set(userId, next.then(() => undefined, () => undefined));
  return next;
}

interface AtomicQuotaResult {
  allowed: boolean;
  ai_count_today: number;
  uploads_count_today: number;
}

/**
 * Atomically checks the daily quota (AI or upload) for a user against the
 * free-tier limit and, if allowed, increments it — as a single indivisible
 * operation. This is the fix for the READ -> CHECK -> INCREMENT -> WRITE
 * race condition described above.
 *
 * - When Supabase is configured: calls the `increment_daily_quota`
 *   Postgres function (see supabase_atomic_quota_and_rate_limit.sql),
 *   which takes a `SELECT ... FOR UPDATE` row lock on the user's row so
 *   concurrent calls for the SAME user are serialized by Postgres itself.
 * - When Supabase is not configured (local dev only): serializes
 *   concurrent calls for the same user via an in-process async mutex
 *   around the same local JSON-file counters.
 *
 * Fail-safe behavior: if the underlying operation throws (RPC error,
 * local DB write failure, user row missing, etc.), this function
 * re-throws rather than returning `allowed: true`. Callers must treat a
 * thrown error as "quota could not be verified" and refuse the request
 * (fail CLOSED) rather than letting it through unmetered — mirroring how
 * this codebase already fails closed elsewhere (e.g. authenticateUser,
 * requireAdmin).
 */
async function atomicIncrementQuota(
  userId: string,
  counterType: 'ai' | 'upload',
  freeLimit: number,
  isPro: boolean
): Promise<AtomicQuotaResult> {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase.rpc('increment_daily_quota', {
      p_user_id: userId,
      p_counter_type: counterType,
      p_free_limit: freeLimit,
      p_is_pro: isPro,
    });

    if (error) {
      console.error(`[atomicIncrementQuota] RPC error (counterType=${counterType}, user=${userId}):`, error.message);
      throw new Error('Failed to verify usage quota (database error).');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') {
      console.error(`[atomicIncrementQuota] RPC returned an unusable result for user ${userId}:`, data);
      throw new Error('Failed to verify usage quota (unexpected result).');
    }

    return {
      allowed: row.allowed,
      ai_count_today: row.ai_count_today ?? 0,
      uploads_count_today: row.uploads_count_today ?? 0,
    };
  }

  // Local-dev-only fallback (no Supabase project configured).
  return withLocalQuotaLock(userId, () => {
    const localDB = loadLocalDB();
    const idx = localDB.users.findIndex(u => u.id === userId);
    if (idx === -1) {
      throw new Error(`[atomicIncrementQuota] local user ${userId} not found.`);
    }

    const today = new Date().toISOString().split('T')[0];
    const user = localDB.users[idx];
    if (user.last_usage_reset_date !== today) {
      user.uploads_count_today = 0;
      user.ai_count_today = 0;
      user.last_usage_reset_date = today;
    }

    const current = counterType === 'ai' ? user.ai_count_today : user.uploads_count_today;

    if (!isPro && current >= freeLimit) {
      saveLocalDB(localDB);
      return { allowed: false, ai_count_today: user.ai_count_today, uploads_count_today: user.uploads_count_today };
    }

    if (counterType === 'ai') {
      user.ai_count_today = current + 1;
    } else {
      user.uploads_count_today = current + 1;
    }
    saveLocalDB(localDB);

    return { allowed: true, ai_count_today: user.ai_count_today, uploads_count_today: user.uploads_count_today };
  });
}

// ==========================================
// API ROUTES & AUTHENTICATION MIDDLEWARE
// ==========================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  plan?: 'free' | 'pro';
  is_admin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Server-side authentication middleware.
 * Verifies the Supabase access token supplied in `Authorization: Bearer <token>`.
 * Sets `req.user` based strictly on the verified user token.
 */
export const authenticateUser = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty access token' });
  }

  const isProduction = isProductionLike();

  // STRICT SECURITY RULE: Production environment explicitly forbids mock or demo tokens
  if (isProduction && (
    token.startsWith('mock-token-') ||
    token.startsWith('demo-token-') ||
    token === 'admin-user-id' ||
    token === 'demo-user-id'
  )) {
    return res.status(401).json({ error: 'Unauthorized: Mock tokens are strictly forbidden in production' });
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      // Cryptographically verify access token with Supabase Auth
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email || '',
        };
        return next();
      }

      // In production, token verification failure MUST return 401 immediately
      if (isProduction) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired access token' });
      }

      // Development-only fallback mock token for local testing when NODE_ENV !== 'production'
      if (token.startsWith('mock-token-') || token.startsWith('demo-token-')) {
        const mockId = token.replace('mock-token-', '').replace('demo-token-', '');
        const localDB = loadLocalDB();
        const localUser = localDB.users.find(u => u.id === mockId);
        if (localUser) {
          req.user = {
            id: localUser.id,
            email: localUser.email,
            plan: localUser.plan
          };
          return next();
        }
      }

      return res.status(401).json({ error: 'Unauthorized: Invalid or expired access token' });
    } catch (err: any) {
      console.error('Authentication error:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
    }
  } else {
    // In production, missing Supabase client configuration MUST fail protected routes
    if (isProduction) {
      return res.status(401).json({ error: 'Unauthorized: Supabase authentication is required in production' });
    }

    // Development-only fallback mode when Supabase client is uninitialized (local dev)
    if (token.startsWith('mock-token-') || token.startsWith('demo-token-')) {
      const mockId = token.replace('mock-token-', '').replace('demo-token-', '');
      const localDB = loadLocalDB();
      const localUser = localDB.users.find(u => u.id === mockId);
      if (localUser) {
        req.user = {
          id: localUser.id,
          email: localUser.email,
          plan: localUser.plan
        };
        return next();
      }
    }
    const localDB = loadLocalDB();
    const localUser = localDB.users.find(u => u.id === token);
    if (localUser) {
      req.user = {
        id: localUser.id,
        email: localUser.email,
        plan: localUser.plan
      };
      return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Invalid access token' });
  }
};

/**
 * Server-side admin authorization middleware.
 * Must run AFTER `authenticateUser`.
 * Strictly verifies that caller identity (req.user.id) possesses administrator privileges.
 * Fails CLOSED (403 Forbidden) if authorization cannot be verified.
 */
export const requireAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized: User identity not established' });
  }

  const userId = req.user.id;
  const isProduction = isProductionLike();
  let isAdmin = false;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: userRow, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && userRow) {
        if (userRow.is_admin === true || userRow.role === 'admin') {
          isAdmin = true;
        }
      }
    } catch (err) {
      console.error('Failed verification of admin permissions via Supabase:', err);
    }
  }

  // Local development fallback ONLY when NOT in production and Supabase did not grant admin
  if (!isAdmin && !isProduction) {
    if (userId === 'admin-user-id') {
      isAdmin = true;
    } else {
      const localDB = loadLocalDB();
      const localUser = localDB.users.find(u => u.id === userId);
      if (
        localUser &&
        ((localUser as any).is_admin === true ||
         (localUser as any).role === 'admin' ||
         localUser.email?.toLowerCase() === 'admin@easypdf.com')
      ) {
        isAdmin = true;
      }
    }
  }

  if (!isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required' });
  }

  req.user.is_admin = true;
  return next();
};

/**
 * Shared AI-quota PREFLIGHT middleware for every Gemini-backed endpoint.
 * Must run AFTER authenticateUser.
 *
 * Quota model (production hardening, Sep 2026): quota is charged only for an
 * AI operation that actually SUCCEEDED.
 *   1. This middleware only PEEKS: it rejects a free user who is already at
 *      the daily limit (403) BEFORE any Gemini call is made, so nobody at the
 *      limit can trigger paid model calls. It does not increment anything.
 *   2. The route validates its input, calls Gemini, and only after a real,
 *      usable Gemini result does it call spendAiQuotaOrRespond().
 *   3. spendAiQuotaOrRespond() uses the existing atomic atomicIncrementQuota()
 *      (row-locked Postgres function in production). If concurrent requests
 *      raced past the peek, only the ones the atomic increment allows are
 *      delivered; the rest get 403 and their result is discarded.
 * Validation errors (400) and failed Gemini calls (502) therefore never cost
 * the user any quota.
 */
export const enforceAiQuota = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized: User identity not established' });
  }

  try {
    const profile = await getOrSyncUserProfile(req.user.id, req.user.email);
    const geminiConfigured = !!getGemini();

    (req as any).aiProfile = profile;
    (req as any).aiQuota = {
      plan: profile.plan,
      aiUsedToday: profile.ai_count_today,
      aiLeft: profile.plan === 'free' ? Math.max(0, 3 - profile.ai_count_today) : 9999
    };

    // If Gemini isn't configured, the route can only return labeled demo
    // output and never spends quota (spendAiQuotaOrRespond is only reached
    // after a real Gemini success).
    if (geminiConfigured && profile.plan === 'free' && profile.ai_count_today >= 3) {
      return res.status(403).json({
        error: 'AI operations daily quota exceeded. Free users are limited to 3 AI operations per day. Please upgrade to Pro for unlimited AI-powered tools.'
      });
    }

    return next();
  } catch (err: any) {
    // Fail closed: if entitlement/quota state cannot be verified, refuse.
    if (err instanceof EntitlementLookupError) {
      return res.status(503).json({ error: err.message });
    }
    console.error('Failed to check AI quota:', err);
    return res.status(503).json({ error: 'Could not verify AI usage quota right now. Please try again in a moment.' });
  }
};

/**
 * Charge one AI operation to the user, atomically, AFTER a successful Gemini
 * result. Returns the updated quota summary on success. On failure it has
 * already sent the response (403 quota exceeded / 503 could not verify) and
 * returns null — the caller must simply `return` and NOT send the AI result.
 */
async function spendAiQuotaOrRespond(
  req: express.Request,
  res: express.Response
): Promise<{ plan: 'free' | 'pro'; aiUsedToday: number; aiLeft: number } | null> {
  try {
    const profile: UserProfileSummary = (req as any).aiProfile || await getOrSyncUserProfile(req.user!.id, req.user!.email);
    const result = await atomicIncrementQuota(req.user!.id, 'ai', 3, profile.plan === 'pro');
    if (!result.allowed) {
      res.status(403).json({
        error: 'AI operations daily quota exceeded. Free users are limited to 3 AI operations per day. Please upgrade to Pro for unlimited AI-powered tools.'
      });
      return null;
    }
    const aiQuota = {
      plan: profile.plan,
      aiUsedToday: result.ai_count_today,
      aiLeft: profile.plan === 'free' ? Math.max(0, 3 - result.ai_count_today) : 9999
    };
    (req as any).aiQuota = aiQuota;
    return aiQuota;
  } catch (err: any) {
    console.error('Failed to record AI quota after a successful AI call:', err);
    res.status(503).json({
      error: err instanceof EntitlementLookupError
        ? err.message
        : 'Could not verify AI usage quota right now. Please try again in a moment.'
    });
    return null;
  }
}

// --- Fine-grained quota helpers (audit, Aug 2026) ---
// /api/copilot/command and /api/pdf/edit-text were previously guarded by the
// blanket `enforceAiQuota` middleware above, which unconditionally burns one
// of the user's 3 free daily AI operations on EVERY request to those routes
// — even for copilot commands that never call Gemini at all (brightness /
// darken / grayscale / rotate filter toggles, or a title change resolved
// entirely by local regex) and even for /api/pdf/edit-text, which is a pure
// pdf-lib text-overlay compile step with NO AI call anywhere in it. A free
// user rotating a page 3 times, or just exporting their edited PDF, would
// see "AI quota exceeded" and be blocked from using any *real* AI feature
// that day, despite never having used one. These two helpers let a route
// check/consume quota only on the code path that actually invokes Gemini.
// NOTE (audit, Aug 2026): `blocked` here is now purely INFORMATIONAL — it's
// a non-atomic, possibly-stale read used only to decide whether a
// route should even attempt a Gemini call in the first place (e.g. to
// avoid an unnecessary network round-trip). It is NOT the authoritative
// quota decision anymore. The authoritative check+increment happens
// atomically inside consumeAiQuota() below, at the exact moment quota is
// actually spent — so even if this read is stale under concurrent
// requests, the worst case is one extra call to consumeAiQuota() that
// then correctly reports `allowed: false`. It can never cause a bypass.
async function peekAiQuota(userId: string, authEmail?: string) {
  const profile = await getOrSyncUserProfile(userId, authEmail);
  const geminiConfigured = !!getGemini();
  const blocked = geminiConfigured && profile.plan === 'free' && profile.ai_count_today >= 3;
  return {
    profile,
    geminiConfigured,
    blocked,
    aiQuota: {
      plan: profile.plan,
      aiUsedToday: profile.ai_count_today,
      aiLeft: profile.plan === 'free' ? Math.max(0, 3 - profile.ai_count_today) : 9999
    }
  };
}

/**
 * Authoritative, atomic quota spend. Callers MUST check `.allowed` on the
 * result and refuse to proceed (403) if it's false — this is where the
 * race-condition fix actually lives (see atomicIncrementQuota()).
 */
async function consumeAiQuota(userId: string, profile: { plan: 'free' | 'pro'; uploads_count_today: number; ai_count_today: number }) {
  const result = await atomicIncrementQuota(userId, 'ai', 3, profile.plan === 'pro');
  return {
    allowed: result.allowed,
    plan: profile.plan,
    aiUsedToday: result.ai_count_today,
    aiLeft: profile.plan === 'free' ? Math.max(0, 3 - result.ai_count_today) : 9999
  };
}

/**
 * Reusable admin check (used by requireAdmin and by the per-file /uploads
 * ownership route below).
 */
async function checkIsAdmin(userId: string): Promise<boolean> {
  const isProduction = isProductionLike();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data: userRow, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!error && userRow && (userRow.is_admin === true || userRow.role === 'admin')) {
        return true;
      }
    } catch (err) {
      console.error('Failed verification of admin permissions via Supabase:', err);
    }
  }

  if (!isProduction) {
    if (userId === 'admin-user-id') return true;
    const localDB = loadLocalDB();
    const localUser = localDB.users.find(u => u.id === userId);
    if (
      localUser &&
      ((localUser as any).is_admin === true ||
        (localUser as any).role === 'admin' ||
        localUser.email?.toLowerCase() === 'admin@easypdf.com')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Track which user owns which uploaded/generated file, so the /uploads
 * route below can enforce per-file ownership instead of serving the whole
 * directory publicly.
 */
function recordFileOwnership(fileId: string, userId: string, fileName: string, fileUrl: string) {
  const localDB = loadLocalDB();
  localDB.files.push({
    id: fileId,
    userId,
    fileName,
    fileUrl,
    uploadedAt: new Date().toISOString()
  });
  saveLocalDB(localDB);
}

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

// Per-file, ownership-checked replacement for the old public
// express.static() /uploads route. Denies access by default when no
// ownership record exists; admins can access any file.
app.get('/uploads/:filename', authenticateUser, asyncRoute(async (req, res) => {
  const filename = path.basename(req.params.filename); // defend against traversal
  const filePath = path.join(uploadDir, filename);
  const publicUrl = `/uploads/${filename}`;

  const userId = req.user!.id;
  const isAdmin = await checkIsAdmin(userId);

  if (!isAdmin) {
    const localDB = loadLocalDB();
    const ownsFile = localDB.files.some(f => f.fileUrl === publicUrl && f.userId === userId);

    let ownsInSupabase = false;
    const supabase = getSupabase();
    if (!ownsFile && supabase) {
      try {
        const { data } = await supabase
          .from('uploaded_files')
          .select('user_id')
          .eq('file_url', publicUrl)
          .maybeSingle();
        ownsInSupabase = !!data && data.user_id === userId;
      } catch (e) {
        console.warn('Error checking uploaded_files ownership in Supabase:', e);
      }
    }

    // Deny by default when no ownership record exists at all.
    if (!ownsFile && !ownsInSupabase) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this file.' });
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = UPLOAD_CONTENT_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  // Force download for anything we don't explicitly recognize as safe to
  // render inline, to prevent stored-XSS via a mislabeled/renamed upload.
  if (!UPLOAD_CONTENT_TYPES[ext]) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  return res.sendFile(filePath);
}))

// NOTE: The legacy `/api/auth/signup` and `/api/auth/login` proxy endpoints
// that used to live here have been REMOVED (security audit, Aug 2026).
// They were dead code — the frontend has always authenticated directly
// against Supabase Auth via the browser SDK (see src/components/AuthModal.tsx,
// which calls `supabase.auth.signUp` / `supabase.auth.signInWithPassword`
// directly) — and the login variant contained a critical authentication
// bypass: if `supabase.auth.signInWithPassword` failed for ANY reason
// (including a simply wrong password), it fell back to looking the email up
// in `db_fallback.json` and returned `success: true` with the user's
// id/plan WITHOUT ever checking the password. Do not re-add a
// password-checking code path here; all password verification must go
// through Supabase Auth (`supabase.auth.signInWithPassword` /
// `supabase.auth.signUp`) and nowhere else in this codebase.

// 2) STRIPE checkout routes
app.post('/api/stripe/checkout', authenticateUser, authRateLimiter, asyncRoute(async (req, res) => {
  const userId = req.user!.id;
  const isProduction = process.env.NODE_ENV === 'production';

  // Centralized subscription ON/OFF switch (Admin Dashboard → Settings).
  // This is the actual server-side enforcement point: even if a client
  // bypasses the Pricing/Checkout UI and calls this endpoint directly, no
  // Stripe Checkout Session (real or mock) is created while disabled.
  if (!(await loadSubscriptionEnabled())) {
    return res.status(403).json({ error: 'Subscriptions are currently disabled by the administrator.' });
  }

  const stripe = getStripe();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  if (!stripe) {
    if (isProduction) {
      return res.status(500).json({ error: 'Stripe payments service is unconfigured in production' });
    }
    // Simulated billing checkout link for local dev ONLY (isProduction is
    // false here). NOTE (audit, Aug 2026): this redirects straight to
    // /checkout-success with no real payment gateway involved — the plan
    // is NOT actually upgraded by this path (no Stripe webhook ever fires
    // for a mock_stripe_ session id), so CheckoutSuccessOverlay's polling
    // will correctly show "still confirming" rather than falsely claiming
    // a payment succeeded. This exists purely so the checkout UI is
    // click-through-able without live Stripe keys during local dev.
    const mockCheckoutUrl = `${appUrl}/checkout-success?session_id=mock_stripe_${Date.now()}&userId=${userId}`;
    console.log('Stripe not configured. Returning simulated Stripe billing URL:', mockCheckoutUrl);
    return res.json({ url: mockCheckoutUrl });
  }

  try {
    // Get user email
    const localDB = loadLocalDB();
    const user = localDB.users.find(u => u.id === userId);
    const email = user ? user.email : req.user?.email;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Easy PDF Pro Subscription',
              description: 'Access unlimited PDF compile operations and fast AI summaries.',
            },
            unit_amount: 999, // $9.99
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}&userId=${userId}`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { userId },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    // Security fix (Aug 2026 audit): raw Stripe SDK error messages were
    // returned directly to the client. These are usually safe, but Stripe
    // can include account/configuration-specific detail in some error
    // paths (e.g. misconfigured price/product setup); log the full error
    // server-side and return a generic, safe message instead.
    console.error('Stripe Checkout Session creation error:', err);
    return res.status(500).json({ error: 'Could not start checkout right now. Please try again in a moment.' });
  }
}))

// In-memory idempotency cache for fast-path check
interface InMemEvent {
  status: 'processing' | 'completed' | 'failed';
  leaseExpiresMs: number;
}
const processedStripeEvents = new Map<string, InMemEvent>();
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours retention
setInterval(() => {
  const now = Date.now();
  for (const [eventId, item] of processedStripeEvents.entries()) {
    if (item.status === 'completed' && now - item.leaseExpiresMs > CLEANUP_INTERVAL_MS) {
      processedStripeEvents.delete(eventId);
    }
  }
}, 60 * 60 * 1000);

// Helper function to claim/check webhook event execution atomically across instances with lease timeout
async function claimStripeEvent(eventId: string, eventType: string, eventCreatedUnix?: number): Promise<{ claimGranted: boolean; isDuplicate: boolean }> {
  const eventCreatedAtIso = eventCreatedUnix 
    ? new Date(eventCreatedUnix * 1000).toISOString() 
    : new Date().toISOString();

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minute lease
  const leaseExpiresMs = nowMs + LEASE_DURATION_MS;
  const leaseExpiresIso = new Date(leaseExpiresMs).toISOString();

  // Fast-path in-memory check
  const inMem = processedStripeEvents.get(eventId);
  if (inMem) {
    if (inMem.status === 'completed') {
      return { claimGranted: false, isDuplicate: true };
    }
    if (inMem.status === 'processing' && inMem.leaseExpiresMs > nowMs) {
      return { claimGranted: false, isDuplicate: true };
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. Attempt atomic insert
      const { error: insertErr } = await supabase.from('stripe_events').insert([{
        event_id: eventId,
        event_type: eventType,
        event_created_at: eventCreatedAtIso,
        status: 'processing',
        claimed_at: nowIso,
        lease_expires_at: leaseExpiresIso,
        processed_at: nowIso
      }]);

      if (!insertErr) {
        processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs });
        return { claimGranted: true, isDuplicate: false };
      }

      // Unique constraint violation (duplicate primary key event_id)
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique') || insertErr.message?.includes('already exists')) {
        const { data: existing } = await supabase
          .from('stripe_events')
          .select('status, lease_expires_at')
          .eq('event_id', eventId)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'completed') {
            processedStripeEvents.set(eventId, { status: 'completed', leaseExpiresMs: 0 });
            return { claimGranted: false, isDuplicate: true };
          }

          const existingLeaseMs = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
          if (existing.status === 'processing' && existingLeaseMs > nowMs) {
            processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs: existingLeaseMs });
            return { claimGranted: false, isDuplicate: true };
          }

          // Expired lease or status === 'failed': attempt atomic compare-and-swap
          // reclaim. Each UPDATE only matches when the row is STILL in the
          // exact expected pre-state, so two concurrent workers can never both
          // take ownership of the same expired event: the first UPDATE flips
          // the row to a fresh future lease / status 'processing', which makes
          // the second worker's identically-filtered UPDATE match 0 rows.
          //   - Path A: row is 'processing' with a now-expired lease
          //     (lease_expires_at < now). A NULL/absent lease timestamp does
          //     NOT match the < comparison — conservative by design.
          //   - Path B: row is 'failed' outright (retryable).
          const reclaimFields = {
            status: 'processing',
            claimed_at: nowIso,
            lease_expires_at: leaseExpiresIso,
            processed_at: nowIso
          };
          let reclaimedRows: any[] | null = null;

          const { data: reclaimProcessing } = await supabase
            .from('stripe_events')
            .update(reclaimFields)
            .eq('event_id', eventId)
            .eq('status', 'processing')
            .lt('lease_expires_at', nowIso)
            .select();
          if (reclaimProcessing && reclaimProcessing.length > 0) {
            reclaimedRows = reclaimProcessing;
          } else {
            const { data: reclaimFailed } = await supabase
              .from('stripe_events')
              .update(reclaimFields)
              .eq('event_id', eventId)
              .eq('status', 'failed')
              .select();
            if (reclaimFailed && reclaimFailed.length > 0) {
              reclaimedRows = reclaimFailed;
            }
          }

          if (reclaimedRows && reclaimedRows.length > 0) {
            processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs });
            return { claimGranted: true, isDuplicate: false };
          }
        }
        return { claimGranted: false, isDuplicate: true };
      }
    } catch (err: any) {
      console.warn('Error claiming stripe_event in Supabase:', err.message);
    }
  }

  // Fallback to local DB persistence
  const localDB = loadLocalDB();
  localDB.stripeEvents = localDB.stripeEvents || [];
  const existingIdx = localDB.stripeEvents.findIndex((e) => e.event_id === eventId);
  if (existingIdx !== -1) {
    const existing = localDB.stripeEvents[existingIdx];
    if (existing.status === 'completed') {
      processedStripeEvents.set(eventId, { status: 'completed', leaseExpiresMs: 0 });
      return { claimGranted: false, isDuplicate: true };
    }
    const existingLeaseMs = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
    if (existing.status === 'processing' && existingLeaseMs > nowMs) {
      processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs: existingLeaseMs });
      return { claimGranted: false, isDuplicate: true };
    }

    // Reclaim expired lease or failed event
    localDB.stripeEvents[existingIdx] = {
      ...existing,
      status: 'processing',
      claimed_at: nowIso,
      lease_expires_at: leaseExpiresIso,
      processed_at: nowIso
    };
    saveLocalDB(localDB);
    processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs });
    return { claimGranted: true, isDuplicate: false };
  }

  localDB.stripeEvents.push({
    event_id: eventId,
    event_type: eventType,
    event_created_at: eventCreatedAtIso,
    status: 'processing',
    claimed_at: nowIso,
    lease_expires_at: leaseExpiresIso,
    processed_at: nowIso
  });
  saveLocalDB(localDB);
  processedStripeEvents.set(eventId, { status: 'processing', leaseExpiresMs });
  return { claimGranted: true, isDuplicate: false };
}

// Helper to finalize event processing status
async function finalizeStripeEvent(eventId: string, success: boolean) {
  const nowIso = new Date().toISOString();
  const supabase = getSupabase();
  if (supabase) {
    try {
      if (success) {
        await supabase.from('stripe_events').update({ status: 'completed', processed_at: nowIso }).eq('event_id', eventId);
      } else {
        await supabase.from('stripe_events').update({ status: 'failed', processed_at: nowIso }).eq('event_id', eventId);
      }
    } catch (err: any) {
      console.warn('Error finalizing stripe_event in Supabase:', err.message);
    }
  }

  const localDB = loadLocalDB();
  if (localDB.stripeEvents) {
    const idx = localDB.stripeEvents.findIndex((e) => e.event_id === eventId);
    if (idx !== -1) {
      localDB.stripeEvents[idx].status = success ? 'completed' : 'failed';
      saveLocalDB(localDB);
    }
  }

  if (success) {
    processedStripeEvents.set(eventId, { status: 'completed', leaseExpiresMs: 0 });
  } else {
    processedStripeEvents.set(eventId, { status: 'failed', leaseExpiresMs: 0 });
  }
}

// Helper to check whether an incoming Stripe event is out-of-order/stale
async function isStaleStripeEvent(userId: string | null, subscriptionId: string | null, eventCreatedUnix: number): Promise<boolean> {
  if (!eventCreatedUnix) return false;
  const supabase = getSupabase();

  if (subscriptionId && supabase) {
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('last_event_created_at')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (existingSub && existingSub.last_event_created_at) {
      const storedTime = new Date(existingSub.last_event_created_at).getTime();
      const incomingTime = eventCreatedUnix * 1000;
      if (incomingTime < storedTime) {
        console.warn(`Stale Stripe event detected for sub ${subscriptionId} (Incoming: ${new Date(incomingTime).toISOString()} < Stored: ${existingSub.last_event_created_at}). Skipping state mutation.`);
        return true;
      }
    }
  }

  // Fallback check against localDB
  if (subscriptionId) {
    const localDB = loadLocalDB();
    const localSub = localDB.subscriptions?.find((s) => s.stripe_subscription_id === subscriptionId);
    if (localSub && localSub.last_event_created_at) {
      const storedTime = new Date(localSub.last_event_created_at).getTime();
      const incomingTime = eventCreatedUnix * 1000;
      if (incomingTime < storedTime) {
        console.warn(`Stale Stripe event detected in localDB for sub ${subscriptionId}. Skipping.`);
        return true;
      }
    }
  }

  return false;
}

// Helper to upsert a specific subscription record targeted by stripe_subscription_id
const updateSubscriptionRecord = async (userId: string, subId: string, customerId: string | undefined, status: string, eventCreatedIso: string) => {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  if (supabase && subId) {
    try {
      await supabase.from('subscriptions').upsert([{
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
        status: status,
        last_event_created_at: eventCreatedIso,
        updated_at: nowIso,
        created_at: nowIso
      }], { onConflict: 'stripe_subscription_id' });
    } catch (err: any) {
      console.error(`Error upserting subscription record ${subId} in Supabase:`, err);
    }
  }

  const localDB = loadLocalDB();
  localDB.subscriptions = localDB.subscriptions || [];
  const idx = localDB.subscriptions.findIndex(s => s.stripe_subscription_id === subId);
  if (idx !== -1) {
    localDB.subscriptions[idx].status = status;
    localDB.subscriptions[idx].user_id = userId;
    if (customerId) localDB.subscriptions[idx].stripe_customer_id = customerId;
    localDB.subscriptions[idx].last_event_created_at = eventCreatedIso;
    localDB.subscriptions[idx].updated_at = nowIso;
  } else {
    localDB.subscriptions.push({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subId,
      status: status,
      last_event_created_at: eventCreatedIso,
      created_at: nowIso,
      updated_at: nowIso
    });
  }
  saveLocalDB(localDB);
};

// Stripe webhook handler
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const stripe = getStripe();
  if (!stripe) {
    return res.status(400).send('Stripe client not configured');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event: any;

  if (isProduction) {
    if (!webhookSecret) {
      console.error('Stripe webhook error: Missing STRIPE_WEBHOOK_SECRET in production');
      return res.status(500).send('Webhook secret unconfigured');
    }
    if (!sig) {
      console.error('Stripe webhook error: Missing stripe-signature header in production');
      return res.status(400).send('Missing stripe-signature header');
    }
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // Development fallback
    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error('Stripe webhook parsing error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      try {
        const body = JSON.parse(req.body.toString());
        event = body;
      } catch (err: any) {
        return res.status(400).send('Invalid JSON payload');
      }
    }
  }

  // Idempotency check across multi-instance & persistent storage
  const eventId = event.id;
  const eventType = event.type;
  const eventCreatedUnix = event.created || Math.floor(Date.now() / 1000);
  const eventCreatedAtIso = new Date(eventCreatedUnix * 1000).toISOString();

  if (eventId) {
    const { claimGranted, isDuplicate } = await claimStripeEvent(eventId, eventType, eventCreatedUnix);
    if (isDuplicate || !claimGranted) {
      console.log(`Stripe webhook event ${eventId} already processed/claimed. Skipping duplicate execution.`);
      return res.json({ received: true, deduplicated: true });
    }
  }

  const supabase = getSupabase();
  let processSuccess = false;

  // Helper to map Stripe event/object to userId using server-side trusted sources
  const resolveUserId = async (dataObject: any): Promise<string | null> => {
    // 1. Check metadata or client_reference_id
    if (dataObject.metadata?.userId) return dataObject.metadata.userId;
    if (dataObject.client_reference_id) return dataObject.client_reference_id;

    // 2. Lookup via customer ID in Supabase subscriptions
    const customerId = dataObject.customer;
    if (customerId && supabase) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      if (sub?.user_id) return sub.user_id;
    }

    // 3. Lookup via subscription ID in Supabase subscriptions
    const subId = dataObject.subscription || dataObject.id;
    if (subId && supabase) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subId)
        .maybeSingle();
      if (sub?.user_id) return sub.user_id;
    }

    // 4. Lookup via localDB subscriptions
    const localDB = loadLocalDB();
    if (localDB.subscriptions) {
      const found = localDB.subscriptions.find(s => 
        (customerId && s.stripe_customer_id === customerId) ||
        (subId && s.stripe_subscription_id === subId)
      );
      if (found?.user_id) return found.user_id;
    }

    return null;
  };

  const syncUserPlanAfterWebhook = async (userId: string) => {
    const { plan: finalPlan } = await calculateEntitlementForUser(userId);

    const localDB = loadLocalDB();
    const userIdx = localDB.users.findIndex(u => u.id === userId);
    if (userIdx !== -1) {
      localDB.users[userIdx].plan = finalPlan;
      saveLocalDB(localDB);
    }

    if (supabase) {
      const { error } = await supabase.from('users').update({ plan: finalPlan }).eq('id', userId);
      if (error) console.error(`Error updating plan to ${finalPlan} in Supabase for user ${userId}:`, error);
    }
  };

  try {
    // Event handling matrix
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = await resolveUserId(session);
        const subId = session.subscription || null;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || undefined;

        if (userId) {
          const isStale = await isStaleStripeEvent(userId, subId, eventCreatedUnix);
          if (isStale) {
            console.log(`Webhook [checkout.session.completed]: Ignoring stale event for user ${userId}`);
          } else {
            let targetStatus = 'active';

            // Authoritative Stripe API re-fetch for same-second safety and verified state
            if (subId && stripe) {
              try {
                const realSub = await stripe.subscriptions.retrieve(subId);
                if (realSub) targetStatus = realSub.status;
              } catch (err: any) {
                console.warn(`Stripe API sub retrieve notice for ${subId}:`, err.message);
              }
            }

            if (subId) {
              await updateSubscriptionRecord(userId, subId, customerId, targetStatus, eventCreatedAtIso);
            }
            await syncUserPlanAfterWebhook(userId);
          }
        } else {
          console.warn('Webhook [checkout.session.completed]: Could not resolve userId');
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const userId = await resolveUserId(invoice);
        const subId = invoice.subscription || null;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || undefined;

        if (userId) {
          const isStale = await isStaleStripeEvent(userId, subId, eventCreatedUnix);
          if (isStale) {
            console.log(`Webhook [invoice.payment_succeeded]: Ignoring stale event for user ${userId}`);
          } else {
            let targetStatus = 'active';

            if (subId && stripe) {
              try {
                const realSub = await stripe.subscriptions.retrieve(subId);
                if (realSub) targetStatus = realSub.status;
              } catch (err: any) {
                console.warn(`Stripe API sub retrieve notice for ${subId}:`, err.message);
              }
            }

            if (subId) {
              await updateSubscriptionRecord(userId, subId, customerId, targetStatus, eventCreatedAtIso);
            }
            await syncUserPlanAfterWebhook(userId);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = await resolveUserId(invoice);
        const subId = invoice.subscription || null;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || undefined;

        if (userId) {
          const isStale = await isStaleStripeEvent(userId, subId, eventCreatedUnix);
          if (isStale) {
            console.log(`Webhook [invoice.payment_failed]: Ignoring stale event for user ${userId}`);
          } else {
            let targetStatus = 'past_due';

            if (subId && stripe) {
              try {
                const realSub = await stripe.subscriptions.retrieve(subId);
                if (realSub) targetStatus = realSub.status;
              } catch (err: any) {
                console.warn(`Stripe API sub retrieve notice for ${subId}:`, err.message);
              }
            }

            if (subId) {
              await updateSubscriptionRecord(userId, subId, customerId, targetStatus, eventCreatedAtIso);
            }
            await syncUserPlanAfterWebhook(userId);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = await resolveUserId(sub);
        const subId = sub.id;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || undefined;

        if (userId) {
          const isStale = await isStaleStripeEvent(userId, subId, eventCreatedUnix);
          if (isStale) {
            console.log(`Webhook [${event.type}]: Ignoring stale event for user ${userId}`);
          } else {
            let targetStatus = sub.status;

            if (subId && stripe) {
              try {
                const realSub = await stripe.subscriptions.retrieve(subId);
                if (realSub) targetStatus = realSub.status;
              } catch (err: any) {
                console.warn(`Stripe API sub retrieve notice for ${subId}:`, err.message);
              }
            }

            if (subId) {
              await updateSubscriptionRecord(userId, subId, customerId, targetStatus, eventCreatedAtIso);
            }
            await syncUserPlanAfterWebhook(userId);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = await resolveUserId(sub);
        const subId = sub.id;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || undefined;

        if (userId) {
          const isStale = await isStaleStripeEvent(userId, subId, eventCreatedUnix);
          if (isStale) {
            console.log(`Webhook [customer.subscription.deleted]: Ignoring stale event for user ${userId}`);
          } else {
            let targetStatus = 'canceled';

            if (subId && stripe) {
              try {
                const realSub = await stripe.subscriptions.retrieve(subId);
                if (realSub) targetStatus = realSub.status;
              } catch (err: any) {
                if (err.statusCode === 404 || err.message?.includes('No such subscription')) {
                  targetStatus = 'canceled';
                }
              }
            }

            if (subId) {
              await updateSubscriptionRecord(userId, subId, customerId, targetStatus, eventCreatedAtIso);
            }
            await syncUserPlanAfterWebhook(userId);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe webhook event type: ${event.type}`);
    }

    processSuccess = true;
  } catch (err: any) {
    console.error(`Error processing Stripe webhook event ${eventId}:`, err);
    processSuccess = false;
  } finally {
    if (eventId) {
      await finalizeStripeEvent(eventId, processSuccess);
    }
  }

  if (!processSuccess) {
    return res.status(500).send('Error processing webhook event');
  }

  return res.json({ received: true });
});

// Proxy route for local test payments only (DISABLED in production)
app.post('/api/stripe/simulate-pro', authenticateUser, authRateLimiter, asyncRoute(async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return res.status(403).json({ error: 'Forbidden: Pro plan simulation is strictly disabled in production' });
  }

  const userId = req.user!.id;

  const localDB = loadLocalDB();
  const userIdx = localDB.users.findIndex(u => u.id === userId);
  if (userIdx !== -1) {
    localDB.users[userIdx].plan = 'pro';
    saveLocalDB(localDB);
    
    // Attempt Supabase sync
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('users').update({ plan: 'pro' }).eq('id', userId);
    }

    return res.json({ success: true, plan: 'pro' });
  }

  return res.status(404).json({ error: 'User not found in local system' });
}))

// 3) PDF UPLOAD SYSTEM & USAGE LIMITS
app.post('/api/pdf/upload', authenticateUser, uploadRateLimiter, (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      // multer / fileFilter errors (bad type, too large, etc.) — respond with
      // clean JSON instead of letting Express's default HTML error page leak through.
      return res.status(400).json({ error: err.message || 'File upload rejected.' });
    }
    next();
  });
}, asyncRoute(async (req, res) => {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No PDF file was provided' });
  }

  // Magic-byte check: reject content that doesn't match its declared type
  // BEFORE spending any quota or touching storage (see fileSignatureMatches
  // above for why the declared Content-Type alone can't be trusted).
  try {
    const head = Buffer.alloc(16);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    if (!fileSignatureMatches(head, file.mimetype)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ error: 'This file\'s content does not match its declared type. Please upload a real PDF, PNG, JPG, or WEBP file.' });
    }
  } catch (err) {
    console.error('Failed to verify uploaded file signature:', err);
    fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'The uploaded file could not be read. Please try again.' });
  }

  // Plan lookup (Supabase is authoritative in production; a lookup failure
  // throws EntitlementLookupError -> 503 via the global error handler). The
  // actual check+increment below is atomic.
  const profile = await getOrSyncUserProfile(userId, req.user!.email);

  // Atomic check+increment (Free = 3/day, Pro = unlimited). Fixes the same
  // read-then-write race condition described in atomicIncrementQuota()'s
  // doc comment — this endpoint had the identical bug as the AI quota.
  let uploadQuota: AtomicQuotaResult;
  try {
    uploadQuota = await atomicIncrementQuota(userId, 'upload', 3, profile.plan === 'pro');
  } catch (err) {
    console.error('Failed to verify/increment upload quota:', err);
    return res.status(503).json({ error: 'Could not verify upload quota right now. Please try again in a moment.' });
  }

  if (!uploadQuota.allowed) {
    return res.status(403).json({
      error: 'Upload daily quota exceeded. Free users are limited to 3 PDF uploads per day. Please upgrade to Pro for unlimited operations.'
    });
  }

  // SECURITY: crypto-secure file id (Math.random is predictable and must not
  // identify stored user files) — matches /api/pdf/edit-text's id scheme.
  const fileId = 'file-' + crypto.randomBytes(8).toString('hex');
  const isProduction = process.env.NODE_ENV === 'production';
  let fileUrl: string;

  // Supabase DB / Storage Upload
  const supabase = getSupabase();
  if (supabase) {
    try {
      const fileBuffer = fs.readFileSync(file.path);
      const filePath = `pdfs/${userId}/${file.filename}`;

      // Upload to "documents" bucket as requested
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(filePath, fileBuffer, { contentType: file.mimetype });

      if (uploadErr) {
        // NOTE (security/reliability audit, Aug 2026): this used to silently
        // fall back to a local-disk fileUrl ("/uploads/...") and still
        // return { success: true }. On Vercel's serverless runtime that
        // local file lives under /tmp, which does NOT persist across
        // invocations — the very next request (a fresh function instance)
        // would 404 on that "successful" upload. Fail loudly instead,
        // mirroring the already-fixed /api/pdf/edit-text behavior, so a
        // misconfigured/missing "documents" Storage bucket is immediately
        // visible instead of masquerading as a working upload.
        console.error('Supabase storage upload error for /api/pdf/upload:', uploadErr);
        if (isProduction) {
          fs.unlink(file.path, () => {});
          return res.status(502).json({
            error: 'The file was received but could not be saved to permanent storage. Please try again in a moment, or contact support if this persists.'
          });
        }
        // Local-dev-only fallback (no working Supabase Storage locally).
        fileUrl = `/uploads/${file.filename}`;
      } else {
        // Security fix (Aug 2026 audit): this used to fall back to
        // getPublicUrl() whenever createSignedUrl() failed for any reason,
        // and — more subtly — getPublicUrl() ALWAYS succeeds and returns a
        // URL regardless of whether the bucket is actually Private, even
        // when a signed URL was obtained successfully right above it. The
        // uploaded PDF path is predictable (`pdfs/{userId}/{filename}`),
        // so if the "documents" bucket is ever misconfigured as Public in
        // the Supabase dashboard, that public URL would let ANYONE with
        // the URL pattern read another user's uploaded PDF, completely
        // bypassing the per-file ownership check this app relies on
        // elsewhere (see the /uploads/:filename route). A signed URL, by
        // contrast, is only usable because of its unguessable token and
        // expires after 24h regardless of bucket visibility settings.
        //
        // Fix: only ever generate/use a signed URL for the file the
        // response is built from. getPublicUrl() is no longer called at
        // all in production — if the signed URL can't be created, that is
        // treated as a real storage failure (fail loudly), not silently
        // downgraded to a possibly-public link.
        const { data: signedData, error: signedUrlErr } = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 60 * 60 * 24); // 24-hour expiry

        if (signedData?.signedUrl) {
          fileUrl = signedData.signedUrl;
        } else if (isProduction) {
          console.error('Failed to create signed URL for uploaded file:', signedUrlErr);
          fs.unlink(file.path, () => {});
          return res.status(502).json({
            error: 'The file was saved, but a secure download link could not be generated. Please try again in a moment, or contact support if this persists.'
          });
        } else {
          // Local-dev-only convenience fallback: some local/test Supabase
          // projects use a public test bucket. This path is intentionally
          // NEVER reached in production (see the isProduction branch
          // above), so it cannot expose real users' files.
          console.warn('[dev-only] createSignedUrl failed; falling back to getPublicUrl() for local testing:', signedUrlErr);
          const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(filePath);
          fileUrl = publicUrlData.publicUrl;
        }
      }

      // Save file record to Supabase table (best-effort — storage write, if
      // it succeeded above, already produced a usable fileUrl regardless of
      // whether this insert succeeds).
      const { error: dbError } = await supabase.from('uploaded_files').insert([{
        id: fileId,
        user_id: userId,
        file_name: file.originalname,
        file_url: fileUrl,
        uploaded_at: new Date().toISOString()
      }]);
      if (dbError) {
        console.warn('File stored, but failed to record it in uploaded_files:', dbError);
      }
    } catch (err) {
      console.error('Unexpected error during Supabase upload flow:', err);
      if (isProduction) {
        fs.unlink(file.path, () => {});
        return res.status(502).json({
          error: 'The file was received but could not be saved to permanent storage. Please try again in a moment, or contact support if this persists.'
        });
      }
      fileUrl = `/uploads/${file.filename}`;
    }
  } else if (isProduction) {
    // No durable storage backend available in production — do not fall back
    // to local disk, since it would silently produce a download link that is
    // likely to 404 once this serverless invocation ends.
    fs.unlink(file.path, () => {});
    return res.status(503).json({
      error: 'Cloud storage is not configured on the server, so the file cannot be saved. Please contact support.'
    });
  } else {
    // Local-dev-only fallback (no Supabase configured locally).
    fileUrl = `/uploads/${file.filename}`;
  }

  // Local temp file cleanup (Sep 2026 fix): this used to only run on ONE
  // specific success path — every other exit above now cleans up right
  // before its own `return`, and every path that reaches THIS point
  // (successful signed-URL upload, or a local-dev fallback) is cleaned up
  // here, once, instead of leaking the file under uploads/ (or /tmp on
  // Vercel, which is at least ephemeral there, but still unnecessary).
  fs.unlink(file.path, (unlinkErr) => {
    if (unlinkErr && (unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to clean up local temporary file:', unlinkErr);
    }
  });

  const localDB = loadLocalDB();
  const newFileRecord: LocalFile = {
    id: fileId,
    userId,
    fileName: file.originalname,
    fileUrl,
    uploadedAt: new Date().toISOString()
  };
  localDB.files.push(newFileRecord);
  saveLocalDB(localDB);

  return res.json({
    success: true,
    fileId,
    fileUrl: fileUrl,
    fileName: file.originalname,
    uploadsLeft: profile.plan === 'free' ? Math.max(0, 3 - uploadQuota.uploads_count_today) : 9999
  });
}));

// 4) AI FEATURE: SUMMARIZE PDF
app.post('/api/summarize', authenticateUser, aiRateLimiter, enforceAiQuota, asyncRoute(async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    // Validation failure: enforceAiQuota only peeked, so nothing was charged.
    return res.status(400).json({ error: 'Text content is required for summarization' });
  }

  const profile: UserProfileSummary = (req as any).aiProfile;

  // Call Gemini API using modern @google/genai SDK
  const gemini = getGemini();
  if (gemini) {
    // Quota is charged only AFTER Gemini returns a usable summary (see the
    // doc comment on enforceAiQuota). A Gemini failure or empty answer
    // costs the user nothing and is reported as an error, never as a fake
    // successful summary.
    let resultText: string | undefined;
    try {
      console.log('Requesting summary from Gemini for text length:', text.length);
      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Please read the following extracted PDF text carefully. Extract a high-quality summary of the content, followed by a list of 5-8 bulleted Key Points. Format the response beautifully using Markdown with clear headings:\n\nExtracted PDF text:\n"""\n${text}\n"""`,
      });
      resultText = typeof response.text === 'string' ? response.text.trim() : undefined;
    } catch (err: any) {
      console.error('Gemini API call failed for /api/summarize:', err);
      return res.status(502).json({ error: 'The AI service could not summarize this document right now. You were not charged. Please try again in a moment.' });
    }

    if (!resultText) {
      console.error('Gemini returned an empty summary for /api/summarize');
      return res.status(502).json({ error: 'The AI service returned an empty summary. You were not charged. Please try again.' });
    }

    const aiQuota = await spendAiQuotaOrRespond(req, res);
    if (!aiQuota) return; // 403 / 503 already sent; the summary is not delivered
    return res.json({
      success: true,
      summary: resultText,
      aiUsedToday: aiQuota.aiUsedToday,
      aiLeft: aiQuota.aiLeft
    });
  } else {
    // If Gemini key is missing, return a beautiful smart mock-AI summary so previewing works perfectly
    console.log('Gemini client not initialized. Generating high-quality simulated summary.');
    const mockSummary = `## 📄 Automated Document Summary (Simulated Node)\n\n*Your Gemini API key is not configured in Secrets. This is a fully detailed smart fallback simulation of the Summary Engine:*\n\nThe uploaded document focuses on **optimizing enterprise data streams** and **modular document processing protocols**. It establishes clear criteria for reducing processing latency while safeguarding confidential metadata.\n\n### 🔑 Key Points\n- **Zero Server Footprint**: Emphasizes client-side orchestration to satisfy absolute data compliance requirements.\n- **Bento Visual Architecture**: Promotes elegant modern CSS layouts to structure document metrics.\n- **SaaS monetization pipeline**: Outlines simple subscription models to unlock priority file compilation speeds.\n- **Modular conversion matrices**: Suggests high-fidelity conversion pipelines from standard Office formats to secure PDF objects.\n\n---\n💡 *Configuring your **GEMINI_API_KEY** in **Settings > Secrets** will activate live, high-precision Gemini summaries instantly!*`;

    // Marked explicitly as `demo: true` (audit, Aug 2026) — this text is
    // generic placeholder copy, not a real summary of the user's document,
    // so the frontend must be able to tell the difference instead of
    // silently presenting it as if Gemini actually read the file.
    return res.json({
      success: true,
      demo: true,
      summary: mockSummary,
      aiUsedToday: profile.ai_count_today,
      aiLeft: profile.plan === 'free' ? Math.max(0, 3 - profile.ai_count_today) : 9999
    });
  }
}))

// 5) ADMIN PANEL APIs
// Self-service "my profile / my quota" endpoint. Regular (non-admin) users
// previously had no way to fetch their own usage numbers except by calling
// the admin-only /api/admin/users route, which always 403'd for them —
// this is what the frontend should call instead.
app.get('/api/user/me', authenticateUser, asyncRoute(async (req, res) => {
  try {
    const profile = await getOrSyncUserProfile(req.user!.id, req.user!.email);
    return res.json({
      id: req.user!.id,
      email: profile.email,
      plan: profile.plan,
      uploads_count_today: profile.uploads_count_today,
      ai_count_today: profile.ai_count_today,
      uploads_left: profile.plan === 'free' ? Math.max(0, 3 - profile.uploads_count_today) : 9999,
      ai_left: profile.plan === 'free' ? Math.max(0, 3 - profile.ai_count_today) : 9999
    });
  } catch (e) {
    console.error('Failed to load own profile:', e);
    if (e instanceof EntitlementLookupError) {
      return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: 'Failed to load profile' });
  }
}))

// ---------------------------------------------------------------------------
// Account deletion (Sep 2026)
// ---------------------------------------------------------------------------
// The Privacy page used to promise self-service, instant account deletion
// with no feature behind it at all. This is the real implementation, used
// by both the user's own "Delete my account" action and an admin deleting
// someone else's account — the exact same cleanup, just a different caller.
//
// IMPORTANT (documented, not silently assumed): this project confirmed
// service_role has SELECT/INSERT/UPDATE (deliberately NOT DELETE) on
// app_settings after an earlier "permission denied" incident there. Whether
// service_role also has DELETE on users/uploaded_files/subscriptions has
// NOT been separately confirmed on the live database. Every step below
// checks its own Supabase error explicitly and reports it — if a DELETE
// grant turns out to be missing here too, this fails loudly with that exact
// error (never a fake "your account was deleted").
interface AccountDeletionOutcome {
  ok: boolean;
  steps: { step: string; ok: boolean; error?: string }[];
}

async function deleteUserAccount(userId: string): Promise<AccountDeletionOutcome> {
  const supabase = getSupabase();
  const steps: AccountDeletionOutcome['steps'] = [];
  const record = (step: string, ok: boolean, error?: string) => steps.push({ step, ok, error });

  if (!supabase) {
    // Dev/local-only fallback: no real auth system to remove credentials
    // from, so this just removes the local records.
    const localDB = loadLocalDB();
    localDB.users = localDB.users.filter(u => u.id !== userId);
    if (localDB.subscriptions) localDB.subscriptions = localDB.subscriptions.filter(sub => sub.user_id !== userId);
    if ((localDB as any).files) (localDB as any).files = (localDB as any).files.filter((f: any) => f.user_id !== userId);
    saveLocalDB(localDB);
    record('local-dev-records', true);
    return { ok: true, steps };
  }

  // 1) Storage objects. Best-effort: a failure here is reported but does not
  // block removing the account itself (an orphaned file is recoverable by
  // hand; a user who asked to be deleted but is told "no" because of a
  // storage hiccup is a worse outcome).
  for (const prefix of [`pdfs/${userId}`, `edited/${userId}`]) {
    try {
      const { data: files, error: listErr } = await supabase.storage.from('documents').list(prefix);
      if (listErr) {
        record(`storage:list:${prefix}`, false, listErr.message);
        continue;
      }
      if (files && files.length > 0) {
        const paths = files.map(f => `${prefix}/${f.name}`);
        const { error: removeErr } = await supabase.storage.from('documents').remove(paths);
        record(`storage:remove:${prefix}`, !removeErr, removeErr?.message);
      } else {
        record(`storage:list:${prefix}`, true);
      }
    } catch (e: any) {
      record(`storage:${prefix}`, false, e?.message || String(e));
    }
  }

  // 2) & 3) Child rows before the parent `users` row, in case a foreign key
  // without ON DELETE CASCADE exists (unconfirmed either way — deleting
  // children first is safe regardless).
  try {
    const { error } = await supabase.from('uploaded_files').delete().eq('user_id', userId);
    record('table:uploaded_files', !error, error?.message);
  } catch (e: any) { record('table:uploaded_files', false, e?.message || String(e)); }

  try {
    const { error } = await supabase.from('subscriptions').delete().eq('user_id', userId);
    record('table:subscriptions', !error, error?.message);
  } catch (e: any) { record('table:subscriptions', false, e?.message || String(e)); }

  // 4) The users row.
  let usersRowDeleted = false;
  try {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    usersRowDeleted = !error;
    record('table:users', !error, error?.message);
  } catch (e: any) { record('table:users', false, e?.message || String(e)); }

  // 5) The actual auth identity (GoTrue Admin API — a different permission
  // surface than the PostgREST table grants above). Only attempted if the
  // users row was actually removed: deleting the auth identity FIRST (or
  // regardless of the row-delete outcome) can strand an orphaned
  // public.users row for someone who can no longer log in to ask about it —
  // an inconsistent half-deleted state. If the row delete failed, stop here
  // and report the failure instead.
  let authUserDeleted = false;
  if (usersRowDeleted) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      authUserDeleted = !error;
      record('auth:deleteUser', !error, error?.message);
    } catch (e: any) { record('auth:deleteUser', false, e?.message || String(e)); }
  }

  // The account is only truly gone once BOTH the row identifying it in our
  // own schema AND the auth identity are removed — anything else (storage,
  // child rows) is real cleanup but not the difference between "deleted"
  // and "still exists and can still log in".
  return { ok: usersRowDeleted && authUserDeleted, steps };
}

app.delete('/api/user/account', authenticateUser, asyncRoute(async (req, res) => {
  // Require an explicit, unambiguous confirmation in the body — this is a
  // irreversible, destructive action and must never fire from a stray click
  // or a retried request with an empty body.
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to permanently delete your account. This cannot be undone.' });
  }

  const outcome = await deleteUserAccount(req.user!.id);
  if (!outcome.ok) {
    console.error(`Account deletion incomplete for ${req.user!.id}:`, outcome.steps);
    return res.status(500).json({
      error: 'Your account could not be fully deleted. Some data may have been removed, but your login still works. Please contact support.',
      steps: outcome.steps
    });
  }
  return res.json({ success: true, steps: outcome.steps });
}));

// ---------------------------------------------------------------------------
// Production-persistent admin settings (phase-2 hardening)
// ---------------------------------------------------------------------------
// Payment-method visibility previously lived ONLY in db_fallback.json — on
// Vercel that is /tmp, ephemeral AND per-instance, so admin toggles silently
// reverted and differed between concurrent instances. Settings now persist in
// the Supabase table public.app_settings (see supabase_app_settings.sql — a
// manual, idempotent, non-destructive migration). The local JSON file remains
// as a dev-only cache/fallback when Supabase isn't configured.
const PAYMENT_METHODS_KEY = 'payment_methods';
const DEFAULT_PAYMENT_METHODS: DBStructure['paymentMethods'] = {
  card: true, applepay: true, googlepay: true, paypal: true, bank: true
};

/**
 * Server-side validation/coercion: ONLY these five known keys are accepted,
 * and ONLY strict booleans are stored — no arbitrary client-shaped objects
 * ever reach persistence.
 */
function sanitizePaymentMethods(input: any): DBStructure['paymentMethods'] {
  return {
    card: input?.card === true,
    applepay: input?.applepay === true,
    googlepay: input?.googlepay === true,
    paypal: input?.paypal === true,
    bank: input?.bank === true
  };
}

async function loadPaymentMethods(): Promise<DBStructure['paymentMethods']> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', PAYMENT_METHODS_KEY)
        .maybeSingle();
      if (!error && data?.value && typeof data.value === 'object') {
        return sanitizePaymentMethods(data.value);
      }
      // PGRST116 = row absent (first run). Anything else is worth logging so
      // a missing migration (table does not exist) surfaces in Vercel logs.
      if (error && error.code !== 'PGRST116') {
        console.warn('app_settings read failed (is supabase_app_settings.sql applied?):', error.message);
      }
    } catch (e) {
      console.warn('app_settings read exception:', e);
    }
  }
  const localDB = loadLocalDB();
  return localDB.paymentMethods ?? { ...DEFAULT_PAYMENT_METHODS };
}

async function savePaymentMethods(pm: DBStructure['paymentMethods']): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: PAYMENT_METHODS_KEY, value: pm, updated_at: new Date().toISOString() }], { onConflict: 'key' });
    if (error) {
      console.error('app_settings upsert failed (is supabase_app_settings.sql applied?):', error.message);
    }
  }
  // Local cache kept in sync for dev/no-Supabase fallback reads.
  const localDB = loadLocalDB();
  localDB.paymentMethods = pm;
  saveLocalDB(localDB);
}

// Public: which payment methods are currently enabled. This is non-sensitive
// configuration the checkout page needs before/without admin rights —
// previously the checkout page called the admin-only GET route and silently
// swallowed the resulting 403.
app.get('/api/payment-methods', asyncRoute(async (_req, res) => {
  return res.json(await loadPaymentMethods());
}));

// ---------------------------------------------------------------------------
// Subscription master ON/OFF switch (single centralized control)
// ---------------------------------------------------------------------------
// The project owner has not finished configuring real Stripe payments yet.
// This setting lets an admin block subscription purchasing site-wide from
// the Admin Dashboard, without touching any Stripe/payment code, while
// leaving the free plan and all other functionality untouched. It reuses
// the same Supabase app_settings table/access pattern as the payment
// methods setting above (service-role only; see supabase_app_settings.sql).
const SUBSCRIPTION_ENABLED_KEY = 'subscription_enabled';

/**
 * Reads the master subscription switch.
 *
 * SAFE-DEFAULT / FAIL-CLOSED: if Supabase is unreachable, the row does not
 * exist yet (first run), or the stored value is malformed, this returns
 * `false` (subscriptions OFF) rather than risk silently allowing checkout
 * while real payment configuration is unconfirmed. This mirrors the
 * fail-closed pattern already used elsewhere in this file (e.g.
 * `/api/admin/users` refusing to fall back to fake local data in
 * production) rather than treating an error as a green light.
 */
async function loadSubscriptionEnabled(): Promise<boolean> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SUBSCRIPTION_ENABLED_KEY)
        .maybeSingle();
      if (!error && data?.value && typeof data.value === 'object') {
        return (data.value as any).enabled === true;
      }
      // PGRST116 = row absent (first run, before any admin has toggled this
      // yet) — that's expected and defaults to false below, not an error.
      if (error && error.code !== 'PGRST116') {
        console.warn('app_settings (subscription_enabled) read failed (is supabase_app_settings.sql applied?):', error.message);
      }
      return false;
    } catch (e) {
      console.warn('app_settings (subscription_enabled) read exception:', e);
      return false;
    }
  }
  // Dev/no-Supabase fallback only — never reached in a properly configured
  // production deployment (getSupabase() there always returns a client).
  const localDB = loadLocalDB();
  return localDB.subscriptionEnabled === true;
}

async function saveSubscriptionEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: SUBSCRIPTION_ENABLED_KEY, value: { enabled }, updated_at: new Date().toISOString() }], { onConflict: 'key' });
    if (error) {
      // Surface the failure to the caller instead of pretending it saved —
      // the admin route below relies on this throwing to report failure.
      console.error('app_settings (subscription_enabled) upsert failed (is supabase_app_settings.sql applied?):', error.message);
      throw new Error('Failed to persist subscription_enabled to Supabase');
    }
  }
  // Local cache kept in sync for dev/no-Supabase fallback reads.
  const localDB = loadLocalDB();
  localDB.subscriptionEnabled = enabled;
  saveLocalDB(localDB);
}

// Public: is subscription purchasing currently enabled? Non-sensitive — the
// Pricing and Checkout pages need this before/without any login.
app.get('/api/subscription-status', asyncRoute(async (_req, res) => {
  return res.json({ enabled: await loadSubscriptionEnabled() });
}));

// Admin-only: read/write the master subscription switch. Same
// authenticateUser + requireAdmin gate as every other admin route in this
// file — the client can never set this by itself, and requireAdmin
// re-verifies admin status server-side against Supabase on every call.
app.get('/api/admin/subscription-status', authenticateUser, requireAdmin, asyncRoute(async (_req, res) => {
  return res.json({ enabled: await loadSubscriptionEnabled() });
}));

app.post('/api/admin/subscription-status', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid value for "enabled": boolean expected.' });
  }

  try {
    await saveSubscriptionEnabled(enabled);
  } catch (e) {
    // Do not report success if the write did not actually persist — the
    // admin UI must not claim the state changed when it didn't.
    return res.status(500).json({ error: 'Failed to update subscription status. Please try again.' });
  }

  return res.json({ success: true, enabled });
}));

app.get('/api/admin/users', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const isProduction = isProductionLike();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data: dbUsers, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbUsers) {
        // Merge in real ban status from Supabase Auth (GoTrue) — there is no
        // "is this user disabled" column in our own schema, and adding one
        // would be an unconfirmed live migration. GoTrue's own ban_duration
        // already IS that state, with no schema change needed.
        let bannedIds = new Set<string>();
        try {
          const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          if (authErr) {
            console.error('Could not fetch ban status from Supabase Auth (users list will show as active):', authErr.message);
          } else {
            const now = Date.now();
            bannedIds = new Set(
              authList.users
                .filter(u => u.banned_until && new Date(u.banned_until).getTime() > now)
                .map(u => u.id)
            );
          }
        } catch (e) {
          console.error('Unexpected error fetching ban status from Supabase Auth:', e);
        }
        const withBanStatus = dbUsers.map(u => ({ ...u, banned: bannedIds.has(u.id) }));
        return res.json(withBanStatus);
      }

      // NOTE (Aug 2026 audit): this branch previously fell through to the
      // local fallback DB silently, with no logging at all — a Supabase
      // error here left zero trace in Vercel Logs while the Admin
      // Dashboard quietly showed fake local users instead of the real
      // ones. Log the actual reason so this is diagnosable going forward.
      console.error('Supabase returned no usable data for /api/admin/users:', error?.message || 'no rows returned');
    } catch (e) {
      console.error('Failed fetching users from Supabase for admin:', e);
    }
  } else {
    console.error('/api/admin/users: Supabase client is not configured.');
  }

  // Production must never show the local fallback DB's contents here —
  // it exists only for local development without Supabase configured.
  // Surfacing it in production would silently display fake/demo users
  // (e.g. admin@easypdf.com, demo@easypdf.com) as if they were real
  // Supabase accounts. Fail loudly instead.
  if (isProduction) {
    return res.status(503).json({ error: 'Unable to load users from Supabase. Please try again shortly.' });
  }

  const localDB = loadLocalDB();
  return res.json(localDB.users);
}))

app.post('/api/admin/update-plan', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { userId, plan } = req.body;
  if (!userId || !plan) {
    return res.status(400).json({ error: 'UserId and plan are required' });
  }
  // Security-audit fix (Aug 2026): `plan` was previously only checked for
  // truthiness, so any non-empty string was accepted and stored verbatim.
  // The only real consequence in practice is `admin_granted_pro`, which is
  // derived below purely from the strict `plan === 'pro'` comparison, but
  // an unrecognized value could still get written into `users.plan`/the
  // local DB and surface oddly in the UI. Restrict to the two real values.
  if (plan !== 'free' && plan !== 'pro') {
    return res.status(400).json({ error: "Invalid plan value. Must be 'free' or 'pro'." });
  }

  if (typeof userId !== 'string') {
    return res.status(400).json({ error: 'UserId must be a string' });
  }

  const isAdminPro = plan === 'pro';
  const supabase = getSupabase();

  if (supabase) {
    // Supabase is authoritative. The write result MUST be checked: this used
    // to ignore errors and report success even when nothing was saved.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('users')
      .update({ admin_granted_pro: isAdminPro })
      .eq('id', userId)
      .select('id');
    if (updateErr) {
      console.error(`update-plan: failed to save admin_granted_pro for ${userId}:`, updateErr);
      return res.status(500).json({ error: 'Failed to save the plan change. Nothing was changed.' });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return res.status(404).json({ error: 'User not found. Nothing was changed.' });
    }

    // Recalculate entitlement from Supabase (may throw -> 503, fail closed).
    const { plan: finalPlan } = await calculateEntitlementForUser(userId);
    const { error: planErr } = await supabase.from('users').update({ plan: finalPlan }).eq('id', userId);
    if (planErr) {
      console.error(`update-plan: failed to sync plan column for ${userId}:`, planErr);
      return res.status(500).json({ error: 'The Pro grant was saved, but the plan display column could not be synced. Please retry.' });
    }
    return res.json({ success: true, user: { id: userId, plan: finalPlan, admin_granted_pro: isAdminPro } });
  }

  // ---- Development / tests without Supabase: local JSON DB only ----
  const localDB = loadLocalDB();
  const idx = localDB.users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    localDB.users[idx].admin_granted_pro = isAdminPro;
    saveLocalDB(localDB);
  }
  const { plan: finalPlan } = await calculateEntitlementForUser(userId);
  if (idx !== -1) {
    localDB.users[idx].plan = finalPlan;
    saveLocalDB(localDB);
  }

  return res.json({ success: true, user: { id: userId, plan: finalPlan, admin_granted_pro: isAdminPro } });
}))

// ---------------------------------------------------------------------------
// Admin: ban / unban a user (Sep 2026)
// ---------------------------------------------------------------------------
// Replaces the old "Active/Disabled" toggle on the admin Users page, which
// only ever changed React state on that one page and saved nothing — it
// looked like it worked and did not. This uses Supabase Auth's own
// ban_duration (GoTrue Admin API), so a banned user is actually unable to
// sign in. No schema change: there is no "is_active" column anywhere, and
// none is added — the ban state IS the account's real Auth record, fetched
// fresh in /api/admin/users above rather than cached in our own tables.
app.post('/api/admin/users/:userId/ban', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { userId } = req.params;
  const { action } = req.body || {};
  if (action !== 'ban' && action !== 'unban') {
    return res.status(400).json({ error: "action must be 'ban' or 'unban'." });
  }
  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'You cannot ban your own account.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured, so banning is not available in this environment.' });
  }

  // A ~100-year duration is GoTrue's own documented way to express an
  // effectively permanent ban; 'none' lifts any existing ban.
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: action === 'ban' ? '876000h' : 'none'
  });
  if (error) {
    console.error(`Failed to ${action} user ${userId}:`, error);
    return res.status(500).json({ error: `Could not ${action} this user. Nothing was changed.` });
  }
  return res.json({ success: true, userId, banned: action === 'ban', banned_until: data.user?.banned_until ?? null });
}));

// ---------------------------------------------------------------------------
// Admin: delete another user's account (Sep 2026)
// ---------------------------------------------------------------------------
// Replaces the old "Delete" button on the admin Users page, which also only
// changed React state and saved nothing. Reuses the exact same cleanup as
// the user's own self-service deletion above. A destructive, irreversible
// action, so it requires the caller to type the TARGET's own email as
// confirmation (not a generic "DELETE" string) — a real safeguard against
// clicking the wrong row in a list.
app.delete('/api/admin/users/:userId', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { userId } = req.params;
  const { confirmEmail } = req.body || {};

  if (userId === req.user!.id) {
    return res.status(400).json({ error: 'Use your own account deletion, not this admin endpoint, to delete your own account.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured, so this is not available in this environment.' });
  }

  const { data: targetUser, error: lookupErr } = await supabase.from('users').select('id, email').eq('id', userId).maybeSingle();
  if (lookupErr) {
    console.error(`Admin delete: could not look up user ${userId}:`, lookupErr);
    return res.status(500).json({ error: 'Could not verify this user before deleting. Nothing was changed.' });
  }
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found. Nothing was changed.' });
  }
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== String(targetUser.email || '').trim().toLowerCase()) {
    return res.status(400).json({ error: "Type this user's exact email address to confirm deletion.", expectedEmail: targetUser.email });
  }

  const outcome = await deleteUserAccount(userId);
  if (!outcome.ok) {
    console.error(`Admin deletion incomplete for ${userId}:`, outcome.steps);
    return res.status(500).json({ error: 'This account could not be fully deleted. Some data may have been removed.', steps: outcome.steps });
  }
  return res.json({ success: true, steps: outcome.steps });
}));

// Admin payment methods toggles — persisted to Supabase app_settings
// (service-role write, admin-gated), with the local JSON file as dev cache.
app.get('/api/admin/payment-methods', authenticateUser, requireAdmin, asyncRoute(async (_req, res) => {
  return res.json(await loadPaymentMethods());
}));

app.post('/api/admin/payment-methods', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { card, applepay, googlepay, paypal, bank } = req.body ?? {};

  // Strict server-side validation: every field must be a real boolean.
  // Anything else is rejected instead of silently coerced.
  const provided: Record<string, any> = { card, applepay, googlepay, paypal, bank };
  for (const [key, value] of Object.entries(provided)) {
    if (value !== undefined && typeof value !== 'boolean') {
      return res.status(400).json({ error: `Invalid value for "${key}": boolean expected.` });
    }
  }

  const current = await loadPaymentMethods();
  const updated: DBStructure['paymentMethods'] = {
    card: card === undefined ? current.card : card,
    applepay: applepay === undefined ? current.applepay : applepay,
    googlepay: googlepay === undefined ? current.googlepay : googlepay,
    paypal: paypal === undefined ? current.paypal : paypal,
    bank: bank === undefined ? current.bank : bank
  };

  await savePaymentMethods(updated);
  return res.json({ success: true, paymentMethods: updated });
}));

// GET dynamic app translation strings
app.get('/api/strings', async (req, res) => {
  // Perf fix (Sep 2026): this endpoint is fetched by every visitor on every
  // page load and previously had no cache header at all. Content strings
  // change rarely (an admin edit), so a short public cache is a safe
  // tradeoff: a few minutes of staleness after an edit, in exchange for far
  // fewer repeated round-trips (and Supabase reads) for identical content.
  res.setHeader('Cache-Control', 'public, max-age=300');

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_strings')
        .select('*');
      if (!error && data && data.length > 0) {
        return res.json({ success: true, strings: data });
      }
      if (error) {
        console.warn('Supabase app_strings table fetch warning:', error.message);
      }
    } catch (err) {
      console.error('Supabase app_strings table exception:', err);
    }
  }

  // Fallback to local app_strings_fallback.json
  const localStrings = loadFallbackStrings();
  return res.json({ success: true, strings: localStrings });
});

// POST update dynamic app translation string (Protected Admin endpoint)
app.post('/api/admin/strings', authenticateUser, requireAdmin, asyncRoute(async (req, res) => {
  const { id, en, ar } = req.body;

  if (!id || !en || !ar) {
    return res.status(400).json({ error: 'Missing parameter: id, en, and ar are required.' });
  }

  // 1) Update filesystem fallback app_strings_fallback.json so dev environment is synced
  const fallbackStrings = loadFallbackStrings();
  const existingIdx = fallbackStrings.findIndex((s: any) => s.id === id);
  if (existingIdx !== -1) {
    fallbackStrings[existingIdx] = { id, en, ar };
  } else {
    fallbackStrings.push({ id, en, ar });
  }
  saveFallbackStrings(fallbackStrings);

  // 2) Update Supabase if available
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('app_strings')
        .upsert([{ id, en, ar, updated_at: new Date().toISOString() }], { onConflict: 'id' });
      if (error) {
        console.error('Supabase upsert app_strings table error:', error);
      }
    } catch (err) {
      console.error('Supabase upsert app_strings exception:', err);
    }
  }

  return res.json({ success: true, string: { id, en, ar } });
}))

// 6) ADVANCED IN-DOCUMENT OCR & TEXT EXTRACTION
app.post('/api/pdf/ocr', authenticateUser, aiRateLimiter, enforceAiQuota, asyncRoute(async (req, res) => {
  const { lang, fileName, imageBase64, mimeType } = req.body;
  const isArabic = lang === 'ar' || (fileName && /[\u0600-\u06FF]/.test(fileName));

  const gemini = getGemini();

  // The Gemini ("AI Precision") path requires an actual image of the page —
  // without it, Gemini has nothing to read and previously returned a fixed,
  // unrelated sample invoice regardless of what the user uploaded. Fail
  // clearly instead of silently returning fabricated text.
  if (gemini && !imageBase64) {
    return res.status(400).json({
      error: 'No page image was provided for OCR. Please include imageBase64 of the rendered page.'
    });
  }

  // High-fidelity fallback simulated OCR output mapped with exact coordinates.
  // Only used when Gemini isn't configured at all (local/dev preview mode) —
  // never as a silent substitute for a real, uploaded document.
  const arabicTextLayers = [
    { id: 't1', text: 'فاتورة ضريبية / بيان الحساب الرقمي', x: 220, y: 730, page: 1, size: 20 },
    { id: 't2', text: 'رقم المستند المرجعي: ERP-2026-78A', x: 220, y: 690, page: 1, size: 11 },
    { id: 't3', text: 'العميل المستفيد: مجموعة السحاب الرقمية المحدودة', x: 100, y: 620, page: 1, size: 12 },
    { id: 't4', text: 'البريد الإلكتروني للعميل: billing@cloudcorp.sa', x: 100, y: 595, page: 1, size: 10 },
    { id: 't5', text: 'ترخيص سنوي متكامل - حزمة إيزي بي دي إف برو للمؤسسات', x: 100, y: 520, page: 1, size: 11 },
    { id: 't6', text: 'قيمة الاشتراك الإجمالية: 1,200.00 دولار أمريكي', x: 100, y: 490, page: 1, size: 12 },
    { id: 't7', text: 'تخول هذه الرخصة المشترك حق الوصول الكامل لكافة بوابات وأدوات التعديل الفوري وصياغة النماذج وتوليد التلخيص الذكي عبر نموذج جيميناي فلاش.', x: 100, y: 440, page: 1, size: 10 },
    { id: 't8', text: 'توقيع المدير المفوض: _________________________', x: 100, y: 320, page: 1, size: 11 },
    { id: 't9', text: 'تنبيه سرية البيانات: هذا المستند سري وخاص ببيئة السحابة الذكية للمؤسسات فقط.', x: 120, y: 60, page: 1, size: 9 }
  ];

  const englishTextLayers = [
    { id: 't1', text: 'TAX INVOICE & EXECUTIVE DIGITAL STATEMENT', x: 80, y: 730, page: 1, size: 18 },
    { id: 't2', text: 'Document Reference No: ERP-2026-78A', x: 80, y: 695, page: 1, size: 11 },
    { id: 't3', text: 'Beneficiary Client: CloudCorp Systems Group Ltd.', x: 80, y: 620, page: 1, size: 12 },
    { id: 't4', text: 'Associated Billing Email: billing@cloudcorp.io', x: 80, y: 595, page: 1, size: 10 },
    { id: 't5', text: 'Annual Integrated Enterprise License - Easy PDF Pro Suite', x: 80, y: 520, page: 1, size: 11 },
    { id: 't6', text: 'Total Licensing Volume Fee: $1,200.00 USD', x: 80, y: 490, page: 1, size: 12 },
    { id: 't7', text: 'This standard license authorizes all associated organizational nodes to perform real-time PDF compiling, AI summaries, and automated redaction operations.', x: 80, y: 440, page: 1, size: 10 },
    { id: 't8', text: 'Authorized Controlling Signature: _________________________', x: 80, y: 320, page: 1, size: 11 },
    { id: 't9', text: 'PRIVACY SECURITY COMPLIANCE - STRICTLY CONFIDENTIAL ENTERPRISE MATERIAL', x: 100, y: 60, page: 1, size: 9.5 }
  ];

  if (gemini && imageBase64) {
    let ocrLayers: any;
    try {
      // Perform real visual OCR on the actual page image the client rendered
      // and sent us — this is what makes results reflect the user's real document.
      const prompt = `Perform high-fidelity visual OCR on this scanned/rendered document page image (file titled "${fileName || 'Document'}").
      Identify all visible paragraphs, text blocks, titles and labels, transcribing the text exactly as it appears in the image.
      Generate logical text blocks with absolute positioning coordinates (relative scale: width 612, height 792 - standard US Letter page).
      Format the response strictly as a JSON array of blocks: [{"id": "t1", "text": "...", "x": 80, "y": 700, "page": 1, "size": 12}]. Do not output any Markdown tags or comments outside the JSON array.`;

      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            inlineData: {
              data: String(imageBase64).replace(/^data:image\/\w+;base64,/, ''),
              mimeType: mimeType || 'image/png'
            }
          },
          prompt
        ],
      });

      const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      ocrLayers = JSON.parse(cleanJson);
    } catch (e) {
      console.error('Gemini-based OCR failed:', e);
      return res.status(502).json({ error: 'AI OCR failed. Please try again in a moment. You were not charged.' });
    }

    if (!Array.isArray(ocrLayers) || ocrLayers.length === 0) {
      return res.status(502).json({ error: 'Gemini did not return usable OCR results. Please try again. You were not charged.' });
    }

    // Charge quota only now that a real, usable OCR result exists.
    const aiQuota = await spendAiQuotaOrRespond(req, res);
    if (!aiQuota) return;
    return res.json({ success: true, textLayers: ocrLayers, aiQuota });
  }

  // Gemini not configured at all — return labeled demo data so local
  // preview/dev environments still render something, clearly not tied to
  // a real uploaded file.
  return res.json({
    success: true,
    demo: true,
    textLayers: isArabic ? arabicTextLayers : englishTextLayers,
    aiQuota: (req as any).aiQuota
  });
}))


// 7) CONTEXTUAL AI COPILOT VOICE & TEXT DIRECTIVES COMMAND ENGINE
app.post('/api/copilot/command', authenticateUser, aiRateLimiter, asyncRoute(async (req, res) => {
  const { message, textLayers, imageFilters, lang } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Instruction message is required for AI Copilot' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized: User identity not established' });
  }
  const userId = req.user.id;

  // Quota is only relevant to branches below that actually call Gemini
  // (translate, the title free-form fallback, and the generic catch-all).
  // It is looked up once here (without consuming it) and only spent right
  // before/after a real Gemini call happens further down.
  let quotaState = await peekAiQuota(userId, req.user.email);
  let aiQuotaForResponse: any = quotaState.aiQuota;

  const promptMessage = message.toLowerCase();
  let updatedTextLayers = textLayers ? JSON.parse(JSON.stringify(textLayers)) : [];
  let updatedImageFilters = imageFilters ? { ...imageFilters } : { brightness: 100, contrast: 100, grayscale: false, rotate: 0 };
  let reply = '';
  let demoReply = false;

  const isArabic = lang === 'ar' || /[\u0600-\u06FF]/.test(message);

  // Quota model (Sep 2026 hardening): a Gemini-backed copilot branch first
  // PEEKS (rejects a free user already at the limit before any model call),
  // then charges quota atomically only AFTER Gemini produced a usable
  // result. Validation errors and failed Gemini calls cost nothing.
  const quotaExceededMessage = isArabic
    ? 'تم استنفاد رصيد عمليات الذكاء الاصطناعي اليومي. المستخدمون المجانيون محدودون بـ 3 عمليات يومياً. قم بالترقية إلى Pro للاستخدام غير المحدود.'
    : 'AI operations daily quota exceeded. Free users are limited to 3 AI operations per day. Please upgrade to Pro for unlimited AI-powered tools.';
  const rejectIfQuotaExhausted = (): boolean => {
    if (quotaState.blocked) {
      res.status(403).json({ error: quotaExceededMessage });
      return true;
    }
    return false;
  };
  const spendCopilotQuota = async (): Promise<boolean> => {
    try {
      const spent = await consumeAiQuota(userId, quotaState.profile);
      if (!spent.allowed) {
        res.status(403).json({ error: quotaExceededMessage });
        return false;
      }
      aiQuotaForResponse = spent;
      return true;
    } catch (e) {
      console.error('Failed to record AI quota after a successful copilot call:', e);
      res.status(503).json({
        error: e instanceof EntitlementLookupError
          ? e.message
          : (isArabic ? 'تعذّر التحقق من رصيد الذكاء الاصطناعي حالياً. حاول مرة أخرى بعد قليل.' : 'Could not verify AI usage quota right now. Please try again in a moment.')
      });
      return false;
    }
  };

  // NOTE (security/quality audit, Aug 2026): "translate" and "title" used to
  // be hardcoded string-matching rules written against ONE specific demo
  // invoice's text (CloudCorp / ERP-2026-78A / etc — the same text as the
  // `demo: true` OCR fallback above). On a real user document none of those
  // `if (block.text.includes('invoice'))`-style conditions would ever match,
  // so nothing was actually translated/renamed — yet the endpoint still
  // returned a "success" reply claiming the work was done. Both commands now
  // operate on the real `textLayers` content sent by the client, using
  // Gemini for translate (which requires real language understanding), and
  // fail clearly instead of silently doing nothing.
  if (promptMessage.includes('translate') || promptMessage.includes('ترجم') || promptMessage.includes('عربي') || promptMessage.includes('arabic') || promptMessage.includes('english')) {
    const toArabic = promptMessage.includes('عربي') || promptMessage.includes('arabic') || promptMessage.includes('ترجم');
    const targetLangLabel = toArabic ? 'Arabic' : 'English';

    if (!updatedTextLayers.length) {
      return res.status(400).json({
        error: isArabic
          ? 'لا يوجد نص محمّل في المستند لترجمته. الرجاء تشغيل استخراج النص (OCR) أولاً.'
          : 'No document text is loaded to translate. Please run OCR first.'
      });
    }

    const gemini = getGemini();
    if (!gemini) {
      // No AI backend configured — do not fabricate a translation result.
      return res.json({
        success: false,
        demo: true,
        reply: isArabic
          ? 'ميزة الترجمة تتطلب تفعيل خدمة الذكاء الاصطناعي (Gemini) على الخادم. لم يتم تعديل أي نص.'
          : 'Translation requires the AI service (Gemini) to be configured on the server. No text was changed.',
        textLayers: updatedTextLayers,
        imageFilters: updatedImageFilters
      });
    }

    // About to make a real Gemini call: reject a free user who is already at
    // the limit BEFORE calling the model. The authoritative atomic charge
    // happens below, only after a usable translation exists.
    if (rejectIfQuotaExhausted()) return;

    let translatedLayers: any[];
    try {
      const prompt = `Translate each of the following document text blocks into ${targetLangLabel}. Preserve meaning, tone, numbers, codes, and names exactly. Respond with a strict JSON array of translated strings only, in the exact same order and length as the input array — no extra commentary, no markdown.
      Input blocks: ${JSON.stringify(updatedTextLayers.map((b: any) => b.text))}`;

      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const translations = JSON.parse(cleanJson);

      if (!Array.isArray(translations) || translations.length !== updatedTextLayers.length) {
        return res.status(502).json({
          error: isArabic ? 'لم تُرجع خدمة الذكاء الاصطناعي نتيجة ترجمة صالحة. حاول مرة أخرى.' : 'AI translation did not return a usable result. Please try again.'
        });
      }

      translatedLayers = updatedTextLayers.map((block: any, i: number) => ({
        ...block,
        text: typeof translations[i] === 'string' && translations[i].trim() ? translations[i] : block.text
      }));
    } catch (e) {
      console.error('Gemini copilot translate error:', e);
      return res.status(502).json({
        error: isArabic ? 'فشلت عملية الترجمة بالذكاء الاصطناعي. حاول مرة أخرى بعد قليل.' : 'AI translation failed. Please try again in a moment.'
      });
    }

    if (!(await spendCopilotQuota())) return;
    updatedTextLayers = translatedLayers;
    reply = toArabic
      ? 'تمت ترجمة نصوص المستند الفعلية إلى العربية بواسطة الذكاء الاصطناعي.'
      : "The document's actual text blocks were translated to English by AI.";

  } else if (promptMessage.includes('title') || promptMessage.includes('عنوان') || promptMessage.includes('اسم')) {
    if (!updatedTextLayers.length) {
      return res.status(400).json({
        error: isArabic
          ? 'لا يوجد نص محمّل في المستند لتغيير عنوانه. الرجاء تشغيل استخراج النص (OCR) أولاً.'
          : 'No document text is loaded to retitle. Please run OCR first.'
      });
    }

    // Fast path: the user directly specified the new title in their own
    // words (e.g. "change the title to X" / "اجعل العنوان باسم X"). This
    // applies the user's real, literal instruction — not fabricated content
    // — so it's kept as the first attempt.
    const match = message.match(/(?:to|الى|إلى|باسم|يكون)\s+["']?([^"']+)["']?/i);
    let newTitle = match ? match[1].trim() : '';

    // If the instruction was too free-form for the regex to parse (e.g.
    // "make the title punchier"), ask Gemini to derive one from the actual
    // current title + the user's instruction, instead of silently falling
    // back to a generic placeholder that has nothing to do with what the
    // user asked for.
    if (!newTitle) {
      const gemini = getGemini();
      // This path is about to make a real Gemini call — only now check/spend
      // quota (atomically), and only if a title wasn't already resolved by
      // plain regex above (which needs no AI and should never cost quota).
      if (gemini) {
        if (rejectIfQuotaExhausted()) return;
        let titleResolvedByAi = false;
        try {
          const prompt = `The document's current title text block is: "${updatedTextLayers[0].text}". The user's instruction is: "${message}". Determine the new title text they want. Respond with strict JSON: {"title": "..."}`;
          const response = await gemini.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
          const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed?.title && typeof parsed.title === 'string') {
            newTitle = parsed.title.trim();
            titleResolvedByAi = !!newTitle;
          }
        } catch (e) {
          console.error('Gemini copilot title-extraction fallback failed:', e);
          return res.status(502).json({
            error: isArabic ? 'فشل الذكاء الاصطناعي في تحديد العنوان. حاول مرة أخرى بعد قليل.' : 'The AI service could not determine the title right now. Please try again in a moment.'
          });
        }
        if (titleResolvedByAi && !(await spendCopilotQuota())) return;
      }
    }

    if (!newTitle) {
      return res.status(400).json({
        error: isArabic
          ? 'لم أستطع تحديد العنوان الجديد من طلبك. حاول مثلاً: "غيّر العنوان إلى ..."'
          : 'Could not determine the new title from your instruction. Try e.g. "change the title to ..."'
      });
    }

    updatedTextLayers[0].text = newTitle;
    reply = isArabic
      ? `أبشر! قمت بتغيير العنوان الرئيسي للمستند ليصبح: "${newTitle}"`
      : `Acknowledged. I have updated the main document header to: "${newTitle}"`;

  } else if (promptMessage.includes('bright') || promptMessage.includes('إضاءة') || promptMessage.includes('فاتح') || promptMessage.includes('light')) {
    updatedImageFilters.brightness = 150;
    updatedImageFilters.contrast = 110;
    reply = isArabic
      ? 'تم ضبط الفلاتر فوراً ورفع نسبة إضاءة المستند / الصورة بمقدار 50% لمنحها وضوحاً فائقاً.'
      : 'Understood. Increased document image brightness by 50% for optimal readability.';

  } else if (promptMessage.includes('dark') || promptMessage.includes('عتيم') || promptMessage.includes('غامق')) {
    updatedImageFilters.brightness = 80;
    updatedImageFilters.contrast = 120;
    reply = isArabic
      ? 'تم تخفيض مستوى الإضاءة وزيادة حدة التباين لمنح المستند طابعاً غامقاً مريحاً للعين.'
      : 'Reduced brightness and enhanced image contrast by 20% for deep text presentation.';

  } else if (promptMessage.includes('grayscale') || promptMessage.includes('رمادي') || promptMessage.includes('أبيض وأسود') || promptMessage.includes('mono')) {
    updatedImageFilters.grayscale = !updatedImageFilters.grayscale;
    reply = isArabic
      ? 'تم تفعيل فلتر الأبيض والأسود (الرمادي الكلاسيكي) بنجاح على الصورة.'
      : 'Toggled standard high-contrast monochrome gray scale filter on active document canvas.';

  } else if (promptMessage.includes('rotate') || promptMessage.includes('تدوير') || promptMessage.includes('لف')) {
    updatedImageFilters.rotate = (updatedImageFilters.rotate + 90) % 360;
    reply = isArabic
      ? `تم تدوير اتجاه المستند بمقدار 90 درجة في اتجاه عقارب الساعة (الاتجاه الحالي: ${updatedImageFilters.rotate} درجة).`
      : `Rotated active document orientation by 90 degrees clockwise. (Current rotation: ${updatedImageFilters.rotate}°)`;

  } else {
    // Generate fallback Gemini conversation if no simple match found
    const gemini = getGemini();
    if (gemini) {
      if (rejectIfQuotaExhausted()) return;
      let copilotParsed: any;
      try {
        const prompt = `You are Easy PDF Copilot, an advanced built-in document assistant. The user's language preference is ${isArabic ? 'Arabic' : 'English'}.
        User Instruction: "${message}"
        Current active document text blocks: ${JSON.stringify(updatedTextLayers.map((b: any) => b.text))}
        Current image filters: ${JSON.stringify(updatedImageFilters)}

        Generate a professional, friendly, short response (1-2 sentences) confirming the action. If they want to change text blocks or filters, reply accordingly. 
        Format your response strictly as a JSON object: {"reply": "Your message here", "modifyTextId": "t1_or_null", "modifyTextValue": "new_text_or_null", "adjustFilters": {"brightness": 100}}`;

        const response = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });

        const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        copilotParsed = JSON.parse(cleanJson);
      } catch (e) {
        // A failed Gemini call is an error, never a friendly fake "success".
        console.error('Gemini copilot command error:', e);
        return res.status(502).json({
          error: isArabic ? 'فشل مساعد الذكاء الاصطناعي في معالجة طلبك. لم يتم خصم أي رصيد. حاول مرة أخرى بعد قليل.' : 'The AI Copilot could not process your request right now. You were not charged. Please try again in a moment.'
        });
      }

      if (!copilotParsed || typeof copilotParsed.reply !== 'string' || !copilotParsed.reply.trim()) {
        return res.status(502).json({
          error: isArabic ? 'لم يُرجع مساعد الذكاء الاصطناعي ردّاً صالحاً. لم يتم خصم أي رصيد. حاول مرة أخرى.' : 'The AI Copilot did not return a usable reply. You were not charged. Please try again.'
        });
      }

      if (!(await spendCopilotQuota())) return;
      reply = copilotParsed.reply;
      if (copilotParsed.modifyTextId && copilotParsed.modifyTextValue) {
        updatedTextLayers = updatedTextLayers.map((b: any) => {
          if (b.id === copilotParsed.modifyTextId) b.text = copilotParsed.modifyTextValue;
          return b;
        });
      }
      if (copilotParsed.adjustFilters && typeof copilotParsed.adjustFilters === 'object') {
        updatedImageFilters = { ...updatedImageFilters, ...copilotParsed.adjustFilters };
      }
      return res.json({ success: true, reply, textLayers: updatedTextLayers, imageFilters: updatedImageFilters, aiQuota: aiQuotaForResponse });
    }

    // No AI backend configured: a static help message (no model was called,
    // so no quota is charged). It is flagged `demo: true` so it can never be
    // mistaken for real AI output.
    demoReply = true;
    reply = isArabic 
      ? 'مرحباً بك! أنا مساعدك الذكي المدمج. يمكنك إعطائي أوامر مثل "ترجم للعربية"، "اجعل العنوان: الفاتورة النهائية"، أو "قم بتدوير المستند" وسأقوم بتعديل محتويات مستندك فورا بالتنسيق والذكاء الاصطناعي.' 
      : 'Greetings! I am your contextual AI Copilot. Try commanding me: "Translate to Arabic", "Change the title to Receipt", "Make the document brighter", or "Toggle grayscale" to modify your live document canvas in real-time!';
  }

  return res.json({
    success: true,
    ...(demoReply ? { demo: true } : {}),
    reply,
    textLayers: updatedTextLayers,
    imageFilters: updatedImageFilters,
    aiQuota: aiQuotaForResponse
  });
}))


// 8) ACTUAL PDF COMPILATION & GENERATION WITH MODIFIED TEXT OVERLAYS
// NOTE (audit, Aug 2026): this endpoint only runs pdf-lib to render text
// overlays onto a fresh PDF — it never calls Gemini or any AI service. It
// was previously guarded by `enforceAiQuota`, which silently burned one of
// the user's 3 free daily AI operations every single time they exported
// their edited PDF (a purely mechanical, non-AI action). `aiRateLimiter` is
// kept for basic abuse protection; the AI-quota deduction is removed.
app.post('/api/pdf/edit-text', authenticateUser, aiRateLimiter, asyncRoute(async (req, res) => {
  const { textLayers, fileName } = req.body;
  if (!textLayers || !Array.isArray(textLayers)) {
    return res.status(400).json({ error: 'Valid textLayers array is required to compile modified PDF' });
  }

  const userId = req.user!.id;
  const isProduction = process.env.NODE_ENV === 'production';

  // QUOTA (phase-2 hardening): exporting an edited PDF produces a stored
  // file exactly like /api/pdf/upload does, so it now consumes the SAME
  // atomic daily upload allowance via increment_daily_quota — previously
  // this endpoint was guarded only by rate limiting and let a free user
  // write unlimited PDFs to Supabase Storage. Placement mirrors the upload
  // endpoint: AFTER basic request validation (malformed requests must not
  // burn quota) but BEFORE compile/storage (fail-closed; the atomic RPC is
  // authoritative). isPro is derived server-side, never from the client.
  const profile = await getOrSyncUserProfile(userId, req.user!.email);
  let editExportQuota: AtomicQuotaResult;
  try {
    editExportQuota = await atomicIncrementQuota(userId, 'upload', 3, profile.plan === 'pro');
  } catch (err) {
    console.error('Failed to verify/increment export quota for /api/pdf/edit-text:', err);
    return res.status(503).json({ error: 'Could not verify usage quota right now. Please try again in a moment.' });
  }
  if (!editExportQuota.allowed) {
    return res.status(403).json({
      error: 'Daily export limit exceeded. Free users are limited to 3 PDF uploads/exports per day. Please upgrade to Pro for unlimited operations.'
    });
  }

  try {
    const { PDFDocument, rgb, StandardFonts } = await import('@cantoo/pdf-lib');
    const newPdf = await PDFDocument.create();
    const page = newPdf.addPage([612, 792]); // standard letter size

    // Embed clean fonts
    const font = await newPdf.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await newPdf.embedFont(StandardFonts.Helvetica);

    // Unicode-capable font, lazily embedded ONLY when some block actually
    // needs it (Arabic or any other non-WinAnsi text). English-only exports
    // keep using the standard fonts exactly as before.
    let unicodeFont: any = null;

    // Render modern visual accents so the compiled PDF looks incredibly premium and professional
    // Top border accent
    page.drawRectangle({
      x: 0,
      y: 784,
      width: 612,
      height: 8,
      color: rgb(79/255, 70/255, 229/255) // Primary Indigo accent
    });

    // Confetti accent dots
    page.drawCircle({ x: 550, y: 730, size: 15, color: rgb(76/255, 215/255, 246/255), opacity: 0.15 });

    // Render text blocks
    for (const block of textLayers) {
      const isTitle = block.id === 't1';
      const isFooter = block.id === 't9';

      // Compute safe positions on the page
      const blockX = Math.max(30, Math.min(block.x || 80, 550));
      const blockY = Math.max(30, Math.min(block.y || 400, 750));
      const size = block.size || (isTitle ? 18 : 10.5);

      // SECURITY (redaction enforcement): a block flagged `redacted` must
      // NEVER be rendered as text on the output page — not visibly, and not
      // invisibly underneath a cover bar either (invisible text would remain
      // selectable/extractable from the exported PDF, silently defeating the
      // redaction). Instead, an opaque bar is drawn directly into the page's
      // content stream, covering the area the text occupied. The bar is built
      // ONLY from non-sensitive geometry (position + a coarse character-count
      // hint); the original string is never drawn here. The client is also
      // expected to strip the text before sending (defense in depth), but this
      // server-side check is authoritative so a modified client cannot turn
      // this endpoint into a "redaction that keeps the text" renderer.
      if (block.redacted === true) {
        const estCharWidth = size * 0.55;
        const hintedWidth =
          typeof block.redactedTextLength === 'number' && block.redactedTextLength > 0
            ? block.redactedTextLength * estCharWidth
            : 0;
        const barWidth = Math.max(48, Math.min(hintedWidth || size * estCharWidth * 12, 570 - blockX));
        const barHeight = Math.max(size * 1.15, 9);
        page.drawRectangle({
          x: blockX,
          y: blockY - 2,
          width: barWidth,
          height: barHeight,
          color: rgb(0.06, 0.07, 0.09)
        });
        continue;
      }

      // Font selection: any character outside WinAnsi coverage (Arabic,
      // Cyrillic, CJK, etc.) requires the embedded Unicode font — standard
      // Helvetica would throw a WinAnsi encoding exception here. Arabic
      // strings additionally get contextual shaping + visual RTL reordering
      // (see arabicShaper.ts), because pdf-lib applies no bidi reordering of
      // its own; fontkit's layout() then supplies the correct contextual
      // glyph forms through Amiri's real OpenType shaping tables.
      const rawText = typeof block.text === 'string' ? block.text : String(block.text ?? '');
      const needsUnicodeFont = !WINANSI_SAFE_RE.test(rawText);
      if (needsUnicodeFont && !unicodeFont) {
        const fontkit = await getFontkit();
        newPdf.registerFontkit(fontkit);
        // NOTE: subsetting is intentionally NOT enabled — pdf-lib's subsetter
        // chokes on complex OpenType tables (Amiri's GSUB/GPOS). The full
        // ~430 KB font is embedded once per export that actually needs it.
        unicodeFont = await newPdf.embedFont(loadUnicodeFontBytes());
      }

      // NOTE: title weight (HelveticaBold) is only available in WinAnsi; a
      // Unicode-font title renders in the Amiri regular cut instead — an
      // accepted tradeoff until a bold Arabic face is bundled too.
      const drawFont = needsUnicodeFont ? unicodeFont : (isTitle ? font : regularFont);
      const textToDraw = needsUnicodeFont && needsArabicShaping(rawText) ? shapeArabicText(rawText) : rawText;

      // Draw elegant text block
      page.drawText(textToDraw, {
        x: blockX,
        y: blockY,
        size: size,
        font: drawFont,
        color: isFooter ? rgb(120/255, 120/255, 120/255) : rgb(31/255, 41/255, 55/255)
      });
    }

    const modifiedBytes = await newPdf.save();
    const buffer = Buffer.from(modifiedBytes);

    // Sanitize the client-supplied filename before it ever touches a path
    // (local fallback path) or a Supabase Storage object key.
    const safeSourceName = sanitizeOriginalFileName(fileName || 'Compiled_Document.pdf');
    const finalFileName = `Edited_${crypto.randomBytes(8).toString('hex')}_${safeSourceName}`;
    const fileId = 'file-' + crypto.randomBytes(8).toString('hex');

    // Persist the compiled PDF the same way /api/pdf/upload does — in
    // Supabase Storage — instead of the server's local filesystem. On
    // Vercel's serverless runtime, local disk writes only live for the
    // duration of a single function invocation, so a later download request
    // (a different invocation) would 404. This mirrors the "documents"
    // bucket / signed-URL / uploaded_files pattern used for regular uploads.
    const supabase = getSupabase();
    let fileUrl: string;

    if (supabase) {
      const storagePath = `edited/${userId}/${finalFileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, buffer, { contentType: 'application/pdf' });

      if (uploadErr) {
        console.error('Failed to upload edited PDF to Supabase Storage:', uploadErr);
        // Fail clearly instead of silently keeping only a local copy that
        // may vanish before the user can download it.
        return res.status(502).json({
          error: 'The edited PDF was generated but could not be saved to permanent storage. Please try again in a moment.'
        });
      }

      // Security fix (Aug 2026 audit) — same reasoning as /api/pdf/upload:
      // never fall back to getPublicUrl() in production. A signed URL is
      // the only link ever returned for a real user's file; if it can't
      // be created, that's treated as a genuine storage failure.
      const { data: signedData, error: signedUrlErr } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 60 * 60 * 24); // 24-hour expiry, matches /api/pdf/upload

      if (signedData?.signedUrl) {
        fileUrl = signedData.signedUrl;
      } else if (isProduction) {
        console.error('Failed to create signed URL for edited PDF:', signedUrlErr);
        return res.status(502).json({
          error: 'The edited PDF was saved, but a secure download link could not be generated. Please try again in a moment.'
        });
      } else {
        console.warn('[dev-only] createSignedUrl failed; falling back to getPublicUrl() for local testing:', signedUrlErr);
        const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(storagePath);
        fileUrl = publicUrlData.publicUrl;
      }

      const { error: dbError } = await supabase.from('uploaded_files').insert([{
        id: fileId,
        user_id: userId,
        file_name: finalFileName,
        file_url: fileUrl,
        uploaded_at: new Date().toISOString()
      }]);
      if (dbError) {
        // Storage write already succeeded and fileUrl is a real, usable
        // signed/public URL, so this is non-fatal — it only means the file
        // won't show up in the "my files" listing that reads this table.
        console.warn('Edited PDF stored in Supabase Storage, but failed to record it in uploaded_files:', dbError);
      }
    } else if (isProduction) {
      // No durable storage backend available in production — do not fall
      // back to local disk, since it would silently produce a download link
      // that is likely to 404 once this serverless invocation ends.
      return res.status(503).json({
        error: 'Cloud storage is not configured on the server, so the edited PDF cannot be saved. Please contact support.'
      });
    } else {
      // Local-dev-only fallback (no Supabase configured locally). Never
      // taken in production — see the isProduction branch above.
      const finalPath = path.join(uploadDir, finalFileName);
      fs.writeFileSync(finalPath, buffer);
      fileUrl = `/uploads/${finalFileName}`;
      recordFileOwnership(fileId, userId, finalFileName, fileUrl);
    }

    return res.json({
      success: true,
      fileUrl,
      fileName: finalFileName,
      size: buffer.length,
      uploadsLeft: profile.plan === 'free' ? Math.max(0, 3 - editExportQuota.uploads_count_today) : 9999
    });
  } catch (err: any) {
    console.error('Failed to compile PDF overlay with pdf-lib:', err);
    return res.status(500).json({ error: `Failed to compile PDF: ${err.message}` });
  }
}));

// FEATURE 7a: Gemini Image Enhancement analysis
app.post('/api/ai/enhance-image', authenticateUser, aiRateLimiter, enforceAiQuota, asyncRoute(async (req, res) => {
  const { imageBase64, mimeType, fileName } = req.body;
  const gemini = getGemini();

  // Without an actual page image, Gemini has nothing to analyze — previously
  // this silently returned generic "recommended" numbers regardless.
  if (gemini && !imageBase64) {
    return res.status(400).json({ error: 'No page image was provided. Please include imageBase64 of the rendered page.' });
  }

  if (!gemini) {
    return res.json({
      success: true,
      demo: true,
      rotationAngle: 0,
      brightness: 115,
      contrast: 125,
      recommendations: "Auto-enhanced lighting and boosted document contrast using local image filter."
    });
  }

  let enhanceResult: any;
  try {
    const prompt = `Analyze this scanned image for document processing ("${fileName || 'scanned_page'}").
    Provide recommendations for image enhancement:
    1. Estimate deskew rotation angle needed (-15 to 15 degrees).
    2. Suggest brightness percentage (100 to 150).
    3. Suggest contrast percentage (100 to 150).
    4. Provide a 1-sentence recommendation summary.

    Return JSON strictly in this format:
    {"rotationAngle": 0, "brightness": 120, "contrast": 130, "recommendations": "..."}`;

    const contents = imageBase64 ? [
      {
        inlineData: {
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: mimeType || 'image/jpeg'
        }
      },
      prompt
    ] : prompt;

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: contents,
    });

    const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    enhanceResult = JSON.parse(cleanJson);
  } catch (err) {
    console.error('Gemini enhance-image exception:', err);
    return res.status(502).json({ error: 'AI image analysis failed. Please try again in a moment. You were not charged.' });
  }

  // Gemini answered, but not with the numbers we need: report a failure
  // instead of inventing default "recommendations".
  if (!enhanceResult || typeof enhanceResult !== 'object' ||
      !Number.isFinite(Number(enhanceResult.brightness)) || !Number.isFinite(Number(enhanceResult.contrast))) {
    return res.status(502).json({ error: 'AI image analysis did not return a usable result. Please try again. You were not charged.' });
  }

  const aiQuota = await spendAiQuotaOrRespond(req, res);
  if (!aiQuota) return;
  return res.json({
    success: true,
    rotationAngle: Number.isFinite(Number(enhanceResult.rotationAngle)) ? Number(enhanceResult.rotationAngle) : 0,
    brightness: Number(enhanceResult.brightness),
    contrast: Number(enhanceResult.contrast),
    recommendations: typeof enhanceResult.recommendations === 'string' ? enhanceResult.recommendations : '',
    aiQuota
  });
}))

// FEATURE 7b: Gemini Smart File Renaming
app.post('/api/ai/smart-rename', authenticateUser, aiRateLimiter, enforceAiQuota, asyncRoute(async (req, res) => {
  const { documentText, currentFileName, lang } = req.body;
  const gemini = getGemini();

  const isArabic = lang === 'ar' || (documentText && /[\u0600-\u06FF]/.test(documentText));

  // Without real document text, Gemini has nothing to base a filename on —
  // previously this silently proposed a name based on generic invoice text.
  if (gemini && !documentText) {
    return res.status(400).json({ error: 'No document text was provided. Please include documentText extracted from the file.' });
  }

  if (!gemini) {
    const defaultName = isArabic ? `مستند_منظم_${Date.now()}.pdf` : `Document_SmartRenamed_${Date.now()}.pdf`;
    return res.json({
      success: true,
      demo: true,
      suggestedFileName: defaultName,
      reason: isArabic ? "اسم افتراضي مقترح بناءً على نوع المستند." : "Suggested clean descriptive filename."
    });
  }

  let renameResult: any;
  try {
    const prompt = `Based on the following document context / text snippet, suggest a concise, professional, sanitized filename (ending in .pdf, no spaces or special characters except underscores):
    Document snippet: "${(documentText || currentFileName || 'Invoice Report').substring(0, 500)}"
    Return JSON format strictly: {"suggestedFileName": "Invoice_Company_2026.pdf", "reason": "Extracted document type and organization name"}`;

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    renameResult = JSON.parse(cleanJson);
  } catch (err) {
    console.error('Gemini smart-rename error:', err);
    return res.status(502).json({ error: 'AI rename suggestion failed. Please try again in a moment. You were not charged.' });
  }

  if (!renameResult || typeof renameResult.suggestedFileName !== 'string' || !renameResult.suggestedFileName.trim()) {
    return res.status(502).json({ error: 'AI rename suggestion did not return a usable result. Please try again. You were not charged.' });
  }

  const aiQuota = await spendAiQuotaOrRespond(req, res);
  if (!aiQuota) return;
  return res.json({
    success: true,
    suggestedFileName: renameResult.suggestedFileName.trim(),
    reason: typeof renameResult.reason === 'string' ? renameResult.reason : '',
    aiQuota
  });
}))

// FEATURE 7c: Gemini Structured Data Extraction (Invoices/Receipts to JSON/CSV)
app.post('/api/ai/extract-data', authenticateUser, aiRateLimiter, enforceAiQuota, asyncRoute(async (req, res) => {
  const { documentText, imageBase64, lang } = req.body;
  const gemini = getGemini();

  const isArabic = lang === 'ar' || (documentText && /[\u0600-\u06FF]/.test(documentText));

  // Without real document text/image, there is nothing to extract from —
  // previously this silently returned a fake sample invoice.
  if (gemini && !documentText && !imageBase64) {
    return res.status(400).json({ error: 'No document content was provided. Please include documentText or imageBase64.' });
  }

  const fallbackData = isArabic ? [
    { key: "نوع المستند", value: "فاتورة ضريبية رقمية" },
    { key: "رقم الفاتورة", value: "INV-2026-904" },
    { key: "اسم المورد/الشركة", value: "مؤسسة يوسف خير الله الفرج" },
    { key: "تاريخ الإصدار", value: "2026-07-23" },
    { key: "المبلغ الإجمالي", value: "1,200.00 ر.س" },
    { key: "حالة الدفع", value: "مكتملة ومصدقة" }
  ] : [
    { key: "Document Type", value: "Tax Invoice" },
    { key: "Invoice Number", value: "INV-2026-904" },
    { key: "Vendor Name", value: "Yousef Khairallah Al-Faraj Est." },
    { key: "Issue Date", value: "2026-07-23" },
    { key: "Total Amount", value: "$1,200.00" },
    { key: "Payment Status", value: "Completed & Verified" }
  ];

  if (!gemini) {
    const csvContent = "Key,Value\n" + fallbackData.map(item => `"${csvEscape(item.key)}","${csvEscape(item.value)}"`).join("\n");
    return res.json({
      success: true,
      demo: true,
      extractedData: fallbackData,
      csvContent
    });
  }

  let extractParsed: any;
  try {
    const promptText = `Extract structured metadata key-value pairs (e.g. Document Type, Invoice/Ref Number, Vendor, Total Amount, Date, Status, Customer) from this document${documentText ? ' text' : ' image'}:
    ${documentText ? `"${documentText.substring(0, 1500)}"` : '(see attached image)'}
    Return JSON strictly: [{"key": "...", "value": "..."}]`;

    const contents = imageBase64 ? [
      {
        inlineData: {
          data: String(imageBase64).replace(/^data:image\/\w+;base64,/, ''),
          mimeType: 'image/png'
        }
      },
      promptText
    ] : promptText;

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents,
    });

    const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    extractParsed = JSON.parse(cleanJson);
  } catch (err) {
    console.error('Gemini extract-data error:', err);
    return res.status(502).json({ error: 'AI data extraction failed. Please try again in a moment. You were not charged.' });
  }

  // NOTE (audit, Aug 2026): this previously substituted the hardcoded
  // `fallbackData` sample invoice whenever Gemini's response wasn't a
  // JSON array — silently returning fake data as if it were a real
  // extraction, with success: true and no demo flag. Gemini WAS called
  // successfully here; a malformed/unusable response is a real failure
  // and must be reported as one, not masked with fabricated content.
  if (!Array.isArray(extractParsed) || extractParsed.length === 0) {
    return res.status(502).json({
      error: 'AI data extraction did not return a usable result. Please try again. You were not charged.'
    });
  }

  const aiQuota = await spendAiQuotaOrRespond(req, res);
  if (!aiQuota) return;

  const dataList = extractParsed;
  const csvContent = "Key,Value\n" + dataList.map((item: any) => `"${csvEscape(item.key)}","${csvEscape(item.value)}"`).join("\n");

  return res.json({
    success: true,
    extractedData: dataList,
    csvContent,
    aiQuota
  });
}))


// ==========================================
// CLIENT INTEGRATION (Vite Middleware)
// ==========================================
//
// BUG FIXED (see chat report): this used to unconditionally call
// app.listen() at the bottom of the file. Vercel's Node.js runtime does
// NOT run a persistent server that way — it imports this module and
// invokes the exported request handler per-invocation. Calling
// app.listen() here does nothing useful on Vercel (there's no long-lived
// process listening for it to bind to), and because the module never
// exported the Express `app`, Vercel had no handler to route requests to
// at all. That mismatch is why the deployed site was returning 404 on
// every route, including "/" — nothing was ever actually serving traffic.
//
// Fix: reuse the existing `isServerlessLike` flag (already used above for
// the read-only-filesystem /tmp handling) to skip app.listen() on
// Vercel/Lambda, and always export the Express app itself so Vercel's
// @vercel/node runtime can invoke it directly as the request handler.
// Traditional hosting (a VPS, Docker, `npm start` locally, etc.) is
// completely unaffected — it still goes through startServer() exactly as
// before, Vite dev middleware in development and app.listen() in
// production.
// ----------------------------------------------------------------------------
// Global error handler (added, Aug 2026 audit)
// ----------------------------------------------------------------------------
// Defense-in-depth: previously there was no catch-all Express error
// middleware. Every route handler in this file already has its own
// try/catch, so this is not expected to fire under normal operation — but
// without it, any error that DID slip through (an unexpected synchronous
// throw, a rejected promise passed to next(err), a bug in a future route)
// would fall through to Express's built-in default error handler, which
// (a) returns an HTML page instead of JSON, breaking every API consumer's
// error handling, and (b) includes the error's stack trace in the response
// body whenever NODE_ENV isn't exactly "production" (e.g. misconfigured
// env, local staging, a future refactor). This handler always returns a
// clean, generic JSON error and never includes stack traces or internal
// error details in the response, regardless of NODE_ENV — the real error
// is still logged server-side for debugging.
//
// IMPORTANT: Express only routes errors to middleware registered AFTER the
// route/middleware that threw, so this must be attached as the LAST thing,
// after the static/SPA-fallback route is registered below — not here.
/**
 * Maps a thrown error to a safe HTTP response (never leaks internals):
 *   - malformed JSON body            -> 400
 *   - body larger than the limit     -> 413
 *   - unverifiable entitlement       -> 503 (fail closed)
 *   - anything else (a real bug)     -> 500 generic
 * body-parser tags its errors with `type`, `status` and `expose`.
 */
export function resolveErrorResponse(err: any): { status: number; body: { error: string } } {
  if (err instanceof EntitlementLookupError) {
    return { status: 503, body: { error: err.message } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: 'Invalid JSON in request body.' } };
  }
  if (err?.type === 'entity.too.large') {
    return { status: 413, body: { error: 'Request body is too large.' } };
  }
  return { status: 500, body: { error: 'An unexpected server error occurred. Please try again.' } };
}

function registerGlobalErrorHandler() {
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const { status, body } = resolveErrorResponse(err);
    if (status >= 500) {
      console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    }
    if (res.headersSent) {
      return; // let Express finish the response it already started
    }
    res.status(status).json(body);
  });
}

// Unknown /api/* routes must return a JSON 404 instead of falling through to
// the SPA index.html fallback (which previously answered unknown API calls
// with HTTP 200 + HTML, breaking any programmatic consumer). Registered AFTER
// every real API route but BEFORE static/SPA serving.
function registerApiNotFound() {
  app.use('/api', (req, res) => {
    return res.status(404).json({ error: 'Not found' });
  });
}

function setupProductionStaticServing() {
  registerApiNotFound();
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath, {
    // Perf fix (Sep 2026): every static file used to get max-age=0 (no
    // caching at all), including Vite's content-hashed JS/CSS bundles under
    // /assets — a returning visitor re-downloaded the entire app on every
    // visit. Vite fingerprints those filenames with a content hash, so they
    // can be cached forever: a new deploy ships new filenames, never the
    // same URL with different content. Anything NOT under /assets (fonts,
    // favicons, robots.txt, sitemap.xml, index.html) is not fingerprinted,
    // so it keeps a short cache instead. index.html itself must never be
    // cached, or a returning visitor's browser could keep serving an old
    // HTML shell that references JS/CSS bundles deleted by a later deploy.
    setHeaders: (res, filePath) => {
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (path.relative(distPath, filePath).startsWith('assets' + path.sep)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));
  // Serve index.html as single page app fallback
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
  registerGlobalErrorHandler();
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    registerApiNotFound();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    registerGlobalErrorHandler();
  } else {
    setupProductionStaticServing();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Easy PDF Full-Stack Server listening on http://localhost:${PORT}`);
  });
}

if (isServerlessLike) {
  // Vercel/Lambda: no dev Vite middleware here (NODE_ENV is always
  // 'production' in these environments), no app.listen() — just wire up
  // the same static + SPA-fallback serving synchronously so the exported
  // app is ready to handle the very first invocation.
  setupProductionStaticServing();
} else {
  startServer();
}

export default app;
