# Easy PDF

A web app for PDF tools: merge, compress, split, password-protect/unlock,
OCR, and AI-powered edit/enhance/summarize.

- **Live:** https://easypdf-weld.vercel.app/
- **Frontend:** React + Vite + TypeScript
- **Backend:** Express + TypeScript, deployed on Vercel
- **Auth & Database:** Supabase (Auth + Postgres)
- **File storage:** Supabase Storage (bucket: `documents`)
- **Payments:** Stripe (Checkout + Webhooks)
- **AI:** Google Gemini API (`@google/genai`)

> This project previously shipped with the default "AI Studio / Cloud Run"
> boilerplate README. That workflow is **not** what's actually used —
> the app is built and run as a standard Vite + Express project and deployed
> on Vercel. This README reflects the real setup.

## Prerequisites

- Node.js 18+
- A Supabase project (Auth + Postgres + Storage)
- A Stripe account (test mode is fine for development)
- A Google Gemini API key

## Environment variables

Copy `.env.example` to `.env` and fill in real values. Required for full
functionality:

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend (browser) | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (browser) | Supabase anon/public key |
| `SUPABASE_URL` | Backend | Same Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | **Required in production.** Bypasses RLS so the server can update plans, admin flags, and quotas. Never expose this to the browser. |
| `GEMINI_API_KEY` | Backend | Google Gemini API key. Without it, AI endpoints return clearly-labeled (`demo: true`) placeholder responses instead of real AI output. |
| `GEMINI_MODEL` | Backend (optional) | Gemini model used by every AI endpoint. Defaults to `gemini-2.5-flash` when unset. |
| `STRIPE_SECRET_KEY` | Backend | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Backend | From the Stripe Dashboard webhook endpoint (see below). Required for the webhook signature check to pass. |
| `APP_URL` | Backend | Public base URL used to build Stripe Checkout success/cancel redirect URLs (e.g. `https://easypdf-weld.vercel.app`) |
| `NODE_ENV` | Backend | Must be `production` in production — this is what disables all mock/dev-only auth and storage fallbacks. Set automatically by `npm start` via `cross-env`. |

`SUPABASE_ANON_KEY` / `SUPABASE_KEY` are accepted as backend fallbacks if
`SUPABASE_SERVICE_ROLE_KEY` isn't set, but **should not be relied on** — with
Row Level Security locked down (see below), an anon-key backend client
cannot write to `public.users`, which breaks admin actions and automatic
Stripe plan activation.

## Supabase setup

1. **Database tables** — apply, in order:
   - `supabase_phase3_2_migration.sql` (subscriptions / plan-related schema)
   - `supabase_stripe_events.sql` (webhook idempotency table)
   - `supabase_app_strings.sql` (admin-editable UI copy, used by
     `/api/admin/strings`)
2. **Row Level Security — apply ALL THREE lockdown migrations.** Each one
   closes a distinct self-upgrade-to-Pro / privilege-escalation bypass; the
   app is not safe to run in production with only some of them applied:
   - `supabase_users_rls_lockdown.sql` — prevents a signed-in user from
     granting themselves Pro or Admin by updating their own `public.users`
     row from the browser.
   - `supabase_subscriptions_rls_lockdown.sql` — **highest priority.**
     Without it, a signed-in user can `insert` a fake `status: 'active'` row
     into `public.subscriptions` from their browser and become Pro for free,
     completely bypassing Stripe, even with the migration above applied.
   - `supabase_uploaded_files_rls_lockdown.sql` — defensive; this table's
     `CREATE TABLE` isn't version-controlled in this repo (it was created
     directly in the Supabase dashboard at some point), so its RLS state
     can't be verified from the codebase alone.

   Apply all three in the Supabase SQL editor, then verify in
   **Authentication → Policies**:
   - `public.users`: a SELECT policy restricting rows to `auth.uid() = id`,
     an INSERT policy restricting new rows to safe defaults
     (`plan='free'`, `admin_granted_pro=false`, `is_admin=false`), and
     **no UPDATE policy**.
   - `public.subscriptions`: exactly one SELECT policy
     (`auth.uid() = user_id`) and **no INSERT/UPDATE/DELETE policy**.
   - `public.uploaded_files`: exactly one SELECT policy
     (`auth.uid() = user_id`) and **no INSERT/UPDATE/DELETE policy**.

   All plan/admin/subscription/file-record writes are only ever performed
   by the backend using `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS —
   confirm that variable is set in your deployment environment (see above),
   since once RLS is locked down, a backend running on the anon key alone
   would silently lose write access to these tables.
3. **Storage** — create a bucket named `documents`. Uploaded PDFs/images and
   AI-edited PDFs are stored under `pdfs/{userId}/...` and
   `edited/{userId}/...` inside it. The backend uses the service role key to
   read/write, so bucket policies can stay locked down (no public write
   access needed).
4. **OAuth providers** (Google / Apple Sign-In) — configured in
   **Authentication → Providers** in the Supabase dashboard, not in code.
   Apple Sign-In additionally requires an active Apple Developer account.

None of the SQL files run themselves — they must be executed manually
against your Supabase project.

## Stripe setup

1. Add a webhook endpoint in the Stripe Dashboard pointing at:
   `https://<your-domain>/api/stripe/webhook`
2. Copy the generated signing secret into `STRIPE_WEBHOOK_SECRET`.
3. The webhook automatically activates/updates the user's plan in the
   database the moment payment succeeds — no manual step needed once this is
   configured. The frontend also polls `/api/user/me` right after returning
   from Stripe Checkout so the UI reflects the new plan immediately (see
   `src/components/CheckoutSuccessOverlay.tsx`).
4. The project currently ships with a **temporary/placeholder** Stripe key;
   a migration to Moyasar is planned once the product is finished.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev
```

## Build & run in production mode

```bash
npm run build   # builds the Vite frontend + bundles server.ts to dist/server.cjs
npm start        # runs dist/server.cjs with NODE_ENV=production
```

## Deployment (Vercel)

The app is deployed on Vercel. Confirm in the Vercel project's **Build &
Development Settings** (or `vercel.json`, if present) exactly how
`server.ts` is built and served, since this determines whether Vercel's
serverless filesystem constraints apply the same way as documented here.
Independently of that: `/tmp` is the only writable path at runtime, and it
does **not** persist between separate invocations — this is why all
persistent file storage goes through Supabase Storage rather than local
disk, and local disk is only ever used as a local-development fallback
(explicitly disabled when `NODE_ENV=production`).

## Testing

There is currently no automated test suite. After making changes, at
minimum:

- `npm run build` — must complete without errors
- Manually walk through: sign up, log in (correct + wrong password), free
  quota limits, an admin-only route as a non-admin user, upload → edit →
  download a PDF, Stripe checkout in test mode, and the AI tools (OCR,
  Copilot, enhance, smart-rename, extract-data, summarize) with a real
  `GEMINI_API_KEY` configured.
