/**
 * Footer — Phase 7 mobile polish (Sept 2026)
 *
 * Changes:
 *   • Links wrapped in min-h-[44px] flex containers — Apple HIG 44pt
 *     minimum touch target (previously plain <button> with only text
 *     padding, effectively ~20px tall tap area on mobile)
 *   • focus-visible ring added to every link (was missing entirely)
 *   • dir-aware layout via isRtl instead of relying only on parent dir
 *   • Copyright text: overflow-wrap so long localized strings never
 *     force horizontal scroll on narrow screens (< 360px)
 *   • Reduced vertical py on mobile (py-12 → py-10) so the footer
 *     doesn't dominate short viewports
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { PageType } from '../types';
import LogoImage from './LogoImage';

interface FooterProps {
  onNavigate: (page: PageType) => void;
  /** Opens the "How EasyPDF Works" modal (App.tsx). Optional so existing
   *  callers/tests that don't pass it don't break; the link simply doesn't
   *  render without it. */
  onShowAbout?: () => void;
  lang?: 'ar' | 'en';
  /** Only shows the Admin Console link to actual logged-in admins.
   *  Previously this link was visible to every visitor regardless of
   *  login/admin status — harmless since the backend and App.tsx's
   *  routing both correctly gate the admin pages either way, but there's
   *  no reason to advertise internal admin routes to anonymous visitors
   *  (audit, Aug 2026). */
  isAdmin?: boolean;
}

const linkClass = "text-xs uppercase tracking-wider text-on-surface-variant hover:text-secondary " +
  "transition-colors cursor-pointer min-h-[44px] flex items-center px-1 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md";

export default function Footer({ onNavigate, onShowAbout, lang = 'en', isAdmin = false }: FooterProps) {
  const isRtl = lang === 'ar';

  return (
    <footer
      className="w-full py-10 md:py-12 bg-surface-container-lowest border-t border-outline-variant/20 mt-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-col md:flex-row justify-between items-center gap-5 md:gap-6
                      px-4 sm:px-6 md:px-12 max-w-7xl mx-auto w-full">
        {/* Brand — full artwork (bird + EASYPDF wordmark) already includes
            the brand name, so the separate HTML text span is removed. */}
        <div className="flex items-center">
          <LogoImage className="h-9 w-auto" alt="EasyPDF Logo" />
        </div>

        {/* Links — flex-wrap always preserved so no link is ever clipped */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <button onClick={() => onNavigate('tools')} className={linkClass} id="footer-link-tools">
            {lang === 'ar' ? 'الأدوات' : 'Tools'}
          </button>
          {onShowAbout && (
            <button onClick={onShowAbout} className={linkClass} id="footer-link-about">
              {lang === 'ar' ? 'كيف يعمل إيزي بي دي إف' : 'How it works'}
            </button>
          )}
          <button onClick={() => onNavigate('pricing')} className={linkClass} id="footer-link-pricing">
            {lang === 'ar' ? 'الأسعار' : 'Pricing'}
          </button>
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin-dashboard')}
              className={`${linkClass} hover:text-primary font-bold gap-1`}
              id="footer-link-admin"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              {lang === 'ar' ? 'لوحة التحكم' : 'Admin Console'}
            </button>
          )}
          <button onClick={() => onNavigate('privacy')} className={linkClass} id="footer-link-privacy">
            {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
          </button>
          <button onClick={() => onNavigate('terms')} className={linkClass} id="footer-link-terms">
            {lang === 'ar' ? 'شروط الخدمة' : 'Terms of Service'}
          </button>
          <button onClick={() => onNavigate('refund')} className={linkClass} id="footer-link-refund">
            {lang === 'ar' ? 'سياسة الاسترجاع' : 'Refund Policy'}
          </button>
        </div>

        {/* Copyright */}
        {/* NOTE (audit, Aug 2026): the Twitter/GitHub icons previously
            here linked to href="#" — dead links going nowhere, with no
            real social URLs available to put in their place. Removed
            rather than left as fake/misleading links; add them back with
            real URLs once official accounts exist. */}
        <div className="flex flex-col items-center md:items-end gap-2 text-xs text-on-surface-variant
                        max-w-full md:max-w-[280px]">
          <p id="footer-copyright" className="text-center md:text-end [overflow-wrap:anywhere]">
            {lang === 'ar'
              ? '© 2026 إيزي بي دي إف (Easy PDF). جميع الحقوق محفوظة.'
              : '© 2026 Easy PDF. All rights reserved.'}
          </p>
        </div>
      </div>
    </footer>
  );
}
