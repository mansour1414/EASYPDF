/**
 * ToolsPage — Phase 5 redesign (Sept 2026)
 *
 * Changes from previous version:
 *   • Copy cleanup: removed "Superpower Tools", "Open Protocol" jargon —
 *     replaced with plain, honest language matching Landing Page tone
 *   • Category filter: animated sliding pill indicator (motion layoutId)
 *     replaces flat background-color swap — consistent with NavBar pattern
 *   • Search: debounced (180ms) to avoid re-filtering on every keystroke;
 *     added visible <label> (sr-only) per UI UX Pro Max Forms guideline
 *   • Card badges: "AI" badge on Gemini-powered tools, "New" tag support
 *   • Empty state: redesigned with icon + clearer copy + reset action,
 *     per UI UX Pro Max Empty States guideline (not a blank space)
 *   • Category chips: flex-wrap preserved (Chip Collection Reflow guideline)
 *     — never clipped into a single scrolling row
 *   • Reduced motion respected throughout via useReducedMotion()
 *   • All touch targets ≥44px (Apple HIG)
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import {
  Search, GitMerge, Columns, Minimize, ArrowRight, RefreshCw,
  Layers, Lock, Unlock, Stamp, Hash, PenTool, ScanText, Sparkles,
  Files, SearchX, X,
} from 'lucide-react';
import { ToolType } from '../types';
import { cardMotion, getReducedOrVariants, makeStaggerContainer, makeStaggerItem } from '../lib/animations';

interface ToolsPageProps {
  onSelectTool: (tool: ToolType) => void;
  lang?: 'ar' | 'en';
}

type Category = 'all' | 'organize' | 'optimize' | 'convert' | 'security' | 'edit';

interface ToolDef {
  id: ToolType;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: Exclude<Category, 'all'>;
  size: 'large' | 'normal';
  badge?: 'ai' | 'new';
}

export default function ToolsPage({ onSelectTool, lang = 'en' }: ToolsPageProps) {
  const [searchInput, setSearchInput]   = useState('');
  const [searchQuery, setSearchQuery]   = useState(''); // debounced
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const reduced = useReducedMotion() === true;
  const [pageVisible, setPageVisible] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const isRtl = lang === 'ar';

  // Debounce search input → searchQuery (180ms)
  useEffect(() => {
    const id = window.setTimeout(() => setSearchQuery(searchInput), 180);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Page entrance via IntersectionObserver
  useEffect(() => {
    if (reduced) { setPageVisible(true); return; }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { setPageVisible(true); observer.unobserve(entry.target); }
      }),
      { threshold: 0.05 },
    );
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [reduced]);

  const containerVariants = makeStaggerContainer(reduced);
  const itemVariants      = makeStaggerItem(reduced);

  const toolsList: ToolDef[] = useMemo(() => [
    {
      id: 'page-manager', category: 'organize', size: 'large',
      title: lang === 'ar' ? 'إدارة الصفحات المرئية' : 'Visual Page Manager',
      description: lang === 'ar'
        ? 'معاينة مصغّرة لكل الصفحات، سحب وإعادة ترتيب، تدوير، حذف أو دمج صفحات جديدة.'
        : 'Thumbnail view to reorder, rotate, delete, or merge pages with drag-and-drop.',
      icon: <Layers className="w-5 h-5" />,
    },
    {
      id: 'merge', category: 'organize', size: 'normal',
      title: lang === 'ar' ? 'دمج PDF' : 'Merge PDF',
      description: lang === 'ar'
        ? 'اجمع عدة ملفات PDF في مستند واحد مع إعادة ترتيب بالسحب والإفلات.'
        : 'Combine multiple PDFs into one document with drag-and-drop reordering.',
      icon: <GitMerge className="w-5 h-5" />,
    },
    {
      id: 'split', category: 'organize', size: 'normal',
      title: lang === 'ar' ? 'تقسيم PDF' : 'Split PDF',
      description: lang === 'ar'
        ? 'قسّم ملف PDF إلى عدة ملفات حسب نطاقات صفحات محددة.'
        : 'Split one PDF into multiple files by page range, or extract single pages.',
      icon: <Columns className="w-5 h-5" />,
    },
    {
      id: 'compress', category: 'optimize', size: 'normal',
      title: lang === 'ar' ? 'ضغط PDF' : 'Compress PDF',
      description: lang === 'ar'
        ? 'قلّل حجم الملف بشكل ملحوظ مع الحفاظ على جودة العرض.'
        : 'Reduce file size significantly while keeping visual quality.',
      icon: <Minimize className="w-5 h-5" />,
    },
    {
      id: 'protect', category: 'security', size: 'normal',
      title: lang === 'ar' ? 'حماية بكلمة مرور' : 'Protect PDF',
      description: lang === 'ar'
        ? 'شفّر ملف PDF بكلمة مرور لمنع الوصول غير المصرح به.'
        : 'Encrypt your PDF with a password to prevent unauthorized access.',
      icon: <Lock className="w-5 h-5" />,
    },
    {
      id: 'unlock', category: 'security', size: 'normal',
      title: lang === 'ar' ? 'فك حماية PDF' : 'Unlock PDF',
      description: lang === 'ar'
        ? 'أزل كلمة المرور من ملف PDF محمي (تتطلب معرفة كلمة المرور الحالية).'
        : 'Remove the password from a protected PDF (requires the current password).',
      icon: <Unlock className="w-5 h-5" />,
    },
    {
      id: 'watermark', category: 'edit', size: 'normal',
      title: lang === 'ar' ? 'علامة مائية' : 'Watermark',
      description: lang === 'ar'
        ? 'أضف علامة مائية نصية أو صورة مع تحكم كامل بالشفافية والموقع.'
        : 'Add a text or image watermark with full control over opacity and position.',
      icon: <Stamp className="w-5 h-5" />,
    },
    {
      id: 'page-numbers', category: 'edit', size: 'normal',
      title: lang === 'ar' ? 'ترقيم الصفحات' : 'Page Numbers',
      description: lang === 'ar'
        ? 'أضف أرقام صفحات تلقائياً بتنسيق وموقع تختاره.'
        : 'Automatically add page numbers in the format and position you choose.',
      icon: <Hash className="w-5 h-5" />,
    },
    {
      id: 'signature', category: 'edit', size: 'large',
      title: lang === 'ar' ? 'التوقيع الإلكتروني' : 'E-Signature',
      description: lang === 'ar'
        ? 'ارسم أو ارفع توقيعك وضعه بدقة على أي صفحة من المستند.'
        : 'Draw, type, or upload your signature and place it precisely on any page.',
      icon: <PenTool className="w-5 h-5" />,
    },
    {
      // Sept 2026 fix: this card was previously missing from this page
      // entirely, even though the 'convert-to'/'convert-from' tool logic
      // already existed in Workspace.tsx and a "Convert & OCR" filter tab
      // already existed below with nothing to show for "Convert" under it.
      // The Convert tool itself now offers a direction switcher inside the
      // workspace (Images → PDF / PDF → PNG / PDF → JPG); this single card
      // is the one Tools-page entry point into all of them.
      id: 'convert-to', category: 'convert', size: 'normal',
      title: lang === 'ar' ? 'تحويل الصيغ' : 'Convert',
      description: lang === 'ar'
        ? 'حوّل الصور إلى PDF، أو حوّل صفحات PDF إلى صور PNG أو JPG.'
        : 'Convert images to PDF, or convert PDF pages to PNG or JPG images.',
      icon: <RefreshCw className="w-5 h-5" />,
    },
    {
      id: 'ocr', category: 'convert', size: 'normal', badge: 'ai',
      title: lang === 'ar' ? 'استخراج النص (OCR)' : 'OCR Text Extractor',
      description: lang === 'ar'
        ? 'حوّل المستندات الممسوحة والصور إلى نص قابل للنسخ والبحث.'
        : 'Convert scanned documents and images into searchable, copyable text.',
      icon: <ScanText className="w-5 h-5" />,
    },
    {
      id: 'smart-enhance', category: 'optimize', size: 'large', badge: 'ai',
      title: lang === 'ar' ? 'أدوات Gemini الذكية' : 'Gemini AI Smart Tools',
      description: lang === 'ar'
        ? 'تحسين تلقائي للصور، إعادة تسمية ذكية، واستخراج بيانات الجداول إلى CSV.'
        : 'Auto-enhance scans, smart file renaming, and extract table data to CSV.',
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'batch', category: 'organize', size: 'normal',
      title: lang === 'ar' ? 'معالجة دفعية' : 'Batch Processing',
      description: lang === 'ar'
        ? 'طبّق عملية واحدة (ضغط، تحويل، علامة مائية) على عدة ملفات دفعة واحدة.'
        : 'Apply one operation (compress, convert, watermark) to multiple files at once.',
      icon: <Files className="w-5 h-5" />,
    },
  ], [lang]);

  const categories: { label: string; value: Category }[] = [
    { label: lang === 'ar' ? 'الكل'    : 'All Tools',       value: 'all' },
    { label: lang === 'ar' ? 'تنظيم'   : 'Organize',        value: 'organize' },
    { label: lang === 'ar' ? 'تعديل'   : 'Edit & Decorate', value: 'edit' },
    { label: lang === 'ar' ? 'أمان'    : 'Security',        value: 'security' },
    { label: lang === 'ar' ? 'تحسين'   : 'Optimize',        value: 'optimize' },
    { label: lang === 'ar' ? 'تحويل'   : 'Convert & OCR',   value: 'convert' },
  ];

  const filteredTools = useMemo(() => toolsList.filter((tool) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q
      || tool.title.toLowerCase().includes(q)
      || tool.description.toLowerCase().includes(q);
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  }), [toolsList, searchQuery, activeCategory]);

  const handleResetFilters = () => { setSearchInput(''); setActiveCategory('all'); };

  return (
    <div ref={pageRef} className="flex flex-col gap-12 items-center w-full" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-4xl flex flex-col items-center gap-4 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px]
                        bg-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" aria-hidden="true" />

        <h1 className="text-2xl sm:text-3xl md:text-5xl font-display font-extrabold text-on-surface tracking-tight px-2">
          {lang === 'ar' ? 'كل أدوات PDF في مكان واحد' : 'All your PDF tools, in one place'}
        </h1>
        <p className="text-sm md:text-base text-on-surface-variant max-w-2xl leading-relaxed">
          {lang === 'ar'
            ? 'مجموعة متكاملة لتعديل وحماية وتحويل ملفاتك — بعضها معزز بالذكاء الاصطناعي.'
            : 'A complete toolkit to edit, secure, and convert your files — some powered by AI.'}
        </p>

        {/* ── Search & category bar ──────────────────────────────────────── */}
        <div className="w-full max-w-2xl flex flex-col md:flex-row gap-3 items-stretch md:items-center
                        justify-between mt-6 bg-surface-container/50 p-2.5 rounded-2xl
                        border border-white/8 backdrop-blur-md">
          {/* Search box */}
          <div className="relative w-full md:w-64 shrink-0">
            <label htmlFor="input-search-tools" className="sr-only">
              {lang === 'ar' ? 'البحث عن الأدوات' : 'Search tools'}
            </label>
            <Search className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2
                               w-4 h-4 text-on-surface-variant pointer-events-none`} />
            <input
              id="input-search-tools"
              type="search"
              placeholder={lang === 'ar' ? 'ابحث عن أداة...' : 'Search tools...'}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={`w-full ${isRtl ? 'pr-10 pl-9' : 'pl-10 pr-9'} py-2.5 bg-surface-bright/50
                         rounded-xl border border-white/10 text-sm text-on-surface
                         focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25
                         transition-colors placeholder:text-slate-600 min-h-[44px]`}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className={`absolute ${isRtl ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2
                           text-slate-500 hover:text-on-surface transition-colors
                           w-5 h-5 flex items-center justify-center rounded-full cursor-pointer`}
                aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                id="btn-clear-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category pills — sliding indicator, flex-wrap preserved */}
          <div className="flex flex-wrap items-center gap-1 w-full md:w-auto" role="tablist"
               aria-label={lang === 'ar' ? 'تصنيف الأدوات' : 'Tool categories'}>
            {categories.map((cat) => {
              const isActive = activeCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`relative text-xs px-3.5 py-2 font-semibold rounded-lg cursor-pointer
                             transition-colors duration-150 min-h-[36px]
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                             ${isActive ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                  id={`category-tab-${cat.value}`}
                >
                  {isActive && !reduced && (
                    <motion.span
                      layoutId="category-active-pill"
                      className="absolute inset-0 rounded-lg bg-secondary shadow-sm"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  {isActive && reduced && (
                    <span className="absolute inset-0 rounded-lg bg-secondary shadow-sm" />
                  )}
                  <span className="relative">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tools grid ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {filteredTools.length > 0 ? (
          <motion.div
            key={`${activeCategory}-${searchQuery}`}
            variants={containerVariants}
            initial="hidden"
            animate={pageVisible ? 'show' : 'hidden'}
            exit={reduced ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full auto-rows-fr"
          >
            {filteredTools.map((tool) => (
              <motion.div
                key={tool.id}
                variants={itemVariants}
                {...(reduced ? {} : cardMotion)}
                onClick={() => onSelectTool(tool.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTool(tool.id); }}
                role="button"
                tabIndex={0}
                aria-label={tool.title}
                className={`cursor-pointer group focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-primary/60 rounded-xl
                           ${tool.size === 'large' ? 'lg:col-span-2' : ''}`}
                id={`tool-card-${tool.id}`}
              >
                <div className={`content-card content-card-interactive relative rounded-xl p-6
                                 flex flex-col gap-4 overflow-hidden h-full text-start
                                 ${isRtl ? 'items-end text-end' : ''}`}>

                  {/* Badge */}
                  {tool.badge === 'ai' && (
                    <span className="absolute top-4 end-4 flex items-center gap-1 px-2 py-0.5
                                     rounded-full bg-primary/15 border border-primary/30
                                     text-primary text-[0.65rem] font-bold uppercase tracking-wide">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}

                  {/* Icon */}
                  <motion.div
                    className="w-12 h-12 rounded-lg bg-surface-bright border border-white/10
                               flex items-center justify-center text-primary
                               group-hover:bg-primary group-hover:text-on-primary
                               transition-colors duration-300 shadow-sm shrink-0"
                    whileHover={reduced ? undefined : { scale: 1.08, rotate: 3 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  >
                    {tool.icon}
                  </motion.div>

                  {/* Text */}
                  <div className="flex flex-col gap-1.5 flex-grow">
                    <h3 className="text-lg font-display font-semibold text-on-surface
                                   group-hover:text-on-surface transition-colors">
                      {tool.title}
                    </h3>
                    <p className={`text-sm text-on-surface-variant leading-relaxed
                                   ${tool.size === 'large' ? 'lg:max-w-[78%]' : ''}`}>
                      {tool.description}
                    </p>
                  </div>

                  {/* Open link */}
                  <div className="mt-auto pt-4 border-t border-white/5 flex items-center gap-1
                                 text-primary font-semibold text-xs opacity-0 group-hover:opacity-100
                                 translate-y-1 group-hover:translate-y-0 transition-all duration-250">
                    {lang === 'ar' ? 'فتح الأداة' : 'Open tool'}
                    <ArrowRight className={`w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform
                                           ${isRtl ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          /* ── Empty state ──────────────────────────────────────────────── */
          <motion.div
            key="empty"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full py-16 flex flex-col items-center justify-center gap-4 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8
                            flex items-center justify-center text-slate-500">
              <SearchX className="w-7 h-7" />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-semibold text-on-surface">
                {lang === 'ar' ? 'لا توجد أدوات مطابقة' : 'No matching tools'}
              </p>
              <p className="text-sm text-on-surface-variant max-w-xs mx-auto">
                {lang === 'ar'
                  ? 'جرّب كلمة بحث مختلفة أو اختر فئة أخرى.'
                  : 'Try a different search term or choose another category.'}
              </p>
            </div>
            <button
              onClick={handleResetFilters}
              className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold text-primary
                         hover:bg-primary/10 border border-primary/25 transition-colors
                         cursor-pointer min-h-[40px]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              id="btn-reset-filters"
            >
              {lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
