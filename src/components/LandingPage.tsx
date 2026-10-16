/**
 * LandingPage — Phase 4 redesign (Sept 2026)
 *
 * Architecture: centered hero (not 2-column split) — better for PDF tool SaaS.
 * Structure:
 *   1. Hero  — headline + subline + dropzone (primary CTA)
 *   2. Tool chips — quick-pick row below dropzone
 *   3. Bento grid — 8-tool feature showcase (4-col → 2-col → 1-col)
 *   4. Trust strip — 3 stats + AI badge
 *   5. Bottom CTA — secondary conversion
 *
 * Design principles:
 *   • UI UX Pro Max: Glassmorphism + Bento Box Grid, Hero+Features+CTA pattern
 *   • Apple HIG: meaningful motion, 44×44px touch targets, reduced-motion
 *   • Emil Kowalski: spring physics, transform+opacity only, exit < enter
 *   • Bento grid guidance: 4→2→1 cols, varied spans, hover scale 1.02
 *
 * All text copy cleaned of pseudo-technical jargon ("protocols", "payload",
 * "Initialize Transfer") — replaced with plain, honest product language.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  UploadCloud, ArrowRight, CheckCircle,
  GitMerge, Columns, Minimize2, RefreshCw,
  ScanText, Shield, Pen, Sparkles,
  Zap, FileText, Star,
} from 'lucide-react';
import { ToolType, PageType } from '../types';
import { useTranslation } from '../lib/TranslationContext';
import {
  btnMotion,
  cardMotion,
  staggerContainer,
  staggerItem,
  getReducedOrVariants,
  EASE_OUT,
} from '../lib/animations';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LandingPageProps {
  onSelectTool: (tool: ToolType) => void;
  onNavigate:   (page: PageType) => void;
  onFilesDropped: (files: FileList) => void;
  lang?: 'ar' | 'en';
}

// ─── Quick-access tool chips shown below the dropzone ────────────────────────
const QUICK_TOOLS = (lang: 'ar' | 'en') => [
  { id: 'merge'       as ToolType, label: lang === 'ar' ? 'دمج'    : 'Merge'    },
  { id: 'split'       as ToolType, label: lang === 'ar' ? 'تقسيم'  : 'Split'    },
  { id: 'compress'    as ToolType, label: lang === 'ar' ? 'ضغط'    : 'Compress' },
  { id: 'convert-to'  as ToolType, label: lang === 'ar' ? 'تحويل'  : 'Convert'  },
  { id: 'ocr'         as ToolType, label: 'OCR'                                  },
  { id: 'summarize'   as ToolType, label: lang === 'ar' ? 'ملخص AI' : 'AI Summary' },
];

// ─── Bento feature cards ──────────────────────────────────────────────────────
interface BentoCard {
  id: ToolType;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: React.ReactNode;
  span?: 'wide' | 'normal'; // wide = col-span-2
  accent: string;            // Tailwind colour class for icon bg
}

const BENTO_CARDS: BentoCard[] = [
  {
    id: 'merge',
    titleAr: 'دمج الملفات',
    titleEn: 'Merge PDFs',
    descAr: 'اجمع عدة مستندات PDF في ملف واحد مرتب بخطوات بسيطة.',
    descEn: 'Combine multiple PDFs into one clean, ordered file in seconds.',
    icon: <GitMerge className="w-6 h-6" />,
    span: 'wide',
    accent: 'bg-indigo-500/15 text-indigo-300',
  },
  {
    id: 'split',
    titleAr: 'تقسيم الملف',
    titleEn: 'Split PDF',
    descAr: 'استخرج صفحات محددة أو قسّم الملف إلى أجزاء.',
    descEn: 'Extract pages or split into separate documents.',
    icon: <Columns className="w-6 h-6" />,
    accent: 'bg-violet-500/15 text-violet-300',
  },
  {
    id: 'compress',
    titleAr: 'ضغط الحجم',
    titleEn: 'Compress',
    descAr: 'قلّص حجم الملف مع الحفاظ على الجودة.',
    descEn: 'Reduce file size while keeping quality intact.',
    icon: <Minimize2 className="w-6 h-6" />,
    accent: 'bg-sky-500/15 text-sky-300',
  },
  {
    id: 'ocr',
    titleAr: 'استخراج النص (OCR)',
    titleEn: 'OCR Text',
    descAr: 'حوّل صور المستندات الممسوحة إلى نص قابل للبحث والتعديل.',
    descEn: 'Convert scanned documents into searchable, editable text.',
    icon: <ScanText className="w-6 h-6" />,
    span: 'wide',
    accent: 'bg-emerald-500/15 text-emerald-300',
  },
  {
    id: 'summarize',
    titleAr: 'تلخيص بالذكاء الاصطناعي',
    titleEn: 'AI Summary',
    descAr: 'لخّص أي ملف PDF بلحظة واحدة باستخدام Gemini AI.',
    descEn: 'Summarise any PDF instantly using Gemini AI.',
    icon: <Sparkles className="w-6 h-6" />,
    accent: 'bg-amber-500/15 text-amber-300',
  },
  {
    id: 'convert-to',
    titleAr: 'تحويل الملفات',
    titleEn: 'Convert',
    descAr: 'حوّل صور PNG وJPG إلى ملفات PDF بجودة عالية.',
    descEn: 'Turn PNG and JPG images into high-quality PDFs.',
    icon: <RefreshCw className="w-6 h-6" />,
    accent: 'bg-rose-500/15 text-rose-300',
  },
  {
    id: 'protect',
    titleAr: 'تشفير وحماية',
    titleEn: 'Protect PDF',
    descAr: 'أضف كلمة مرور وتشفيراً قوياً لملفاتك الحساسة.',
    descEn: 'Add password protection and strong encryption.',
    icon: <Shield className="w-6 h-6" />,
    accent: 'bg-teal-500/15 text-teal-300',
  },
  {
    id: 'signature',
    titleAr: 'توقيع إلكتروني',
    titleEn: 'E-Signature',
    descAr: 'وقّع على ملفات PDF مباشرة من المتصفح بلا طباعة.',
    descEn: 'Sign PDF documents directly in the browser — no printing.',
    icon: <Pen className="w-6 h-6" />,
    accent: 'bg-purple-500/15 text-purple-300',
  },
];

// ─── Trust stats ──────────────────────────────────────────────────────────────
const TRUST_STATS = (lang: 'ar' | 'en') => [
  {
    value: '16',
    label: lang === 'ar' ? 'أداة متكاملة' : 'Integrated tools',
    icon: <Zap className="w-4 h-4" />,
  },
  {
    // The core PDF tools (merge, split, compress, protect, watermark, ...) run
    // in the browser; only the AI features are processed on the server.
    value: lang === 'ar' ? 'محلي' : 'Local',
    label: lang === 'ar' ? 'أدوات PDF الأساسية تعمل داخل متصفحك' : 'Core PDF tools run in your browser',
    icon: <Shield className="w-4 h-4" />,
  },
  {
    value: 'AI',
    label: lang === 'ar' ? 'مدعوم بـ Gemini' : 'Powered by Gemini',
    icon: <Sparkles className="w-4 h-4" />,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandingPage({
  onSelectTool,
  onNavigate,
  onFilesDropped,
  lang = 'en',
}: LandingPageProps) {
  const { t }              = useTranslation();
  const reduced            = useReducedMotion() === true;
  const fileInputRef       = useRef<HTMLInputElement>(null);
  const [dropState, setDropState] = useState<'idle' | 'over' | 'success'>('idle');

  // Scroll-reveal for bento & trust sections
  const bentoRef  = useRef<HTMLElement | null>(null);
  const trustRef  = useRef<HTMLElement | null>(null);
  const ctaRef    = useRef<HTMLElement | null>(null);
  const [bentoVisible,  setBentoVisible]  = useState(false);
  const [trustVisible,  setTrustVisible]  = useState(false);
  const [ctaVisible,    setCtaVisible]    = useState(false);

  useEffect(() => {
    if (reduced) { setBentoVisible(true); setTrustVisible(true); setCtaVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        if (e.target === bentoRef.current)  setBentoVisible(true);
        if (e.target === trustRef.current)  setTrustVisible(true);
        if (e.target === ctaRef.current)    setCtaVisible(true);
        io.unobserve(e.target);
      }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    [bentoRef, trustRef, ctaRef].forEach((r) => { if (r.current) io.observe(r.current); });
    return () => io.disconnect();
  }, [reduced]);

  // ─── Dropzone handlers ─────────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDropState('over'); };
  const handleDragLeave = ()                    => { setDropState('idle'); };
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDropState('success');
    if (e.dataTransfer.files?.length) {
      onFilesDropped(e.dataTransfer.files);
      setTimeout(() => setDropState('idle'), 1800);
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFilesDropped(e.target.files);
      setDropState('success');
      setTimeout(() => setDropState('idle'), 1800);
    }
  };

  // Stagger variants (flat, for getReducedOrVariants compat)
  const containerV = getReducedOrVariants(staggerContainer, reduced);
  const itemV      = getReducedOrVariants(staggerItem,      reduced);

  const isRtl = lang === 'ar';

  return (
    <div className={`flex flex-col gap-14 sm:gap-20 md:gap-28 w-full ${isRtl ? 'rtl' : 'ltr'}`}>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
          Centred layout: headline → dropzone → quick-tool chips
          ══════════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col items-center gap-10 pt-4 md:pt-8 text-center">

        {/* AI badge */}
        <motion.div
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { delay: 0.1, duration: 0.5, ease: EASE_OUT }}
        >
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
                           bg-primary/10 border border-primary/25
                           text-primary text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'مدعوم بـ Gemini AI' : 'Powered by Gemini AI'}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.div
          className="flex flex-col gap-4 max-w-3xl"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { delay: 0.18, duration: 0.6, ease: EASE_OUT }}
        >
          <h1 className="hero-headline text-on-background">
            {lang === 'ar' ? (
              <>
                <span className="gradient-text">أنجز مهامك مع PDF</span>
                <br />
                <span className="text-on-surface-variant font-light">في ثوانٍ معدودة</span>
              </>
            ) : (
              <>
                <span className="gradient-text">PDF tools</span>
                {' '}
                <span className="text-on-surface-variant font-light">that just work.</span>
              </>
            )}
          </h1>
          <p className="hero-subline text-on-surface-variant max-w-xl mx-auto">
            {lang === 'ar'
              ? 'دمج، تقسيم، ضغط، تحويل، OCR وتحرير ذكي — كل أدوات PDF في مكان واحد.'
              : 'Merge, split, compress, convert, OCR, and AI-edit — every PDF tool in one place.'}
          </p>
        </motion.div>

        {/* ── Dropzone ────────────────────────────────────────────────────── */}
        <motion.div
          className="w-full max-w-2xl"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { delay: 0.3, duration: 0.55, ease: EASE_OUT }}
        >
          <motion.div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            animate={{
              scale:       dropState === 'over' ? 1.025 : 1,
              borderColor: dropState === 'over'
                ? 'rgba(129,140,248,0.9)'
                : dropState === 'success'
                  ? 'rgba(52,211,153,0.8)'
                  : 'rgba(255,255,255,0.1)',
            }}
            whileHover={reduced ? undefined : { scale: 1.008 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="dropzone-hero group"
            id="dropzone-landing"
            role="button"
            tabIndex={0}
            aria-label={lang === 'ar' ? 'اسحب ملف PDF أو انقر للرفع' : 'Drop PDF or click to upload'}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          >
            {/* Hover glow */}
            <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-primary/8
                            to-secondary/4 opacity-0 group-hover:opacity-100
                            transition-opacity duration-500 pointer-events-none" />

            {/* Icon */}
            <AnimatePresence mode="wait">
              {dropState === 'success' ? (
                <motion.div
                  key="success"
                  initial={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="dropzone-icon-wrap bg-emerald-500/15"
                >
                  <CheckCircle className="w-9 h-9 text-emerald-400" />
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={reduced ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className={`dropzone-icon-wrap transition-colors duration-300 ${
                    dropState === 'over' ? 'bg-primary/20' : 'bg-white/5'
                  }`}
                >
                  <UploadCloud className={`w-9 h-9 transition-colors duration-300 ${
                    dropState === 'over' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'
                  }`} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Text */}
            <div className="flex flex-col gap-1 text-center">
              <p className="text-base font-semibold text-on-surface group-hover:text-on-surface
                            transition-colors duration-200">
                {dropState === 'success'
                  ? (lang === 'ar' ? 'تم استلام الملف ✓' : 'File received ✓')
                  : dropState === 'over'
                    ? (lang === 'ar' ? 'أسقط الملف الآن...' : 'Drop it now...')
                    : (lang === 'ar' ? 'اسحب ملف PDF هنا' : 'Drop your PDF here')}
              </p>
              <p className="text-sm text-slate-500">
                {lang === 'ar' ? 'أو انقر للاختيار من جهازك · حجم أقصى 100MB' : 'or click to browse · max 100 MB'}
              </p>
            </div>

            {/* Supported formats */}
            <div className="flex items-center gap-2 mt-1">
              <FileText className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="text-xs text-slate-600 font-mono">
                PDF · JPG · PNG · WEBP · HEIC
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              multiple
              accept=".pdf,image/*"
              className="hidden"
              aria-hidden="true"
            />
          </motion.div>
        </motion.div>

        {/* Quick-tool chips */}
        <motion.div
          className="flex flex-wrap justify-center gap-2.5"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { delay: 0.52, duration: 0.5 }}
        >
          <span className="text-xs text-slate-600 self-center font-medium me-1">
            {lang === 'ar' ? 'أو اختر أداة:' : 'Or jump to:'}
          </span>
          {QUICK_TOOLS(lang).map((tool) => (
            <motion.button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className="quick-chip"
              {...(reduced ? {} : btnMotion)}
              id={`quick-chip-${tool.id}`}
            >
              {tool.label}
            </motion.button>
          ))}
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — BENTO FEATURES GRID
          UI UX Pro Max: Bento Box Grid — 4-col → 2-col → 1-col
          Wide cards span 2 columns for visual variety (Apple-style)
          ══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={bentoRef}
        className="flex flex-col gap-8"
      >
        {/* Section header */}
        <div className={`flex items-end justify-between gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
          <div className="min-w-0">
            <p className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-2">
              {lang === 'ar' ? 'الأدوات' : 'Tools'}
            </p>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-on-background tracking-tight">
              {lang === 'ar' ? (
                <>كل ما تحتاجه <span className="text-primary">في مكان واحد</span></>
              ) : (
                <>Everything you need <span className="text-primary">in one place</span></>
              )}
            </h2>
          </div>
          <motion.button
            onClick={() => onNavigate('tools')}
            className="shrink-0 flex items-center gap-1.5 text-sm font-semibold
                       text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                       rounded-lg px-2 py-1 min-h-[44px]"
            id="btn-all-tools"
            {...(reduced ? {} : btnMotion)}
          >
            {lang === 'ar' ? 'كل الأدوات' : 'All tools'}
            <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          </motion.button>
        </div>

        {/* Bento grid */}
        <motion.div
          variants={containerV}
          initial="hidden"
          animate={bentoVisible ? 'show' : 'hidden'}
          className="bento-grid"
        >
          {BENTO_CARDS.map((card) => (
            <motion.div
              key={card.id}
              variants={itemV}
              {...(reduced ? {} : cardMotion)}
              onClick={() => onSelectTool(card.id)}
              className={`bento-card group ${card.span === 'wide' ? 'bento-card--wide' : ''}`}
              id={`bento-${card.id}`}
              role="button"
              tabIndex={0}
              aria-label={lang === 'ar' ? card.titleAr : card.titleEn}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTool(card.id); }}
            >
              {/* Card inner glow on hover */}
              <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-primary/6
                              to-transparent opacity-0 group-hover:opacity-100
                              transition-opacity duration-400 pointer-events-none" />

              {/* Icon */}
              <div className={`bento-icon ${card.accent}`}>
                {card.icon}
              </div>

              {/* Text */}
              <div className="flex flex-col gap-1.5 flex-1">
                <h3 className="font-bold text-on-surface group-hover:text-on-surface
                               transition-colors text-base leading-snug">
                  {lang === 'ar' ? card.titleAr : card.titleEn}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {lang === 'ar' ? card.descAr : card.descEn}
                </p>
              </div>

              {/* Arrow */}
              <ArrowRight className={`w-4 h-4 text-slate-600 group-hover:text-primary
                                     transition-colors shrink-0 self-end mt-auto
                                     group-hover:translate-x-0.5 transition-transform
                                     ${isRtl ? 'rotate-180' : ''}`} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — TRUST STRIP
          3 stat pills + subtle horizontal rule
          ══════════════════════════════════════════════════════════════════════ */}
      <motion.section
        ref={trustRef}
        variants={containerV}
        initial="hidden"
        animate={trustVisible ? 'show' : 'hidden'}
        className="flex flex-col items-center gap-6"
      >
        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

        <div className="flex flex-wrap justify-center gap-4 md:gap-8">
          {TRUST_STATS(lang).map((stat, i) => (
            <motion.div
              key={i}
              variants={itemV}
              className="trust-stat"
            >
              <div className="trust-stat-icon">{stat.icon}</div>
              <div className="flex flex-col">
                <span className="text-lg font-extrabold text-on-surface tracking-tight leading-none">
                  {stat.value}
                </span>
                <span className="text-xs text-slate-500 mt-0.5">{stat.label}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      </motion.section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — BOTTOM CTA
          ══════════════════════════════════════════════════════════════════════ */}
      <motion.section
        ref={ctaRef}
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 32 }}
        animate={ctaVisible ? { opacity: 1, y: 0 } : {}}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
        className="flex flex-col items-center text-center gap-8 pb-8"
      >
        {/* Ambient glow behind CTA box */}
        <div className="relative w-full max-w-3xl">
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-br
                          from-primary/20 via-transparent to-secondary/15
                          blur-xl opacity-60 pointer-events-none" />
          <div className="relative cta-box">
            {/* Stars accent */}
            <div className="flex items-center justify-center gap-0.5 mb-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              ))}
            </div>

            <h2 className="text-2xl md:text-3xl font-display font-bold text-on-surface mb-3">
              {lang === 'ar'
                ? 'جرّب EasyPDF الآن مجاناً'
                : 'Try EasyPDF for free today'}
            </h2>
            <p className="text-on-surface-variant text-sm max-w-md mx-auto mb-7">
              {lang === 'ar'
                ? 'لا يلزم تسجيل لتجربة الأدوات الأساسية. سجّل للحصول على ميزات AI كاملة.'
                : 'No sign-up required to try the core tools. Register for full AI features.'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <motion.button
                onClick={() => onNavigate('tools')}
                className="nav-cta-btn px-7 py-3.5 rounded-xl text-sm font-semibold
                           cursor-pointer flex items-center gap-2 min-h-[48px]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                id="btn-cta-tools"
                {...(reduced ? {} : btnMotion)}
              >
                <Zap className="w-4 h-4 shrink-0" />
                {lang === 'ar' ? 'ابدأ الآن' : 'Get started'}
              </motion.button>

              <motion.button
                onClick={() => onNavigate('pricing')}
                className="px-7 py-3.5 rounded-xl text-sm font-medium
                           text-on-surface-variant hover:text-on-surface border border-white/10
                           hover:border-white/20 hover:bg-white/4 cursor-pointer
                           transition-all min-h-[48px]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                id="btn-cta-pricing"
                {...(reduced ? {} : btnMotion)}
              >
                {lang === 'ar' ? 'الأسعار والخطط' : 'View pricing'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.section>

    </div>
  );
}
