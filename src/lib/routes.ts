/**
 * routes.ts — Canonical PageType ↔ URL path mapping (SEO routing, Sept 2026)
 *
 * The app previously switched pages purely via React state (`activePage`),
 * so every page rendered under the same URL ("/"). That meant Google could
 * never index /tools, /pricing, /about, etc. as separate pages — the single
 * biggest structural SEO gap in the site.
 *
 * This file is the single source of truth for how each PageType maps to a
 * real browser URL. App.tsx uses it to:
 *   1. Read the initial page from the URL on first load (deep links work —
 *      opening easypdf.com/pricing directly lands on the pricing page).
 *   2. Push a new URL via history.pushState() whenever the user navigates,
 *      so the address bar always reflects the visible page.
 *   3. Restore the correct page on browser back/forward (popstate).
 *
 * No routing library is used — the app already manages `activePage` as a
 * single piece of state and pushes/reads window.history manually elsewhere
 * (see the existing /checkout-success handling in App.tsx), so this extends
 * that same lightweight pattern rather than introducing react-router.
 *
 * Pages intentionally EXCLUDED from the public path map (checkout, workspace,
 * admin-*) are user/account-specific or internal — they still work via the
 * existing in-app navigation, but are not meant to be indexed or deep-linked
 * to from search results, so they keep a path but robots.txt disallows them
 * (see public/robots.txt).
 */

import { PageType } from '../types';

/** PageType → public URL path. Every PageType must appear here exactly once. */
export const PAGE_TO_PATH: Record<PageType, string> = {
  'home': '/',
  'tools': '/tools',
  'pricing': '/pricing',
  'about': '/about',
  'terms': '/terms',
  'privacy': '/privacy',
  'refund': '/refund',
  // Functional/account pages: real paths so deep-linking & refresh still
  // work, but excluded from the sitemap and disallowed in robots.txt.
  'workspace': '/workspace',
  'checkout': '/checkout',
  'admin-dashboard': '/admin/dashboard',
  'admin-editor': '/admin/editor',
  'admin-pricing': '/admin/pricing',
  'admin-users': '/admin/users',
  'admin-settings': '/admin/settings',
};

/** Reverse lookup: URL path → PageType, built once from PAGE_TO_PATH. */
const PATH_TO_PAGE: Record<string, PageType> = Object.entries(PAGE_TO_PATH)
  .reduce((acc, [page, path]) => {
    acc[path] = page as PageType;
    return acc;
  }, {} as Record<string, PageType>);

/**
 * Resolves a URL pathname to a PageType. Falls back to 'home' for unknown
 * paths (e.g. a stale bookmark to a removed page) rather than showing a
 * blank screen — matches the SPA fallback server.ts already serves for any
 * unrecognised path.
 */
export function pathToPage(pathname: string): PageType {
  // Normalise: strip a single trailing slash (except root itself) so both
  // "/tools" and "/tools/" resolve the same way.
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return PATH_TO_PAGE[normalized] ?? 'home';
}

/**
 * Returns true only if `pathname` is one of the app's real, defined paths.
 * Exists because pathToPage() collapses "genuinely unrecognized URL" and
 * "the actual homepage path" into the same 'home' PageType — that's
 * correct for what to *render* (server.ts's SPA fallback already serves
 * the same index.html for both), but it lost the distinction needed to
 * decide whether a URL should be indexable. A random/typo URL rendering
 * the homepage is a soft-404 (200 OK content served for a page that
 * doesn't really exist) and must not claim to be indexable — see
 * applyPageSeo() in src/lib/seo.ts, which calls this to noindex unknown
 * paths while leaving the real "/" homepage indexable.
 */
export function isKnownPath(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return normalized in PATH_TO_PAGE;
}

/** Resolves a PageType to its canonical URL path. */
export function pageToPath(page: PageType): string {
  return PAGE_TO_PATH[page] ?? '/';
}

/**
 * Pages that should be indexed by search engines and listed in the sitemap.
 * Kept separate from PAGE_TO_PATH so adding a new account/internal page in
 * the future doesn't accidentally get indexed without an explicit decision.
 */
export const INDEXABLE_PAGES: PageType[] = [
  'home', 'tools', 'pricing', 'about', 'terms', 'privacy', 'refund',
];
