/**
 * seo.ts — Per-page SEO metadata (Sept 2026, verification-pass fix)
 *
 * Each indexable page gets its own <title> and meta description in both
 * languages, applied at runtime in App.tsx via document.title and a direct
 * meta-tag update (see applyPageSeo()). This is what actually lets each
 * route in routes.ts function as a distinct, indexable page instead of
 * every URL sharing the same generic homepage title.
 *
 * Titles follow the "Page Name - EasyPDF" pattern (except the homepage,
 * which leads with the brand) and stay under ~60 characters; descriptions
 * stay under ~160 characters — both are standard SERP snippet limits.
 *
 * VERIFICATION-PASS FIX (this revision): the initial implementation only
 * updated <title> and the description/OG/Twitter meta tags. It never
 * touched <link rel="canonical">, the hreflang <link> tags, or a per-page
 * robots directive — so every route silently inherited the static
 * index.html values (canonical always "/", robots always "index, follow"
 * even on /admin/* and /workspace). applyPageSeo() now also corrects
 * those three things on every navigation.
 *
 * Hreflang limitation (reported, not silently "fixed" with fake data):
 * the app has exactly ONE URL per page regardless of language — language
 * is a client-side localStorage toggle, not a routing dimension (there is
 * no /ar/tools vs /en/tools). Real hreflang alternates require genuinely
 * different URLs per language; inventing an "en"/"ar" pair that both point
 * at the same URL doesn't violate Google's spec, but it's meaningless
 * boilerplate — with a single URL, Google already treats it as
 * self-referencing. So this build emits only:
 *   - hreflang="x-default" → the page's own canonical URL
 * If per-language URLs are added later (e.g. /ar/tools + /en/tools with
 * server-rendered <html lang> matching), replace this with real en/ar
 * alternates at that point.
 */

import { PageType } from '../types';
import { pageToPath, INDEXABLE_PAGES } from './routes';

const SITE_ORIGIN = 'https://easypdf-eight.vercel.app';

interface PageSeoEntry {
  title: { en: string; ar: string };
  description: { en: string; ar: string };
}

export const PAGE_SEO: Partial<Record<PageType, PageSeoEntry>> = {
  home: {
    title: {
      en: 'EasyPDF - Edit, Convert, Simplify Your PDF Files',
      ar: 'إيزي بي دي إف - تحرير وتحويل وتبسيط ملفات PDF',
    },
    description: {
      en: 'The elegant, secure tool to edit, convert, and simplify your PDF files — merge, split, compress, OCR, and AI-powered extras.',
      ar: 'أداة أنيقة وآمنة لتحرير وتحويل وتبسيط ملفات PDF — دمج، تقسيم، ضغط، OCR، وميزات مدعومة بالذكاء الاصطناعي.',
    },
  },
  tools: {
    title: {
      en: 'All PDF Tools - Merge, Split, Compress & More | EasyPDF',
      ar: 'كل أدوات PDF - دمج، تقسيم، ضغط والمزيد | إيزي بي دي إف',
    },
    description: {
      en: 'Browse every EasyPDF tool: merge, split, compress, convert, protect, OCR, watermark, e-signature, and AI-powered PDF editing.',
      ar: 'تصفح كل أدوات إيزي بي دي إف: دمج، تقسيم، ضغط، تحويل، حماية، OCR، علامة مائية، توقيع إلكتروني، وتحرير PDF بالذكاء الاصطناعي.',
    },
  },
  pricing: {
    title: {
      en: 'Pricing Plans - EasyPDF',
      ar: 'خطط الأسعار - إيزي بي دي إف',
    },
    description: {
      en: 'Simple, transparent EasyPDF pricing. Start free, upgrade to Pro for unlimited AI-powered PDF tools.',
      ar: 'أسعار إيزي بي دي إف بسيطة وشفافة. ابدأ مجاناً، أو ترقَّ إلى Pro للاستفادة الكاملة من أدوات PDF المدعومة بالذكاء الاصطناعي.',
    },
  },
  about: {
    title: {
      en: 'About Us - EasyPDF',
      ar: 'من نحن - إيزي بي دي إف',
    },
    description: {
      en: 'Learn about EasyPDF — our mission to make PDF editing simple, secure, and accessible for everyone.',
      ar: 'تعرّف على إيزي بي دي إف — مهمتنا في جعل تحرير ملفات PDF بسيطاً وآمناً ومتاحاً للجميع.',
    },
  },
  terms: {
    title: {
      en: 'Terms of Service - EasyPDF',
      ar: 'شروط الخدمة - إيزي بي دي إف',
    },
    description: {
      en: 'Read the EasyPDF Terms of Service governing use of our PDF editing and conversion tools.',
      ar: 'اطّلع على شروط خدمة إيزي بي دي إف التي تحكم استخدام أدوات تحرير وتحويل PDF.',
    },
  },
  privacy: {
    title: {
      en: 'Privacy Policy - EasyPDF',
      ar: 'سياسة الخصوصية - إيزي بي دي إف',
    },
    description: {
      en: 'Read the EasyPDF Privacy Policy to understand how we handle and protect your documents and data.',
      ar: 'اطّلع على سياسة خصوصية إيزي بي دي إف لمعرفة كيفية تعاملنا مع مستنداتك وبياناتك وحمايتها.',
    },
  },
  refund: {
    title: {
      en: 'Refund Policy - EasyPDF',
      ar: 'سياسة الاسترجاع - إيزي بي دي إف',
    },
    description: {
      en: 'Read the EasyPDF Refund Policy for details on cancellations and refund eligibility.',
      ar: 'اطّلع على سياسة الاسترجاع الخاصة بإيزي بي دي إف لمعرفة تفاصيل الإلغاء وأهلية الاسترجاع.',
    },
  },
};

/**
 * Applies a page's title, meta description, canonical URL, hreflang, and
 * robots directive to the live document. Called from App.tsx on mount and
 * whenever activePage or lang changes.
 *
 * - Indexable pages (routes.ts INDEXABLE_PAGES): canonical = that page's
 *   own URL, robots = "index, follow".
 * - Everything else (workspace, checkout, admin-*): robots is forced to
 *   "noindex, nofollow" so these pages can never be indexed even if
 *   someone links to them directly — robots.txt alone only stops crawling,
 *   it doesn't stop a URL that's discovered some other way (e.g. a shared
 *   link) from being indexed. A live meta tag is the actual "don't index
 *   this" instruction; canonical/title/description are left untouched for
 *   these since they don't need SEO copy.
 */
/**
 * @param page - the resolved PageType to apply SEO for.
 * @param lang - current UI language, selects which copy variant to use.
 * @param wasUnknownPath - true if the ORIGINAL url the user/crawler landed
 *   on did not match any real route (see isKnownPath() in routes.ts).
 *   MUST be captured once at load time in App.tsx and passed in — it
 *   cannot be safely re-derived from window.location.pathname inside this
 *   function, because App.tsx's URL-sync effect (history.pushState) runs
 *   before this one and rewrites the address bar from the bogus original
 *   path to the real "/" the moment activePage resolves to 'home'. A
 *   real headless-browser test caught this: checking
 *   window.location.pathname here always saw the already-rewritten "/"
 *   and never actually flagged an unknown path as noindex.
 */
export function applyPageSeo(page: PageType, lang: 'en' | 'ar', wasUnknownPath: boolean = false): void {
  // Soft-404 guard: server.ts's SPA fallback serves index.html (HTTP 200)
  // for ANY unrecognized path, and pathToPage() maps that same unknown
  // path to 'home' so the app has something to render. That's correct
  // behavior for rendering, but it means a typo'd/garbage URL would
  // otherwise silently inherit the real homepage's "index, follow" +
  // canonical "/" — telling Google a fake URL is the canonical homepage.
  const isIndexable = !wasUnknownPath && INDEXABLE_PAGES.includes(page);
  const canonicalUrl = `${SITE_ORIGIN}${pageToPath(page)}`;

  // Robots directive — applies to every page, indexable or not.
  const robotsTag = document.querySelector('meta[name="robots"]');
  if (robotsTag) {
    robotsTag.setAttribute('content', isIndexable ? 'index, follow' : 'noindex, nofollow');
  }

  // Canonical URL — always points at the CURRENT page's own path, never
  // hardcoded to "/". Applies even to non-indexable pages (harmless — a
  // noindex page's canonical is not acted on by Google, but it's still
  // correct to not lie about it).
  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag) canonicalTag.setAttribute('href', canonicalUrl);

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

  // Hreflang: only x-default, self-referencing (see file-level note above
  // on why en/ar alternates are not emitted — there is only one URL).
  const hreflangDefault = document.querySelector('link[hreflang="x-default"]');
  if (hreflangDefault) hreflangDefault.setAttribute('href', canonicalUrl);

  const entry = PAGE_SEO[page];
  if (!entry) return; // workspace/checkout/admin-* have no title/description copy

  document.title = entry.title[lang];

  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.setAttribute('content', entry.description[lang]);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', entry.title[lang]);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', entry.description[lang]);

  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', entry.title[lang]);

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', entry.description[lang]);
}
