/**
 * TopNavBar — Phase 3 redesign (Sept 2026)
 *
 * Changes from previous version:
 *   • Glassmorphism base: backdrop-blur + semi-transparent bg + subtle border
 *   • Scroll-aware: nav compresses + deepens blur after 40px scroll
 *   • Desktop active indicator: animated sliding pill (motion layoutId)
 *     replaces the old underline pseudo-element
 *   • "Get Pro" CTA: gradient shimmer button with ctaMotion
 *   • Mobile menu: AnimatePresence-driven overlay with stagger entrance
 *     replaces the instant `{isOpen && ...}` render
 *   • All interactive elements: microMotion / ctaMotion from animations.ts
 *   • Reduced motion: all motion disabled via useReducedMotion()
 *   • Apple HIG: 44×44px minimum touch targets on all buttons
 *   • Emoji removed from Admin label — replaced with ShieldCheck icon
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Menu, X, Globe, ShieldCheck, Zap, Sun, Moon } from 'lucide-react';
import { PageType } from '../types';
import LogoImage from './LogoImage';
import {
  microMotion,
  ctaMotion,
  mobileMenuVariants,
  makeStaggerContainer,
  makeStaggerItem,
} from '../lib/animations';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TopNavBarProps {
  activePage: PageType;
  onNavigate: (page: PageType) => void;
  onOpenSignUp: () => void;
  onOpenAbout: () => void;
  lang: 'ar' | 'en';
  onToggleLang: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentUser: { email: string; plan: 'free' | 'pro'; is_admin?: boolean } | null;
  onLogout: () => void;
}

// ─── Logo export (kept for external consumers) ───────────────────────────────
export const EasyPdfLogo = ({ className = 'w-10 h-10' }: { className?: string }) => (
  <LogoImage className={className} alt="EasyPDF Logo" />
);

// ─── Component ───────────────────────────────────────────────────────────────
export default function TopNavBar({
  activePage,
  onNavigate,
  onOpenSignUp,
  onOpenAbout,
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  currentUser,
  onLogout,
}: TopNavBarProps) {
  const [isOpen, setIsOpen]       = useState(false);
  const [scrolled, setScrolled]   = useState(false);
  const reduced                   = useReducedMotion() === true;
  const isRtl                     = lang === 'ar';

  // Scroll listener — compresses nav after 40px
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setIsOpen(false); };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleNav = useCallback((page: PageType) => {
    onNavigate(page);
    setIsOpen(false);
  }, [onNavigate]);

  const navItems = [
    { label: isRtl ? 'الأدوات'     : 'Tools',     page: 'tools'     as PageType },
    { label: isRtl ? 'الأسعار'    : 'Pricing',    page: 'pricing'   as PageType },
    { label: isRtl ? 'بيئة العمل' : 'Workspace',  page: 'workspace' as PageType },
  ];

  if (currentUser?.is_admin) {
    navItems.push({ label: isRtl ? 'لوحة التحكم' : 'Admin', page: 'admin-dashboard' as PageType });
  }

  // ─── Derived styles ─────────────────────────────────────────────────────
  const navBg    = scrolled
    ? 'bg-surface/85 backdrop-blur-2xl'
    : 'bg-surface/60 backdrop-blur-xl';
  const navBorder = scrolled
    ? 'border-white/8'
    : 'border-white/5';
  const navShadow = scrolled
    ? 'shadow-[0_1px_60px_rgba(0,0,0,0.55)]'
    : 'shadow-[0_1px_20px_rgba(0,0,0,0.25)]';
  const navPy     = scrolled ? 'py-2.5' : 'py-3.5';

  return (
    <>
      {/* ── Main nav bar ──────────────────────────────────────────────────── */}
      {/* Phase 7: pt-[env(safe-area-inset-top)] avoids the bar sitting under
          the iPhone notch/Dynamic Island; px tightened on the smallest
          screens (< 400px) so the brand + hamburger don't crowd the edge. */}
      <nav
        className={`fixed top-0 left-0 w-full z-50 border-b transition-all duration-300
                    pt-[env(safe-area-inset-top)] ${navBg} ${navBorder} ${navShadow}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className={`flex justify-between items-center px-3.5 sm:px-5 md:px-10 max-w-7xl mx-auto w-full
                         transition-[padding] duration-300 ${navPy}`}>

          {/* Brand */}
          <motion.button
            onClick={() => handleNav('home')}
            className="flex items-center group cursor-pointer focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg"
            aria-label="EasyPDF home"
            id="btn-brand-logo"
            {...(reduced ? {} : microMotion)}
          >
            {/* New brand asset (Sept 2026) already includes the EASYPDF
                wordmark baked into the artwork, so the separate HTML
                "Easy/PDF" text span used with the old icon-only logo has
                been removed to avoid the name appearing twice. */}
            <EasyPdfLogo className="h-11 w-auto shrink-0" />
          </motion.button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1" role="navigation" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = activePage === item.page;
              const isAdmin  = item.page === 'admin-dashboard';
              return (
                <button
                  key={item.page}
                  onClick={() => handleNav(item.page)}
                  className={`relative px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer
                              transition-colors duration-150 focus-visible:outline-none
                              focus-visible:ring-2 focus-visible:ring-primary/60
                              ${isActive
                                ? 'text-on-surface'
                                : 'text-on-surface-variant hover:text-on-surface'}`}
                  id={`nav-item-${item.page}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Sliding active pill (layoutId) */}
                  {isActive && !reduced && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-lg bg-white/8 border border-white/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  {isActive && reduced && (
                    <span className="absolute inset-0 rounded-lg bg-white/8 border border-white/10" />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                    {item.label}
                  </span>
                </button>
              );
            })}

            <button
              onClick={onOpenAbout}
              className="px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer
                         text-on-surface-variant hover:text-on-surface transition-colors duration-150
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              id="nav-item-about"
            >
              {isRtl ? 'من نحن' : 'About'}
            </button>
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* Theme toggle (Sept 2026, Light/Dark mode) */}
            <motion.button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-11 h-11 text-on-surface-variant hover:text-on-surface
                         cursor-pointer rounded-lg hover:bg-white/5 border border-transparent
                         hover:border-white/8 transition-colors duration-150 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-primary/60"
              id="btn-theme-toggle"
              aria-label={theme === 'dark' ? (isRtl ? 'التبديل إلى الوضع الفاتح' : 'Switch to light mode') : (isRtl ? 'التبديل إلى الوضع الداكن' : 'Switch to dark mode')}
              title={theme === 'dark' ? (isRtl ? 'الوضع الفاتح' : 'Light mode') : (isRtl ? 'الوضع الداكن' : 'Dark mode')}
              {...(reduced ? {} : microMotion)}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            </motion.button>

            {/* Language toggle */}
            <motion.button
              onClick={onToggleLang}
              className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface
                         font-medium text-sm cursor-pointer px-3 py-2 rounded-lg
                         hover:bg-white/5 border border-transparent hover:border-white/8
                         transition-colors duration-150 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-primary/60"
              id="btn-lang-toggle"
              {...(reduced ? {} : microMotion)}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold tracking-wide">
                {lang === 'en' ? 'العربية' : 'EN'}
              </span>
            </motion.button>

            {currentUser ? (
              /* ── Logged-in state ── */
              <div className="flex items-center gap-2">
                {/* User badge */}
                <div className="flex flex-col items-end leading-none gap-0.5">
                  <span className="text-[0.7rem] text-on-surface-variant font-semibold truncate max-w-[130px]">
                    {currentUser.email}
                  </span>
                  <span className={`text-[0.6rem] font-mono font-bold uppercase
                                   px-1.5 py-0.5 rounded-sm tracking-widest
                                   ${currentUser.plan === 'pro'
                                     ? 'bg-primary/20 text-primary border border-primary/30'
                                     : 'bg-white/8 text-slate-500'}`}>
                    {currentUser.plan}
                  </span>
                </div>

                <motion.button
                  onClick={onLogout}
                  className="text-xs font-semibold text-red-400 hover:text-red-300
                             hover:bg-red-500/10 px-3 py-2 rounded-lg cursor-pointer
                             transition-colors focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-red-500/40
                             min-h-[44px] flex items-center"
                  id="btn-logout"
                  {...(reduced ? {} : microMotion)}
                >
                  {isRtl ? 'خروج' : 'Logout'}
                </motion.button>
              </div>
            ) : (
              /* ── Logged-out state ── */
              <>
                <motion.button
                  onClick={onOpenSignUp}
                  className="text-on-surface-variant hover:text-on-surface font-medium text-sm
                             cursor-pointer hover:bg-white/5 px-4 py-2 rounded-lg
                             transition-colors focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-primary/60
                             min-h-[44px] flex items-center"
                  id="btn-signin"
                  {...(reduced ? {} : microMotion)}
                >
                  {isRtl ? 'دخول' : 'Sign In'}
                </motion.button>

                <motion.button
                  onClick={onOpenSignUp}
                  className="nav-cta-btn min-h-[44px] flex items-center gap-1.5
                             px-5 py-2.5 rounded-xl text-sm font-semibold
                             cursor-pointer focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-primary/60"
                  id="btn-signup"
                  {...(reduced ? {} : ctaMotion)}
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  {isRtl ? 'ابدأ مجاناً' : 'Get Started'}
                </motion.button>
              </>
            )}
          </div>

          {/* Mobile quick actions (Sept 2026 fix): theme + language were
              previously only reachable inside the hamburger dropdown, which
              read as "the buttons disappeared" on a phone — a user glancing
              at the header saw neither control at all. These compact,
              icon-only, always-visible copies sit directly in the mobile
              header (hidden on md+ where the full versions above already
              show) so both actions are one tap away without opening the
              menu. Same handlers as the desktop buttons and the mobile
              menu's own copies below — no new logic, just another visible
              entry point. */}
          <div className="flex md:hidden items-center gap-0.5 shrink-0">
            <motion.button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-10 h-10 text-on-surface-variant
                         hover:text-on-surface cursor-pointer rounded-lg hover:bg-white/5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                         transition-colors"
              id="btn-theme-toggle-mobile"
              aria-label={theme === 'dark' ? (isRtl ? 'التبديل إلى الوضع الفاتح' : 'Switch to light mode') : (isRtl ? 'التبديل إلى الوضع الداكن' : 'Switch to dark mode')}
              {...(reduced ? {} : microMotion)}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            </motion.button>

            <motion.button
              onClick={onToggleLang}
              className="flex items-center justify-center w-10 h-10 text-on-surface-variant
                         hover:text-on-surface cursor-pointer rounded-lg hover:bg-white/5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                         transition-colors"
              id="btn-lang-toggle-mobile"
              aria-label={isRtl ? 'تغيير اللغة إلى الإنجليزية' : 'Switch language to Arabic'}
              {...(reduced ? {} : microMotion)}
            >
              <Globe className="w-4 h-4 shrink-0" />
            </motion.button>
          </div>

          {/* Mobile hamburger */}
          <motion.button
            onClick={() => setIsOpen((o) => !o)}
            className="md:hidden p-2.5 -mr-1.5 text-on-surface-variant hover:text-on-surface
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-primary/60 rounded-lg
                       min-w-[44px] min-h-[44px] flex items-center justify-center
                       cursor-pointer transition-colors"
            aria-label={isOpen
              ? (isRtl ? 'إغلاق القائمة' : 'Close menu')
              : (isRtl ? 'فتح القائمة'  : 'Open menu')}
            aria-expanded={isOpen}
            id="btn-mobile-menu"
            {...(reduced ? {} : microMotion)}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={reduced ? { opacity: 1 } : { opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={reduced  ? { opacity: 0 } : { opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.16 }}
                >
                  <X className="w-5 h-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu"
                  initial={reduced ? { opacity: 1 } : { opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={reduced  ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
                  transition={{ duration: 0.16 }}
                >
                  <Menu className="w-5 h-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </nav>

      {/* ── Mobile menu overlay ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-[#030712]/70 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Panel */}
            <motion.div
              className="fixed top-0 left-0 right-0 z-50 md:hidden
                         bg-surface/95 backdrop-blur-2xl
                         border-b border-white/8
                         shadow-[0_8px_40px_rgba(0,0,0,0.6)]
                         max-h-[100dvh] overflow-y-auto
                         pt-[calc(env(safe-area-inset-top)+var(--nav-h,60px)+0.5rem)]
                         pb-[max(1.5rem,env(safe-area-inset-bottom))] px-5"
              role="dialog"
              aria-modal="true"
              aria-label={isRtl ? 'قائمة التنقل' : 'Navigation menu'}
              dir={isRtl ? 'rtl' : 'ltr'}
              variants={reduced ? undefined : mobileMenuVariants(reduced)}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {/* Nav links with stagger */}
              <motion.nav
                variants={reduced ? undefined : makeStaggerContainer(reduced)}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-1 mb-4"
              >
                {[...navItems, { label: isRtl ? 'من نحن' : 'About', page: '__about__' as PageType }].map((item) => {
                  const isAbout  = item.page === '__about__' as PageType;
                  const isActive = !isAbout && activePage === item.page;
                  const isAdmin  = item.page === 'admin-dashboard';

                  return (
                    <motion.button
                      key={item.page}
                      variants={reduced ? undefined : makeStaggerItem(reduced)}
                      onClick={() => {
                        if (isAbout) { setIsOpen(false); onOpenAbout(); }
                        else handleNav(item.page);
                      }}
                      className={`w-full text-start py-3.5 px-4 rounded-xl font-semibold text-base
                                  transition-colors cursor-pointer min-h-[48px] flex items-center gap-2
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                                  ${isActive
                                    ? 'text-on-surface bg-white/8 border border-white/10'
                                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'}`}
                      id={`mobile-nav-${item.page}`}
                    >
                      {isAdmin && <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
                      {item.label}
                    </motion.button>
                  );
                })}
              </motion.nav>

              <hr className="border-white/8 my-4" />

              {/* Theme toggle (Sept 2026, Light/Dark mode) */}
              <motion.button
                variants={reduced ? undefined : makeStaggerItem(reduced)}
                onClick={() => { onToggleTheme(); }}
                className="w-full text-start py-3 px-4 rounded-xl text-on-surface-variant
                           hover:text-on-surface hover:bg-white/5 font-medium text-sm
                           flex items-center gap-2.5 cursor-pointer mb-2
                           min-h-[48px] transition-colors"
                id="mobile-nav-theme"
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4 text-primary shrink-0" />
                  : <Moon className="w-4 h-4 text-primary shrink-0" />}
                {theme === 'dark'
                  ? (isRtl ? 'الوضع الفاتح' : 'Light mode')
                  : (isRtl ? 'الوضع الداكن' : 'Dark mode')}
              </motion.button>

              {/* Language toggle */}
              <motion.button
                variants={reduced ? undefined : makeStaggerItem(reduced)}
                onClick={() => { setIsOpen(false); onToggleLang(); }}
                className="w-full text-start py-3 px-4 rounded-xl text-on-surface-variant
                           hover:text-on-surface hover:bg-white/5 font-medium text-sm
                           flex items-center gap-2.5 cursor-pointer mb-4
                           min-h-[48px] transition-colors"
                id="mobile-nav-lang"
              >
                <Globe className="w-4 h-4 text-primary shrink-0" />
                {lang === 'en' ? 'العربية' : 'English'}
              </motion.button>

              {/* Auth section */}
              <div className="flex flex-col gap-3">
                {currentUser ? (
                  <div className="flex flex-col gap-3 bg-white/4 p-4 rounded-2xl border border-white/8">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-on-surface truncate">
                        {currentUser.email}
                      </span>
                      <span className={`text-[0.6rem] font-mono font-bold uppercase
                                       px-2 py-0.5 rounded-sm tracking-widest shrink-0
                                       ${currentUser.plan === 'pro'
                                         ? 'bg-primary/20 text-primary border border-primary/30'
                                         : 'bg-white/8 text-slate-500'}`}>
                        {currentUser.plan}
                      </span>
                    </div>
                    <button
                      onClick={() => { setIsOpen(false); onLogout(); }}
                      className="w-full text-center py-3 bg-red-500/10 hover:bg-red-500/18
                                 text-red-400 rounded-xl font-bold text-sm cursor-pointer
                                 transition-colors min-h-[48px]
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                      id="mobile-logout"
                    >
                      {isRtl ? 'تسجيل الخروج' : 'Log Out'}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setIsOpen(false); onOpenSignUp(); }}
                      className="w-full text-center py-3.5 border border-white/10 rounded-xl
                                 text-on-surface hover:bg-white/5 font-semibold text-sm
                                 cursor-pointer transition-colors min-h-[48px]
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      id="mobile-signin"
                    >
                      {isRtl ? 'تسجيل الدخول' : 'Sign In'}
                    </button>
                    <button
                      onClick={() => { setIsOpen(false); onOpenSignUp(); }}
                      className="nav-cta-btn w-full text-center py-3.5 rounded-xl
                                 font-semibold text-sm cursor-pointer min-h-[48px]
                                 flex items-center justify-center gap-2
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      id="mobile-signup"
                    >
                      <Zap className="w-4 h-4 shrink-0" />
                      {isRtl ? 'ابدأ مجاناً' : 'Get Started Free'}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
