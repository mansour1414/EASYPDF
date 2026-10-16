import React from 'react';
import { ShieldCheck, HelpCircle, DollarSign, Calendar, MessageSquare, AlertCircle } from 'lucide-react';

interface RefundPageProps {
  lang?: 'ar' | 'en';
}

export default function RefundPage({ lang = 'en' }: RefundPageProps) {
  const isAr = lang === 'ar';

  return (
    <div className={`w-full flex flex-col gap-10 md:gap-14 py-6 animate-fadeIn ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none -z-10"></div>

      {/* Hero Header */}
      <section className="text-center max-w-3xl mx-auto flex flex-col gap-4">
        <span className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-widest bg-indigo-600/10 px-3.5 py-1.5 rounded-full w-fit mx-auto">
          {isAr ? 'سياسة الاسترجاع' : 'Refund Policy'}
        </span>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-on-surface tracking-tight leading-tight">
          {isAr ? 'سياسة الاسترداد وإلغاء الاشتراك' : 'Subscription Refund Policy'}
        </h1>
        <p className="text-sm md:text-base text-neutral-300 leading-relaxed font-sans">
          {isAr
            ? 'نحن نضمن لك الشفافية التامة. يرجى مراجعة شروط وسياسة استرداد المبالغ المالية لخطط Easy PDF الاحترافية.'
            : 'We believe in complete transparency. Please read our refund and subscription cancellation guidelines for Easy PDF Pro.'}
        </p>
      </section>

      {/* Main Content Sections */}
      <section className="max-w-4xl mx-auto w-full flex flex-col gap-8">
        
        {/* Section 1: 14-Day Money Back Guarantee */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-indigo-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '١. ضمان استرداد الأموال خلال ١٤ يوماً' : '1. 14-Day Satisfaction Guarantee'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'إذا قمت بالاشتراك في الخطة الاحترافية (Pro) بقيمة ٩.٩٩ دولار شهرياً ولم تكن راضياً عن الخدمة بنسبة ١٠٠٪، يمكنك طلب استرداد كامل المبلغ المدفوع في غضون ١٤ يوماً من تاريخ اشتراكك الأول. سنقوم برد المبلغ بالكامل دون طرح أي أسئلة معقدة.'
              : 'If you subscribe to our Pro tier at $9.99/month and are not 100% satisfied with the service, you can request a full refund within 14 days of your initial subscription. We will process your return immediately, no complicated questions asked.'}
          </p>
        </div>

        {/* Section 2: Cancellation of Automatic Renewal */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-secondary/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٢. إلغاء التجديد التلقائي للاشتراك' : '2. Cancellation of Automatic Renewal'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'يمكنك إلغاء تجديد اشتراكك في الخطة الاحترافية في أي وقت من خلال إعدادات حسابك. بعد الإلغاء، سيبقى حسابك متمتعاً بكامل ميزات الخطة الاحترافية حتى نهاية فترة الفوترة الشهرية المدفوعة مسبقاً، ولن يتم سحب أو تفعيل أي مبالغ مالية جديدة بعد ذلك.'
              : 'You can cancel your subscription renewal at any time directly through your account dashboard. After cancellation, you will retain full access to all Pro features until the end of your current pre-paid monthly billing cycle. No further payments will be charged.'}
          </p>
        </div>

        {/* Section 3: Conditions for Refund Requests */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-red-400/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-400/10 flex items-center justify-center text-red-400 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٣. شروط واستثناءات الاسترداد المالي' : '3. Conditions & Refund Eligibility'}
            </h2>
          </div>
          <div className="text-sm text-neutral-300 leading-relaxed font-sans flex flex-col gap-2">
            <p>
              {isAr
                ? 'لكي تكون مؤهلاً لاسترداد الأموال، يجب مراعاة الشروط التالية:'
                : 'To ensure fairness, please note the following conditions for refund eligibility:'}
            </p>
            <ul className={`list-disc px-5 flex flex-col gap-1.5 ${isAr ? 'text-right' : 'text-left'}`}>
              <li>
                {isAr
                  ? 'أن يتم إرسال طلب الاسترداد في غضون ١٤ يوماً من تاريخ الدفع.'
                  : 'The refund request must be submitted within 14 days of the charge.'}
              </li>
              <li>
                {isAr
                  ? 'ألا يكون هناك استخدام مفرط للخدمات (مثل معالجة أكثر من ٥٠ ملفاً خلال فترة الـ ١٤ يوماً الأولى).'
                  : 'No abusive or extreme utilization has occurred (e.g. processing more than 50 files during the first 14 days).'}
              </li>
              <li>
                {isAr
                  ? 'لا ينطبق ضمان الـ ١٤ يوماً على عمليات التجديد التلقائي المتعاقبة، بل على الاشتراك الأول فقط.'
                  : 'The 14-day guarantee applies only to your initial purchase, not to successive automatic subscription renewals.'}
              </li>
            </ul>
          </div>
        </div>

        {/* Section 4: Contact & How to Claim */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-emerald-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٤. كيفية تقديم طلب استرداد مالي' : '4. How to Submit a Refund Claim'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'لتقديم طلب استرداد مالي، يرجى التواصل مع فريق الدعم الفني لدينا عبر البريد الإلكتروني (support@easypdf.com) مع تضمين عنوان البريد الإلكتروني المسجل في حسابك ورقم مرجع الفاتورة المستلمة من Stripe. تتم معالجة وتحويل طلبات الاسترداد المقبولة إلى بطاقتك البنكية خلال ٥ إلى ١٠ أيام عمل.'
              : 'To request a refund, please reach out to our dedicated billing support team at support@easypdf.com. Please include your registered account email and Stripe invoice ID. Accepted refunds are credited back to the original payment card within 5 to 10 business days.'}
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
