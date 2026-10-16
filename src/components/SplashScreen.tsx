import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import LogoImage from './LogoImage';

interface SplashScreenProps {
  lang: 'ar' | 'en';
  onFinish: () => void;
}

/**
 * SplashScreen — Brand video redesign (Sept 2026)
 *
 * Replaces the earlier CSS/motion splash with the official brand animation
 * video supplied by the project owner (bird-carries-PDF → assembles into
 * the full EASYPDF logo lockup). The video is the source of truth for the
 * visual sequence — no attempt is made to recreate it with CSS/Framer Motion.
 *
 * Behaviour:
 *   • Shown once per browser (localStorage key 'epdf_seen', unchanged from
 *     the previous implementation — same key, same "once ever" semantics).
 *     Clear localStorage / site data to see it again.
 *   • Video plays muted+autoPlay+playsInline (required for autoplay on all
 *     mobile browsers) and drives its own natural length — completion is
 *     detected via the real `onEnded` event, not an arbitrary timeout.
 *   • A hard safety-timeout fallback (video duration + 1.5s buffer) still
 *     fires onFinish if the video fails to load/play for any reason
 *     (slow network, blocked autoplay, codec issue) so the app is never
 *     stuck behind a splash that can't finish.
 *   • Background is solid white (#ffffff) to match the reference video's
 *     background exactly — no gradients, glows, or particles layered on
 *     top, per the brand asset brief.
 *   • prefers-reduced-motion: the video is not played at all. Instead the
 *     final static logo lockup (same PNG used everywhere else) is shown
 *     briefly, then the app is revealed — no motion sequence is forced on
 *     users who've asked their OS to minimise animation.
 */

// Once the video ends we hold for a beat before revealing the app so the
// fade-out doesn't feel abrupt — this is a fade transition, not new motion
// content, so it stays under 400ms regardless of reduced-motion settings.
const EXIT_MS = 320;

// Reduced-motion users see the static final logo for a brief, deliberate
// pause (long enough to register the brand, short enough to not feel like
// a forced delay) before moving straight into the app.
const REDUCED_MOTION_HOLD_MS = 700;

// Safety net: if the video's `onEnded` event never fires (autoplay blocked,
// network stall, decode error), force-finish shortly after the video's own
// known duration so the splash can never trap the user indefinitely.
const VIDEO_DURATION_MS = 4010; // matches public/assets/splash/*.{webm,mp4}
const SAFETY_TIMEOUT_MS = VIDEO_DURATION_MS + 1500;

export default function SplashScreen({ lang, onFinish }: SplashScreenProps) {
  const [exiting, setExiting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishedRef = useRef(false);
  const reduced = useReducedMotion() === true;

  const triggerExit = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
  };

  // ── Reduced motion path: skip the video entirely ──────────────────────
  useEffect(() => {
    if (!reduced) return;
    const id = window.setTimeout(triggerExit, REDUCED_MOTION_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [reduced]);

  // ── Full motion path: play video, listen for natural completion ──────
  useEffect(() => {
    if (reduced) return;

    // Safety timeout — guarantees the splash always finishes even if the
    // video can't play (autoplay policies, slow 3G, corrupt cache, etc.)
    const safetyId = window.setTimeout(triggerExit, SAFETY_TIMEOUT_MS);

    const video = videoRef.current;
    if (video) {
      // Attempt to play explicitly — some browsers need this even with
      // the autoPlay attribute present, especially right after mount.
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Autoplay was blocked — fall back to the safety timeout above
          // rather than leaving the user on a frozen first frame.
        });
      }
    }

    return () => window.clearTimeout(safetyId);
  }, [reduced]);

  return (
    <AnimatePresence onExitComplete={onFinish}>
      {!exiting && (
        <motion.div
          className="splash-root"
          data-testid="splash-screen"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={lang === 'ar' ? 'جاري تحميل Easy PDF' : 'Loading Easy PDF'}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_MS / 1000, ease: 'easeInOut' }}
        >
          {reduced ? (
            // ── Reduced motion: static final logo only, no video ──────
            <div className="splash-static-logo">
              <LogoImage className="splash-static-logo-img" alt="EasyPDF" variant="splash" />
            </div>
          ) : (
            // ── Full motion: the brand video itself is the animation ──
            <video
              ref={videoRef}
              className="splash-video"
              autoPlay
              muted
              playsInline
              preload="auto"
              // No loop — the sequence plays exactly once per the reference.
              onEnded={triggerExit}
              // If the video can't even load, don't strand the user —
              // finish immediately rather than waiting for the safety timeout.
              onError={triggerExit}
              aria-hidden="true"
            >
              <source src="/assets/splash/splash.webm" type="video/webm" />
              <source src="/assets/splash/splash.mp4" type="video/mp4" />
            </video>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
