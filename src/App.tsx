import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PageType, ToolType } from './types';
import TopNavBar from './components/TopNavBar';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import LandingPage from './components/LandingPage';
import ToolsPage from './components/ToolsPage';
import PricingPage from './components/PricingPage';
import CheckoutPage from './components/CheckoutPage';
import AboutPage from './components/AboutPage';
import TermsPage from './components/TermsPage';
import PrivacyPage from './components/PrivacyPage';
import RefundPage from './components/RefundPage';
import AuthModal from './components/AuthModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import CheckoutSuccessOverlay from './components/CheckoutSuccessOverlay';
import SplashScreen from './components/SplashScreen';
import Footer from './components/Footer';
import { Shield, Cpu, X } from 'lucide-react';
import { TranslationProvider } from './lib/TranslationContext';
import { getPageTransitionVariants, getReducedOrVariants } from './lib/animations';
import { pathToPage, pageToPath, isKnownPath } from './lib/routes';
import { applyPageSeo } from './lib/seo';

// Performance fix (Aug 2026 audit): these were previously static imports,
// which meant EVERY visitor's initial page load downloaded Workspace.tsx
// (which pulls in pdfjs-dist, tesseract.js/OCR, and every PDF tool
// component) and all five admin-only pages, even a first-time visitor who
// only ever sees the landing page. That was the single largest
// contributor to the ~2.15MB main JS bundle flagged in the chat report.
// React.lazy() + Suspense defers downloading each of these until the user
// actually navigates to that page — no behavior change, same components,
// same props, same design; only the loading strategy changes. The
// Suspense fallback below reuses the exact same spinner markup already
// used for the auth-loading state further down this file, so the visual
// experience during the (usually brief) chunk download is consistent with
// the rest of the app.
const Workspace = lazy(() => import('./components/Workspace'));
const AdminDashboardPage = lazy(() => import('./components/AdminDashboardPage'));
const AdminEditorPage = lazy(() => import('./components/AdminEditorPage'));
const AdminPricingPage = lazy(() => import('./components/AdminPricingPage'));
const AdminUserPage = lazy(() => import('./components/AdminUserPage'));
const AdminSettingsPage = lazy(() => import('./components/AdminSettingsPage'));

// Suspense fallback shown while a lazy-loaded page chunk (Workspace or an
// admin page) downloads. Reuses the exact same spinner markup as the
// existing auth-loading screen below, so it's visually consistent with an
// already-established loading state in this app (no new design element).
function PageLoadingFallback({ lang }: { lang: 'en' | 'ar' }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-on-background font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  );
}

export default function App() {
  // Real routing (Sept 2026 SEO pass): activePage now initializes from the
  // current URL path so deep links (e.g. opening /pricing directly, or a
  // bookmark to /tools) land on the right page instead of always showing
  // home. /checkout-success is a special one-shot redirect target (handled
  // separately below via showCheckoutSuccess) and is intentionally excluded
  // here so it doesn't get treated as a normal page.
  const [activePage, setActivePage] = useState<PageType>(() => {
    if (typeof window === 'undefined') return 'home';
    if (window.location.pathname === '/checkout-success') return 'home';
    return pathToPage(window.location.pathname);
  });

  // Soft-404 tracking (SEO verification pass): a genuinely unknown/typo'd
  // URL falls back to rendering 'home' (see pathToPage() above and
  // server.ts's SPA "app.get('*', ...)" fallback), but the URL-sync effect
  // below then rewrites the address bar to the real "/" — which would
  // silently erase all trace that the original URL was bogus by the time
  // applyPageSeo() runs. This is captured ONCE, synchronously, from the
  // untouched initial pathname so it survives that rewrite and lets
  // applyPageSeo() correctly noindex the response instead of the rewrite
  // making a fake URL look like a legitimate visit to the real homepage.
  const [wasUnknownPath] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.pathname === '/checkout-success') return false;
    return !isKnownPath(window.location.pathname);
  });
  const [activeTool, setActiveTool] = useState<ToolType>('merge');
  const [uploadedFiles, setUploadedFiles] = useState<FileList | null>(null);
  
  // Global User Session State
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; plan: 'free' | 'pro'; is_admin?: boolean } | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth Overlay Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // About Modal State
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Post-checkout confirmation overlay. Stripe redirects the browser back to
  // `${APP_URL}/checkout-success?session_id=...` after a successful payment
  // (see the `success_url` built in the /api/stripe/checkout backend route).
  // The webhook (/api/stripe/webhook) already flips the user's plan to 'pro'
  // in the database automatically and near-instantly — this flag is what
  // makes the *UI* pick that change up right away instead of the user
  // having to log out/in or refresh to see it.
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/checkout-success'
  );

  // Global Language State
  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    const saved = localStorage.getItem('lang');
    return (saved === 'ar' || saved === 'en') ? saved : 'en';
  });

  // Global Light/Dark Theme State (Sept 2026).
  // The inline script in index.html already set `data-theme` on <html>
  // before this component mounted (to avoid a flash of the wrong theme),
  // so read that same attribute here to initialize state in sync with what
  // is already painted, rather than re-deriving it and risking a mismatch.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr;
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
    return saved === 'light' ? 'light' : 'dark';
  });


  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured) {
      // Local dev fallback: AuthModal.tsx's local-simulation login (used only
      // when Supabase env vars are missing, and only in dev) stores its
      // session in localStorage — restore it here too, otherwise a page
      // refresh in that mode silently signs the user back out even though
      // 'user_session' is still sitting in localStorage.
      const isDev = (import.meta as any).env?.DEV || (import.meta as any).env?.MODE === 'development';
      if (isDev) {
        const saved = localStorage.getItem('user_session');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.id) setCurrentUser(parsed);
          } catch (e) {
            localStorage.removeItem('user_session');
          }
        }
      }
      if (isMounted) setAuthLoading(false);
      return;
    }

    const syncSessionUser = async (session: any) => {
      if (!session?.user) {
        if (isMounted) {
          setCurrentUser(null);
          localStorage.removeItem('user_session');
        }
        return;
      }

      try {
        const { data: userRow, error: userFetchError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        let plan: 'free' | 'pro' = 'free';
        let isAdmin = false;
        if (userRow) {
          plan = userRow.plan || 'free';
          isAdmin = userRow.is_admin === true || userRow.role === 'admin';
        } else if (userFetchError && userFetchError.code !== 'PGRST116') {
          // BUG FIX (Aug 2026 admin-visibility audit): PGRST116 is PostgREST's
          // code for "no rows found" — the correct, expected signal for a
          // genuinely brand-new user who has no public.users row yet. Any
          // OTHER error here (an RLS SELECT denial, a dropped connection, a
          // transient Supabase hiccup, etc.) used to fall through to the
          // exact same "auto-provision new user" branch below. That branch
          // upserts safe defaults (plan: 'free', no is_admin/role at all),
          // which — for a row that already exists — is an UPDATE. Under
          // supabase_users_rls_lockdown.sql there is deliberately NO client
          // UPDATE policy on public.users, so that upsert silently fails
          // (only ever logged via console.warn), while this function had
          // already computed isAdmin = false / plan = 'free' and would go on
          // to overwrite currentUser (and localStorage) with those wrong
          // values regardless. Net effect: a real Admin or Pro account whose
          // profile read failed even once — for any reason — would silently
          // lose their Admin Panel link / Pro badge with zero visible error,
          // and the wrong state would persist across reloads via
          // localStorage. Bail out of this sync attempt instead: leave
          // currentUser/localStorage untouched so a read failure can never
          // silently downgrade a real user's plan/admin status.
          console.error('Failed to load user profile from Supabase (not a new-user case):', userFetchError);
          if (isMounted) setAuthLoading(false);
          return;
        } else {
          // Auto-provision user profile in public.users on first OAuth / email sign in
          const { error: upsertError } = await supabase
            .from('users')
            .upsert([
              {
                id: session.user.id,
                email: session.user.email || '',
                plan: 'free',
                created_at: new Date().toISOString()
              }
            ], { onConflict: 'id' });
          if (upsertError) {
            console.warn('Error auto-inserting user row:', upsertError);
          }
        }

        const loggedInUser = {
          id: session.user.id,
          email: session.user.email || '',
          plan,
          is_admin: isAdmin
        };
        if (isMounted) {
          setCurrentUser(loggedInUser);
          localStorage.setItem('user_session', JSON.stringify(loggedInUser));
        }

        if (window.location.hash && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (err) {
        console.error('Session user sync error:', err);
        if (isMounted) {
          setCurrentUser(null);
          localStorage.removeItem('user_session');
        }
      }
    };

    // Initial session resolution from Supabase Auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSessionUser(session).finally(() => {
        if (isMounted) setAuthLoading(false);
      });
    }).catch((err) => {
      console.error('Get session error:', err);
      if (isMounted) {
        setCurrentUser(null);
        localStorage.removeItem('user_session');
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived via the "reset password" email link — Supabase has
        // signed them into a temporary recovery session. Show the modal
        // that lets them actually set a new password (see
        // ResetPasswordModal.tsx) instead of leaving them signed in with
        // no way to act on it.
        if (isMounted) setShowResetPasswordModal(true);
      }
      if (event === 'SIGNED_OUT' || !session) {
        if (isMounted) {
          setCurrentUser(null);
          localStorage.removeItem('user_session');
        }
      } else if (session) {
        await syncSessionUser(session);
      }
      if (isMounted) setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Clean the `/checkout-success` URL immediately so refreshing or sharing
  // the link doesn't re-trigger the overlay or leak the Stripe session_id;
  // `showCheckoutSuccess` (captured above) is what actually drives the UI.
  useEffect(() => {
    if (showCheckoutSuccess && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
  }, [showCheckoutSuccess]);

  // If someone lands on /checkout-success without an active session (e.g.
  // the Supabase session failed to restore), there's nothing to poll —
  // don't get stuck showing a spinner forever.
  useEffect(() => {
    if (!authLoading && showCheckoutSuccess && !currentUser) {
      setShowCheckoutSuccess(false);
    }
  }, [authLoading, currentUser, showCheckoutSuccess]);

  // Redirect non-admin users away from admin views
  useEffect(() => {
    if (!authLoading) {
      if (activePage.startsWith('admin-') && (!currentUser || !currentUser.is_admin)) {
        setActivePage('home');
      }
    }
  }, [authLoading, activePage, currentUser]);

  // ── Real routing sync (Sept 2026 SEO pass) ──────────────────────────────
  // Keep the browser address bar in sync with activePage so every page has
  // a real, shareable, indexable URL instead of everything living under "/".
  // pushState (not replaceState) so each navigation is a real history entry
  // the user can navigate back through — this is what makes browser
  // back/forward work correctly for in-app navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip while the one-shot checkout-success overlay is showing — that
    // flow already manages its own URL cleanup (see the effect above) and
    // shouldn't have a competing pushState firing at the same time.
    if (showCheckoutSuccess) return;

    const targetPath = pageToPath(activePage);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page: activePage }, '', targetPath);
    }
  }, [activePage, showCheckoutSuccess]);

  // Update <title> and meta description/OG/Twitter tags for the current
  // page + language. Runs on mount and on every page/language change so a
  // shared link's social preview and the browser tab title always match
  // what's actually on screen.
  useEffect(() => {
    applyPageSeo(activePage, lang, wasUnknownPath);
  }, [activePage, lang, wasUnknownPath]);

  // Browser back/forward support: when the user presses back/forward, the
  // URL changes but React state doesn't know about it on its own — this
  // listener re-derives activePage from the new URL so the visible page
  // matches the address bar again.
  useEffect(() => {
    const onPopState = () => {
      setActivePage(pathToPage(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleToggleLang = () => {
    const nextLang = lang === 'en' ? 'ar' : 'en';
    setLang(nextLang);
    localStorage.setItem('lang', nextLang);
  };

  // Keep <html lang>/<html dir> in sync with the in-app language, not just
  // the inline bootstrap script's first-paint guess above (screen readers,
  // the browser's built-in translate prompt, and :lang()/[dir] CSS all read
  // these attributes, not React state).
  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }, [lang]);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Keep the <html data-theme> attribute in sync with state (covers the
  // rare case where state changes without going through the toggle above,
  // and is a harmless no-op otherwise since the toggle already sets it).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Route Protection Interceptor
  const handleNavigate = (page: PageType) => {
    const protectedPages: PageType[] = ['workspace', 'checkout', 'admin-dashboard', 'admin-editor', 'admin-pricing', 'admin-users', 'admin-settings'];
    if (protectedPages.includes(page) && !currentUser) {
      setIsSignUp(false);
      setShowAuthModal(true);
      return;
    }
    if (page.startsWith('admin-') && currentUser && !currentUser.is_admin) {
      console.warn('Access denied: user is not an administrator', currentUser.email);
      return;
    }
    setActivePage(page);
  };

  const handleSelectTool = (tool: ToolType) => {
    setActiveTool(tool);
    handleNavigate('workspace');
  };

  const handleFilesDroppedFromLanding = (files: FileList) => {
    setUploadedFiles(files);
    // Automatically route to workspace, defaulting to merge (or split if only 1 file)
    if (files.length === 1) {
      setActiveTool('split');
    } else {
      setActiveTool('merge');
    }
    handleNavigate('workspace');
  };

  const handlePlanSelected = (planName: string) => {
    if (!currentUser) {
      setIsSignUp(true);
      setShowAuthModal(true);
    } else {
      handleNavigate('checkout');
    }
  };

  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Error signing out:', err);
    }
    setCurrentUser(null);
    localStorage.removeItem('user_session');
    setActivePage('home');
  };

  const shouldReduceMotion = useReducedMotion();
  const pageVariants = getReducedOrVariants(
    getPageTransitionVariants(lang),
    !!shouldReduceMotion
  );

  // Full-screen brand splash shown once when the app first loads, before
  // the home page (already the default activePage) is revealed
  // underneath it. Runs on its own timer independent of the session
  // check below so the brand intro can complete independently
  // instead of racing however long auth verification happens to take;
  // if that check is somehow still running once the splash finishes, the
  // brief spinner below covers that (rare, since auth checks normally
  // resolve well within the splash's duration).
  //
  // Skipped entirely when landing on /checkout-success straight from a
  // real Stripe payment — someone who just paid should see their
  // confirmation immediately, not wait through an unrelated brand intro
  // intro first (audit, Aug 2026).
  // Show splash only once per browser session (not on every navigation or
  // page refresh). localStorage key 'epdf_seen' is set permanently after
  // the first visit so returning users go straight to the app.
  // Skipped entirely on /checkout-success to avoid blocking the confirmation.
  const hasSeenSplash = typeof localStorage !== 'undefined'
    ? localStorage.getItem('epdf_seen') === '1'
    : false;
  const [showSplash, setShowSplash] = useState(!showCheckoutSuccess && !hasSeenSplash);

  const handleSplashFinish = () => {
    try { localStorage.setItem('epdf_seen', '1'); } catch (_) { /* private browsing */ }
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen lang={lang} onFinish={handleSplashFinish} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center text-on-background font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-on-surface-variant font-mono">
            {lang === 'ar' ? 'جاري التحقق من الجلسة...' : 'Authenticating session...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <TranslationProvider currentLang={lang} setCurrentLang={setLang}>
      <div 
        className="bg-mesh min-h-screen text-on-background flex flex-col relative overflow-hidden"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
      
      {/* Decorative Blur Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="glow-blob bg-primary/10 w-[500px] h-[500px] top-[-100px] left-[-150px]"></div>
        <div className="glow-blob bg-secondary/8 w-[600px] h-[600px] bottom-[-200px] right-[-100px]" style={{ animationDelay: '-5s' }}></div>
        <div className="glow-blob bg-violet-500/5 w-[400px] h-[400px] top-[40%] left-[60%]" style={{ animationDuration: '30s' }}></div>
      </div>

      {/* Top Navbar */}
      {!activePage.startsWith('admin-') && (
        <TopNavBar 
          activePage={activePage} 
          onNavigate={handleNavigate} 
          onOpenSignUp={() => {
            setIsSignUp(false);
            setShowAuthModal(true);
          }}
          onOpenAbout={() => setActivePage('about')}
          lang={lang}
          onToggleLang={handleToggleLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      )}

      {/* Main Container Canvas */}
      {/* Phase 7 (mobile polish): pt reduced on mobile (nav bar is shorter
          there) and bottom padding accounts for safe-area-inset-bottom on
          devices with a home indicator. Horizontal padding tightened on
          the smallest screens so content isn't cramped against the edge. */}
      <main className={`flex-grow relative z-10 flex flex-col justify-center ${
        activePage.startsWith('admin-')
          ? 'w-full'
          : 'pt-[84px] sm:pt-[100px] md:pt-[120px] pb-[max(4rem,env(safe-area-inset-bottom))] px-4 sm:px-6 md:px-12 max-w-7xl mx-auto w-full'
      }`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className="w-full flex flex-col items-center"
          >
            {activePage === 'home' && (
              <LandingPage 
                onSelectTool={handleSelectTool} 
                onNavigate={setActivePage}
                onFilesDropped={handleFilesDroppedFromLanding}
                lang={lang}
              />
            )}

            {activePage === 'tools' && (
              <ToolsPage onSelectTool={handleSelectTool} lang={lang} />
            )}

            {activePage === 'pricing' && (
              <PricingPage onPlanSelected={handlePlanSelected} lang={lang} />
            )}

            {activePage === 'workspace' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <Workspace 
                  initialTool={activeTool} 
                  uploadedFiles={uploadedFiles} 
                  onClearUploadedFiles={() => setUploadedFiles(null)}
                  lang={lang}
                  setLang={setLang}
                  currentUser={currentUser}
                  onUpgrade={() => handleNavigate('pricing')}
                />
              </Suspense>
            )}

            {activePage === 'checkout' && (
              <CheckoutPage onNavigate={setActivePage} lang={lang} currentUser={currentUser} />
            )}

            {activePage === 'about' && (
              <AboutPage lang={lang} />
            )}

            {activePage === 'terms' && (
              <TermsPage lang={lang} />
            )}

            {activePage === 'privacy' && (
              <PrivacyPage lang={lang} currentUser={currentUser} onAccountDeleted={handleLogout} />
            )}

            {activePage === 'refund' && (
              <RefundPage lang={lang} />
            )}

            {activePage === 'admin-dashboard' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <AdminDashboardPage onNavigate={setActivePage} lang={lang} setLang={setLang} onLogout={handleLogout} />
              </Suspense>
            )}

            {activePage === 'admin-editor' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <AdminEditorPage onNavigate={setActivePage} lang={lang} setLang={setLang} onLogout={handleLogout} />
              </Suspense>
            )}

            {activePage === 'admin-pricing' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <AdminPricingPage onNavigate={setActivePage} lang={lang} setLang={setLang} onLogout={handleLogout} />
              </Suspense>
            )}

            {activePage === 'admin-users' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <AdminUserPage onNavigate={setActivePage} lang={lang} setLang={setLang} onLogout={handleLogout} />
              </Suspense>
            )}

            {activePage === 'admin-settings' && (
              <Suspense fallback={<PageLoadingFallback lang={lang} />}>
                <AdminSettingsPage onNavigate={setActivePage} lang={lang} setLang={setLang} onLogout={handleLogout} />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      {!activePage.startsWith('admin-') && <Footer onNavigate={setActivePage} onShowAbout={() => setShowAboutModal(true)} lang={lang} isAdmin={!!currentUser?.is_admin} />}

      {/* Modern Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        isSignUpDefault={isSignUp}
        lang={lang}
        onSuccess={(user) => {
          if (user) {
            setCurrentUser(user);
          }
          setShowAuthModal(false);
          setActivePage('workspace');
        }}
      />

      {/* Password Recovery Modal (shown after clicking the "reset password" email link) */}
      <ResetPasswordModal
        isOpen={showResetPasswordModal}
        onClose={() => {
          setShowResetPasswordModal(false);
          window.history.replaceState(null, '', window.location.pathname);
        }}
        lang={lang}
      />

      {/* Post-checkout Pro plan activation confirmation */}
      {showCheckoutSuccess && currentUser && (
        <CheckoutSuccessOverlay
          lang={lang}
          onActivated={({ plan }) => {
            setCurrentUser((prev) => (prev ? { ...prev, plan } : prev));
            const saved = localStorage.getItem('user_session');
            if (saved) {
              try {
                const parsed = JSON.parse(saved);
                localStorage.setItem('user_session', JSON.stringify({ ...parsed, plan }));
              } catch {
                // ignore malformed cached session, non-fatal
              }
            }
          }}
          onClose={() => {
            setShowCheckoutSuccess(false);
            setActivePage('workspace');
          }}
        />
      )}

      {/* Futuristic About Us Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fadeIn">
          <div className="glass-panel rounded-3xl p-8 max-w-lg w-full relative border-primary/20 shadow-2xl flex flex-col gap-6 text-left">
            
            <button 
              onClick={() => setShowAboutModal(false)}
              className="absolute top-5 right-5 text-on-surface-variant hover:text-white cursor-pointer p-1 rounded-lg hover:bg-white/5 transition-all"
              id="btn-close-about-modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                <Cpu className="text-primary w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-on-surface font-display">
                  {lang === 'ar' ? 'بروتوكول إيزي بي دي إف' : 'The Easy PDF Protocol'}
                </h3>
                <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                  {lang === 'ar' ? 'نواة معالجة داخل المتصفح + ذكاء سحابي آمن' : 'On-Device Core + Secure Cloud AI'}
                </p>
              </div>
            </div>

            <hr className="border-white/10" />

            <div className="flex flex-col gap-4 text-xs leading-relaxed text-on-surface-variant">
              <p>
                {lang === 'ar' 
                  ? 'صُممت إيزي بي دي إف لتمنحك التوازن الأفضل: أدوات الدمج والتقسيم والضغط والترميز والتعديل تعمل بالكامل داخل متصفحك، بينما تُعالج الميزات المدعومة بالذكاء الاصطناعي (OCR، التلخيص، المساعد الذكي) عبر خوادمنا عبر اتصال مشفر.'
                  : 'Easy PDF is built to give you the best of both worlds: merge, split, compress, watermark, and page tools run 100% inside your browser, while AI-powered features (OCR, summaries, the Copilot) are processed on our servers over encrypted connections.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="p-3.5 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-1.5 text-left">
                  <span className="font-mono text-primary font-bold text-xs tracking-wider uppercase">
                    {lang === 'ar' ? 'معالجة داخل المتصفح' : 'On-Device Processing'}
                  </span>
                  <p className="text-[11px] text-on-surface-variant">
                    {lang === 'ar' 
                      ? 'عند استخدام أدوات الدمج والتقسيم والضغط والعلامة المائية، لا يُرفع ملفك إلى أي خادم — تتم كل الخطوات محلياً.' 
                      : 'When you use merge, split, compress, or watermark, your file is never uploaded — every step runs locally in your browser.'}
                  </p>
                </div>

                <div className="p-3.5 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-1.5 text-left">
                  <span className="font-mono text-secondary font-bold text-xs tracking-wider uppercase">
                    {lang === 'ar' ? 'ذكاء اصطناعي سحابي آمن' : 'Secure Cloud AI'}
                  </span>
                  <p className="text-[11px] text-on-surface-variant">
                    {lang === 'ar' 
                      ? 'ميزات OCR والتلخيص والمساعد الذكي ترسل النص أو صورة الصفحة إلى خوادمنا ومعالج Gemini عبر اتصال مشفر.' 
                      : 'OCR, summaries, and the Copilot send extracted text or a page image to our server and Gemini over encrypted connections.'}
                  </p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex gap-3 items-start mt-1 text-left">
                <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-on-surface text-xs">
                    {lang === 'ar' ? 'خصوصية واضحة بلا مبالغة' : 'Honest Privacy Architecture'}
                  </h4>
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-normal">
                    {lang === 'ar' 
                      ? 'الأدوات التي تعمل على جهازك لا ترفع ملفاتك أبداً. أما الحفظ السحابي الاختياري فيتم في مساحة تخزين خاصة بك محمية بعزل الصفوف (RLS)، ولا نشارك بياناتك مع أي طرف ثالث خارج المعالجات المذكورة في سياسة الخصوصية.'
                      : 'Tools that run on your device never upload your files. Optional cloud save goes to your own private storage bucket protected by row-level security (RLS), and data is never shared with third parties beyond the processors described in the Privacy Policy.'}
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowAboutModal(false)}
              className="btn-primary w-full py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider mt-2 cursor-pointer text-center"
              id="btn-about-close"
            >
              {lang === 'ar' ? 'موافق والمتابعة' : 'Acknowledge & Continue'}
            </button>

          </div>
        </div>
      )}

    </div>
    </TranslationProvider>
  );
}
