import React, { useEffect, useState } from 'react';
import { motion, animate, useReducedMotion } from 'motion/react';
import { Check, Sparkles, Download, ArrowRight, RefreshCw } from 'lucide-react';
import { checkmarkPathVariants, successBadgeVariants } from '../lib/animations';

interface AnimatedCounterProps {
  from?: number;
  to: number;
  duration?: number;
  className?: string;
  suffix?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  from = 0,
  to,
  duration = 0.8,
  className = '',
  suffix = '%'
}) => {
  const [displayValue, setDisplayValue] = useState(from);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(to);
      return;
    }

    const controls = animate(from, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplayValue(Math.round(latest))
    });

    return () => controls.stop();
  }, [from, to, duration, shouldReduceMotion]);

  return (
    <span className={className}>
      {displayValue}{suffix}
    </span>
  );
};

interface SkeletonLoaderProps {
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ className = 'h-12 w-full rounded-xl' }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden bg-white/5 border border-white/5 ${className}`}>
      {!shouldReduceMotion && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        />
      )}
    </div>
  );
};

interface SuccessFeedbackCardProps {
  title: string;
  subtitle?: string;
  fileName?: string;
  fileSize?: string;
  downloadUrl?: string;
  onDownload?: () => void;
  onReset?: () => void;
  lang?: 'ar' | 'en';
}

export const SuccessFeedbackCard: React.FC<SuccessFeedbackCardProps> = ({
  title,
  subtitle,
  fileName,
  fileSize,
  downloadUrl,
  onDownload,
  onReset,
  lang = 'en'
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={successBadgeVariants}
      initial="hidden"
      animate="visible"
      className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col items-center justify-center text-center gap-6 max-w-lg mx-auto w-full border-emerald-500/30 shadow-[0_10px_40px_rgba(16,185,129,0.15)] relative overflow-hidden"
    >
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />

      {/* Drawing Checkmark Circle */}
      <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 relative z-10 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M20 6L9 17l-5-5"
            variants={checkmarkPathVariants}
            initial={shouldReduceMotion ? 'visible' : 'hidden'}
            animate="visible"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-1.5 relative z-10">
        <h3 className="text-xl md:text-2xl font-bold font-display text-on-surface">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs md:text-sm text-on-surface-variant max-w-sm">
            {subtitle}
          </p>
        )}
      </div>

      {fileName && (
        <div className="p-3 bg-surface-bright/80 rounded-xl border border-white/10 w-full flex items-center justify-between text-xs font-mono">
          <span className="truncate max-w-[220px] text-emerald-300 font-semibold">{fileName}</span>
          {fileSize && <span className="text-neutral-400 text-[11px]">{fileSize}</span>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-3 w-full relative z-10 pt-2">
        {(downloadUrl || onDownload) && (
          <motion.a
            whileHover={!shouldReduceMotion ? { scale: 1.02 } : undefined}
            whileTap={!shouldReduceMotion ? { scale: 0.98 } : undefined}
            href={downloadUrl}
            download={fileName}
            onClick={onDownload}
            className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-on-primary cursor-pointer shadow-lg shadow-emerald-900/30"
          >
            <Download className="w-4 h-4" />
            {lang === 'ar' ? 'تنزيل المستند جاهزاً' : 'Download Processed File'}
          </motion.a>
        )}

        {onReset && (
          <button
            onClick={onReset}
            className="w-full sm:w-auto py-3 px-4 rounded-xl text-xs font-semibold text-neutral-300 hover:text-on-surface bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'معالجة ملف آخر' : 'Process Another'}
          </button>
        )}
      </div>
    </motion.div>
  );
};
