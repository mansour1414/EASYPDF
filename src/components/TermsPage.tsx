import React from 'react';
import { Shield, BookOpen, User, CreditCard, Cpu, AlertTriangle } from 'lucide-react';

interface TermsPageProps {
  lang?: 'ar' | 'en';
}

export default function TermsPage({ lang = 'en' }: TermsPageProps) {
  const isAr = lang === 'ar';

  return (
    <div className={`w-full flex flex-col gap-10 md:gap-14 py-6 animate-fadeIn ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-primary/10 blur-[130px] rounded-full pointer-events-none -z-10"></div>

      {/* Hero Header */}
      <section className="text-center max-w-3xl mx-auto flex flex-col gap-4">
        <span className="text-xs font-bold font-mono text-primary uppercase tracking-widest bg-primary/10 px-3.5 py-1.5 rounded-full w-fit mx-auto">
          {isAr ? 'شروط الخدمة' : 'Terms of Service'}
        </span>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-on-surface tracking-tight leading-tight">
          {isAr ? 'شروط وأحكام الاستخدام' : 'Terms & Conditions of Use'}
        </h1>
        <p className="text-sm md:text-base text-neutral-300 leading-relaxed font-sans">
          {isAr
            ? 'يرجى قراءة هذه الشروط بعناية قبل استخدام خدمات Easy PDF. استخدامك للمنصة يعني موافقتك الكاملة على هذه الأحكام.'
            : 'Please read these terms carefully before using Easy PDF services. Your use of our platform constitutes full agreement to these provisions.'}
        </p>
      </section>

      {/* Main Content Sections */}
      <section className="max-w-4xl mx-auto w-full flex flex-col gap-8">
        
        {/* Section 1: Use of Service */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-primary/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '١. قبول الشروط واستخدام الخدمة' : '1. Acceptance of Terms & Usage'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'باستخدام Easy PDF، فإنك تقر بأن عمرك لا يقل عن ١٨ عاماً أو أنك تستخدم المنصة تحت إشراف ولي الأمر. تمنحك المنصة ترخيصاً شخصياً، غير حصري، وغير قابل للتحويل لاستخدام ميزات معالجة المستندات والملفات وفقاً لهذه الشروط.'
              : 'By using Easy PDF, you acknowledge that you are at least 18 years of age or using the platform under guardian supervision. We grant you a personal, non-exclusive, non-transferable license to use our document and file processing features in accordance with these terms.'}
          </p>
        </div>

        {/* Section 2: User Responsibilities & PDF Uploads */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-secondary/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <User className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٢. مسؤوليات المستخدم ورفع الملفات' : '2. User Responsibilities & PDF Uploads'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'أنت مسؤول بشكل كامل عن أي ملفات PDF أو صور تقوم برفعها أو معالجتها من خلال خدمتنا. يجب ألا تحتوي الملفات على محتوى ينتهك حقوق الملكية الفكرية، أو يحتوي على برمجيات خبيثة، أو يخالف القوانين المحلية والدولية. نحن لا نقوم بمراجعة ملفاتك بشكل يدوي وتتم معالجتها آلياً.'
              : 'You are solely responsible for any PDF files or images you upload or process through our service. Uploaded files must not infringe on intellectual property rights, contain malicious software, or violate local and international laws. We do not manually review your files; they are processed entirely through automation.'}
          </p>
        </div>

        {/* Section 3: AI-Powered Features (Gemini) */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-emerald-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٣. ميزات الذكاء الاصطناعي (Gemini)' : '3. AI-Powered Features (Gemini)'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'تستخدم ميزات التلخيص الذكي والـ OCR والـ AI Copilot نماذج معالجة اللغة الطبيعية المتقدمة (Gemini API) من Google. نحن نقوم بإرسال محتوى النص المستخرج فقط بشكل آمن عبر قنوات مشفرة للمعالجة الفورية، ولا يتم استخدام بياناتك أو نصوصك لتدريب هذه النماذج.'
              : 'Smart Summarization, OCR, and AI Copilot features utilize Google\'s advanced natural language processing models (via Gemini API). We transmit only the extracted document text securely via encrypted channels for real-time processing; your data and text are never stored or used to train these models.'}
          </p>
        </div>

        {/* Section 4: Subscriptions & Billing */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-indigo-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٤. الاشتراكات والدفع والفوترة' : '4. Subscriptions, Payments & Billing'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'تتوفر خطة الترقية الاحترافية (Pro) مقابل ٩.٩٩ دولار شهرياً. تتم إدارة جميع عمليات الدفع بأمان من خلال Stripe. يتم تجديد الاشتراك تلقائياً في نهاية كل دورة فوترة شهرية ما لم تقم بإلغائه من إعدادات حسابك قبل تاريخ التجديد.'
              : 'The Pro tier subscription is available for $9.99/month. All payments are securely managed via Stripe. Subscriptions renew automatically at the end of each monthly billing cycle unless cancelled through your account settings before the renewal date.'}
          </p>
        </div>

        {/* Section 5: Disclaimer & Limitations */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-red-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٥. إخلاء المسؤولية وحدود الالتزام' : '5. Disclaimer & Limitation of Liability'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'تُقدم خدمات Easy PDF "كما هي" دون أي ضمانات صريحة أو ضمنية. نحن لا نضمن دقة معالجة النصوص بنسبة ١٠٠٪ أو استخراج البيانات عبر الـ OCR نظراً للطبيعة التقنية للمستندات والذكاء الاصطناعي. لا نتحمل المسؤولية عن أي خسائر مباشرة أو غير مباشرة ناتجة عن استخدام الخدمة.'
              : 'Easy PDF services are provided "as is" without any express or implied warranties. We do not guarantee 100% text extraction or OCR accuracy due to the complex nature of documents and AI parsing. We hold no liability for any direct or indirect losses arising from your use of the service.'}
          </p>
        </div>

      </section>

      {/* Date Updated */}
      <div className="text-center text-xs text-neutral-500 font-mono mt-4">
        {isAr ? 'آخر تحديث: ٢٠ يوليو ٢٠٢٦' : 'Last Updated: July 20, 2026'}
      </div>
    </div>
  );
}
