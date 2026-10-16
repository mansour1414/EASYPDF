import React from 'react';
import { Cpu, Shield, Clock, Award, Users, CheckCircle2 } from 'lucide-react';

interface AboutPageProps {
  lang?: 'ar' | 'en';
}

export default function AboutPage({ lang = 'en' }: AboutPageProps) {
  return (
    <div className="w-full flex flex-col gap-12 md:gap-16 py-6 animate-fadeIn">
      {/* Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-primary/10 blur-[130px] rounded-full pointer-events-none -z-10"></div>

      {/* Main Vision Hero */}
      <section className="text-center max-w-3xl mx-auto flex flex-col gap-5">
        <span className="text-xs font-bold font-mono text-primary uppercase tracking-widest bg-primary/10 px-3.5 py-1.5 rounded-full w-fit mx-auto">
          {lang === 'ar' ? 'رؤيتنا وقيمنا' : 'Our Vision & Core values'}
        </span>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-on-surface tracking-tight leading-tight">
          {lang === 'ar' ? 'الوقت هو أثمن ما تملك' : 'Time Is Your Most Valuable Asset'}
        </h1>
        <p className="text-base md:text-lg text-neutral-300 leading-relaxed font-sans">
          {lang === 'ar'
            ? 'في Easy PDF، نؤمن أن الوقت هو أثمن ما تملك. انطلقنا من رؤية بسيطة: جعل إدارة ملفات الـ PDF والصور عملية سلسة، ذكية، وخالية من التعقيد، لنمنحك القوة لتبسيط أعمالك والتركيز على ما يهم حقاً.'
            : 'At Easy PDF, we believe time is your most precious asset. We started with a simple vision: to make PDF and image management seamless, intelligent, and free of friction, empowering you to streamline work and focus on what truly matters.'}
        </p>
      </section>

      {/* Pillars Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
        <div className="content-card p-6 rounded-2xl flex flex-col gap-4 text-left hover:border-primary/30 transition-all">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface">
              {lang === 'ar' ? 'سرعة فائقة وثورية' : 'Revolutionary Velocity'}
            </h3>
            <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
              {lang === 'ar'
                ? 'لا مزيد من الانتظار أو رفع الملفات الطويل. دمج وتعديل فوري في جزء من الثانية.'
                : 'No more waiting or long upload times. Instant processing in a fraction of a second.'}
            </p>
</div>
          </div>

        <div className="content-card p-6 rounded-2xl flex flex-col gap-4 text-left hover:border-primary/30 transition-all">
          <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface">
              {lang === 'ar' ? 'ذكاء اصطناعي سيادي' : 'Sovereign AI Integration'}
            </h3>
            <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
              {lang === 'ar'
                ? 'استخدم مساعد Gemini المدمج لتلخيص وترجمة وتعديل النصوص مباشرة بمرونة تامة.'
                : 'Leverage native Gemini AI to summarize, translate, and modify texts with ultimate flexibility.'}
            </p>
</div>
          </div>

        <div className="content-card p-6 rounded-2xl flex flex-col gap-4 text-left hover:border-primary/30 transition-all">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-on-surface">
              {lang === 'ar' ? 'خصوصية بتصميم مدروس' : 'Privacy by Design'}
            </h3>
            <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
              {lang === 'ar'
                ? 'أدوات الدمج والتقسيم والضغط والترميز تعمل بالكامل داخل متصفحك. الميزات الذكية (OCR، التلخيص، المساعد) تُعالج عبر خوادمنا المشفرة اتصالاً كاملاً.'
                : 'Merge, split, compress, and watermark tools run fully inside your browser. AI features (OCR, summaries, Copilot) are processed on our servers over encrypted connections.'}
            </p>
          </div>
        </div>
      </section>

      {/* Additional Stats / Trust Area */}
      <section className="bg-white/3 border border-white/5 rounded-2xl p-8 max-w-4xl mx-auto w-full flex flex-col sm:flex-row items-center justify-around gap-6 text-center">
        <div>
          <span className="block text-3xl font-extrabold text-primary font-mono">100%</span>
          <span className="text-xs text-neutral-400 mt-1 block">
            {lang === 'ar' ? 'اتصال مشفر عبر HTTPS/TLS' : 'Encrypted HTTPS/TLS transfer'}
          </span>
        </div>
        <div className="w-px h-10 bg-white/10 hidden sm:block"></div>
        <div>
          <span className="block text-3xl font-extrabold text-secondary font-mono">AES-256</span>
          <span className="text-xs text-neutral-400 mt-1 block">
            {lang === 'ar' ? 'تشفير كلمة مرور ملفات PDF' : 'PDF password protection encryption'}
          </span>
        </div>
        <div className="w-px h-10 bg-white/10 hidden sm:block"></div>
        <div>
          <span className="block text-3xl font-extrabold text-on-surface font-mono">RLS</span>
          <span className="text-xs text-neutral-400 mt-1 block">
            {lang === 'ar' ? 'تخزين سحابي محمي بعزل الصفوف' : 'Cloud storage protected by row-level security'}
          </span>
        </div>
      </section>
    </div>
  );
}
