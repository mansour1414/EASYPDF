/**
 * EasyPDF — Unified Motion System  (Phase 6, Sept 2026)
 *
 * Design principles applied:
 *   • Emil Kowalski: spring physics, exit 40% faster than entrance,
 *     transform+opacity only (compositor thread), instant response
 *   • Apple HIG: meaningful motion only, reduced-motion respected globally
 *   • UI UX Pro Max: shared tokens, 1-2 animated elements per view max,
 *     duration calibrated to interaction distance (not a fixed 300ms rule)
 *
 * THREE LEVELS:
 *   micro      → buttons, icons, chips          (120-180ms spring)
 *   component  → cards, panels, modals          (280-360ms spring)
 *   page       → full-page route transitions    (300ms cubic ease)
 *
 * Stagger between list items: 60ms (Emil's observed Stripe timing).
 * All variants accept a `reduced` flag; pass useReducedMotion() result.
 */

import type { Variants, Transition } from 'motion/react';

// ─── Shared easing curves ────────────────────────────────────────────────────
/** Expo-out feel — sharp start, smooth settle. Use for entrances. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** Gentle ease — use for fades and opacity-only transitions. */
export const EASE_FADE: [number, number, number, number] = [0.4, 0, 0.6, 1];

// ─── Shared spring presets ───────────────────────────────────────────────────
/** Snappy spring for interactive elements (buttons, chips). */
const SPRING_MICRO: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 32,
  mass: 0.8,
};

/** Smooth spring for component-level motion (cards, panels). */
const SPRING_COMPONENT: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
  mass: 0.9,
};

// ─── LEVEL 1: MICRO — buttons, icon buttons, chips, badges ──────────────────
/**
 * Subtle lift + tap-down for any clickable element.
 * Scale stays ≤1.03 so multiple nearby items don't feel chaotic.
 * Usage:
 *   <motion.button {...microMotion} />
 */
export const microMotion = {
  whileHover: { scale: 1.028 },
  whileTap:   { scale: 0.965 },
  transition: SPRING_MICRO,
} as const;

/**
 * CTA / primary-action button — slightly more lift than microMotion.
 * Also adds a shadow pulse via CSS var driven by Tailwind group-hover.
 */
export const ctaMotion = {
  whileHover: { scale: 1.04, y: -1 },
  whileTap:   { scale: 0.96,  y: 0  },
  transition: SPRING_MICRO,
} as const;

// ─── LEVEL 2: COMPONENT — cards, panels, modals, drawers ────────────────────
/**
 * Standard card hover — rises 4px, hint of scale.
 * Exit (hover-out) snaps back faster than the entrance (Emil's rule).
 */
export const cardMotion = {
  whileHover: { y: -4, scale: 1.012 },
  whileTap:   { scale: 0.985 },
  transition: SPRING_COMPONENT,
} as const;

/**
 * Fade + slide-up entrance for modals, drawers, and sheet panels.
 * Reduced: instant opacity only.
 */
export const modalVariants = (reduced = false): Variants => ({
  hidden:  reduced ? { opacity: 0 }
                   : { opacity: 0, scale: 0.95, y: 16 },
  visible: reduced ? { opacity: 1, transition: { duration: 0.08 } }
                   : { opacity: 1, scale: 1, y: 0,
                       transition: { ...SPRING_COMPONENT, delay: 0.04 } },
  exit:    reduced ? { opacity: 0, transition: { duration: 0.06 } }
                   : { opacity: 0, scale: 0.97, y: -8,
                       transition: { duration: 0.18, ease: EASE_FADE } },
});

/**
 * Backdrop / overlay fade — compositor-only (opacity).
 */
export const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: EASE_FADE } },
  exit:    { opacity: 0, transition: { duration: 0.16, ease: EASE_FADE } },
};

// ─── LEVEL 2: STAGGER LIST ───────────────────────────────────────────────────
/**
 * Returns stagger container Variants with optional reduced-motion support.
 * Used by TopNavBar's mobile menu.
 * Existing callers that need a flat Variants use `staggerContainer` below.
 */
export const makeStaggerContainer = (reduced = false): Variants => ({
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: reduced
      ? { duration: 0.08 }
      : { staggerChildren: 0.06, delayChildren: 0.04 },
  },
});

/**
 * Returns stagger item Variants with optional reduced-motion support.
 * Used by TopNavBar's mobile menu.
 */
export const makeStaggerItem = (reduced = false): Variants => ({
  hidden:  reduced ? { opacity: 0 } : { opacity: 0, y: 14 },
  show:    reduced
    ? { opacity: 1, transition: { duration: 0.08 } }
    : { opacity: 1, y: 0, transition: { ...SPRING_COMPONENT } },
});

// ─── LEVEL 3: PAGE — route transitions ──────────────────────────────────────
/**
 * Full-page route transition. RTL/LTR aware.
 * Exit is 40% shorter than entrance (Emil's rule).
 * Usage:
 *   const v = pageVariants(lang, reduced);
 *   <motion.div variants={v} initial="initial" animate="animate" exit="exit" />
 */
export const pageVariants = (lang: 'ar' | 'en' = 'en', reduced = false): Variants => {
  const dir = lang === 'ar' ? -1 : 1;
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.1 } },
      exit:    { opacity: 0, transition: { duration: 0.08 } },
    };
  }
  return {
    initial: { opacity: 0, x: dir * 14, y: 4 },
    animate: { opacity: 1, x: 0,        y: 0,
               transition: { duration: 0.3, ease: EASE_OUT } },
    exit:    { opacity: 0, x: dir * -10,
               transition: { duration: 0.18, ease: EASE_FADE } },
  };
};

// ─── DROPZONE ────────────────────────────────────────────────────────────────
export const dropzoneMotion = {
  idle:     { scale: 1 },
  dragOver: { scale: 1.025 },
  success:  { scale: [1, 1.04, 1] as number[],
              transition: { duration: 0.38, ease: 'easeOut' } },
} as const;

// ─── MOBILE MENU / OVERLAY ───────────────────────────────────────────────────
/**
 * Full-height mobile nav overlay — slides in from top-right origin.
 * Individual menu items use staggerItem() for their entrance.
 */
export const mobileMenuVariants = (reduced = false): Variants => ({
  hidden:  reduced ? { opacity: 0 }
                   : { opacity: 0, y: -8, scale: 0.98 },
  visible: reduced ? { opacity: 1, transition: { duration: 0.08 } }
                   : { opacity: 1, y: 0, scale: 1,
                       transition: { ...SPRING_COMPONENT, delay: 0.02 } },
  exit:    reduced ? { opacity: 0, transition: { duration: 0.06 } }
                   : { opacity: 0, y: -6, scale: 0.98,
                       transition: { duration: 0.16, ease: EASE_FADE } },
});

// ─── SPECIFIC COMPONENTS ─────────────────────────────────────────────────────
/** Animated SVG checkmark path — drawn on success. */
export const checkmarkPathVariants: Variants = {
  hidden:  { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1,
             transition: {
               pathLength: { duration: 0.42, ease: 'easeInOut' },
               opacity:    { duration: 0.1 },
             }},
};

export const successBadgeVariants: Variants = {
  hidden:  { scale: 0.7, opacity: 0 },
  visible: { scale: 1,   opacity: 1,
             transition: { type: 'spring', stiffness: 300, damping: 20 } },
};

// ─── LEGACY ALIASES (keep existing callers working) ──────────────────────────
/**
 * @deprecated Flat Variants object — kept so LandingPage/ToolsPage compile
 * without changes. New code should call staggerContainer(reduced) instead.
 */
export const staggerContainer_legacy: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/**
 * @deprecated Flat Variants object — kept for existing callers.
 * New code should call staggerItem(reduced) instead.
 */
export const staggerItem_legacy: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { ...SPRING_COMPONENT } },
};

/** @deprecated Use pageVariants(lang, reduced) instead. */
export const getPageTransitionVariants = (lang: 'ar' | 'en' = 'en'): Variants =>
  pageVariants(lang, false);

/**
 * @deprecated Old name for microMotion.
 * LandingPage.tsx still imports btnMotion — alias keeps it compiling.
 */
export const btnMotion = microMotion;

/**
 * Flat Variants object re-exported under the original name so all
 * existing callers (LandingPage, ToolsPage) continue to compile.
 * They pass this directly to getReducedOrVariants() which expects Variants,
 * not a function — so we export the no-reduced version as the flat default.
 *
 * Callers that want reduced-motion support should migrate to
 * staggerContainer(reduced) / staggerItem(reduced).
 */
export { staggerContainer_legacy as staggerContainer, staggerItem_legacy as staggerItem };

// ─── REDUCED-MOTION HELPER ───────────────────────────────────────────────────
/**
 * Converts any variants object to an instant opacity-only version.
 * Use when you can't refactor to the new parameterised API yet.
 */
export const getReducedOrVariants = (variants: Variants, reduced: boolean): Variants => {
  if (!reduced) return variants;
  return {
    hidden:  { opacity: 0 },
    show:    { opacity: 1, transition: { duration: 0.08 } },
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.08 } },
    exit:    { opacity: 0, transition: { duration: 0.06 } },
  };
};
