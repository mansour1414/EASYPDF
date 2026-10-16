import React, { useEffect, useState } from 'react';
import { Check, ShieldCheck, Activity, Users, Building, PauseCircle } from 'lucide-react';
import { useTranslation } from '../lib/TranslationContext';
import { authenticatedFetch } from '../lib/supabaseClient';

interface PricingPageProps {
  onPlanSelected: (planName: string) => void;
  lang?: 'ar' | 'en';
}

export default function PricingPage({ onPlanSelected, lang = 'en' }: PricingPageProps) {
  const { t } = useTranslation();

  // Centralized subscription ON/OFF switch (set from the Admin Dashboard).
  // FAIL-CLOSED: starts `false` (paid plans blocked) until the public
  // /api/subscription-status check confirms it's actually enabled, rather
  // than briefly/incorrectly allowing checkout while real payment
  // configuration is unconfirmed. The Free plan is unaffected either way —
  // it never involves a payment.
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch('/api/subscription-status')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSubscriptionsEnabled(data?.enabled === true);
      })
      .catch((err) => console.error('Error fetching subscription status:', err));
    return () => { cancelled = true; };
  }, []);

  // BILLING FIX: only monthly billing is offered. The backend's
  // /api/stripe/checkout creates exactly one Stripe price ($9.99/month,
  // recurring month) — no annual Stripe price exists in the project
  // configuration. The previous "Annually / Save 20%" toggle advertised an
  // annual plan that could never actually be purchased, so it has been
  // removed until a real annual Stripe price is wired up server-side.
  // Do not re-add an annual option without creating the matching Stripe
  // price and extending /api/stripe/checkout to use it.

  const plans = [
    {
      name: lang === 'ar' ? 'الخطة الأساسية (مجاناً)' : 'Basic (Free)',
      description: lang === 'ar' ? 'أدوات أساسية للمهام اليومية والتلخيص البسيط.' : 'Essential tools for basic daily tasks.',
      priceMonthly: 0,
      isPopular: false,
      ctaText: lang === 'ar' ? 'ابدأ الاستخدام مجاناً' : 'Get Started',
      ctaStyle: 'btn-secondary',
      subText: '',
      features: lang === 'ar' ? [
        '٣ عمليات رفع سحابية يومياً',
        '٣ عمليات ذكاء اصطناعي يومياً (تلخيص، OCR، المساعد)',
        'أدوات PDF التي تعمل داخل المتصفح بدون حد يومي',
        'حتى ٢٠ ميجابايت لكل رفع سحابي',
      ] : [
        '3 cloud uploads per day',
        '3 AI actions per day (summaries, OCR, Copilot)',
        'Browser-based PDF tools with no daily limit',
        'Up to 20MB per cloud upload',
      ],
    },
    {
      name: lang === 'ar' ? 'الخطة الاحترافية (Pro)' : 'Pro',
      description: lang === 'ar' ? 'الحزمة الفائقة مع مساعد التعديل الذكي والـ OCR والخصوصية.' : 'Unleash full superpower with AI Copilot & OCR.',
      priceMonthly: 9.99,
      isPopular: true,
      ctaText: lang === 'ar' ? 'الترقية للخطّة الاحترافية' : 'Upgrade to Pro',
      ctaStyle: 'btn-primary font-semibold shadow-[0_0_20px_rgba(79,70,229,0.3)]',
      subText: lang === 'ar' ? 'كل ميزات الخطة المجانية، بالإضافة إلى:' : 'EVERYTHING IN FREE, PLUS:',
      features: lang === 'ar' ? [
        'رفع سحابي غير محدود',
        'عمليات ذكاء اصطناعي غير محدودة (تلخيص، OCR، المساعد)',
      ] : [
        'Unlimited cloud uploads',
        'Unlimited AI actions (summaries, OCR, Copilot)',
      ],
    },
  ];

  const handleCtaClick = (planName: string, isPaidPlan: boolean) => {
    // Server-side (`/api/stripe/checkout`) also rejects this independently —
    // this is just the UI-level guard so a disabled button never even
    // reaches onPlanSelected/checkout navigation for a paid plan.
    if (isPaidPlan && !subscriptionsEnabled) return;
    onPlanSelected(planName);
  };

  return (
    <div className="flex flex-col items-center justify-center py-6 w-full max-w-6xl mx-auto gap-12 text-center">

      {/* Subscriptions-disabled notice — centralized Admin Dashboard switch.
          Plans remain visible for information; only purchasing is blocked. */}
      {!subscriptionsEnabled && (
        <div className="w-full max-w-2xl -mb-4 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs md:text-sm font-semibold">
          <PauseCircle className="w-4 h-4 shrink-0" />
          <span>{lang === 'ar' ? 'الاشتراكات متوقفة حاليًا' : 'Subscriptions are temporarily unavailable'}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="max-w-3xl flex flex-col gap-4">
        <h1 className="text-4xl md:text-6xl font-display font-extrabold text-on-surface tracking-tight leading-tight">
          {lang === 'ar' ? (
            <>
              {t('pricing_title_en', 'أسعار بسيطة لحلول ذكية ومتكاملة')}
            </>
          ) : (
            <>
              {t('pricing_title_en', 'Simple Pricing for Smart Solutions')}
            </>
          )}
        </h1>
        <p className="text-sm md:text-base text-on-surface-variant max-w-2xl leading-relaxed">
          {t('pricing_subtitle', 'Powerful document management tools tailored for individuals, professionals, and teams. Choose the plan that accelerates your workflow.')}
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto items-stretch mt-4">
        {plans.map((plan) => {
          const price = plan.priceMonthly;
          const isPaidPlan = price > 0;
          const ctaBlocked = isPaidPlan && !subscriptionsEnabled;

          return (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col hover:-translate-y-1 transition-transform duration-300 relative text-left h-full ${
                plan.isPopular 
                  ? 'content-card content-card-elevated' 
                  : 'content-card'
              }`}
              id={`plan-card-${plan.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {/* Popular Badge */}
              {plan.isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-container text-on-primary-container font-mono text-xs px-4 py-1 rounded-full uppercase tracking-wider font-extrabold shadow-[0_0_15px_rgba(160,120,255,0.4)] border border-primary/20">
                  {lang === 'ar' ? 'الأكثر شعبية' : 'Most Popular'}
                </div>
              )}

              {/* Title Header */}
              <div className="mb-6">
                <h3 className={`text-xl md:text-2xl font-display font-bold mb-1 ${plan.isPopular ? 'text-primary' : 'text-on-surface'}`}>
                  {plan.name}
                </h3>
                <p className="text-xs text-on-surface-variant">
                  {plan.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-8 flex items-baseline">
                <span className="text-4xl md:text-5xl font-display font-extrabold text-on-surface">${price}</span>
                <span className="text-xs text-on-surface-variant ml-1 font-mono">
                  {lang === 'ar' ? '/شهري' : '/month'}
                </span>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleCtaClick(plan.name, isPaidPlan)}
                disabled={ctaBlocked}
                title={ctaBlocked ? (lang === 'ar' ? 'الاشتراكات متوقفة حاليًا' : 'Subscriptions are temporarily unavailable') : undefined}
                className={`w-full py-3.5 px-6 rounded-lg text-xs font-semibold transition-all duration-300 uppercase tracking-wider mb-8 ${
                  ctaBlocked
                    ? 'bg-white/5 text-on-surface-variant cursor-not-allowed opacity-60'
                    : `cursor-pointer ${plan.ctaStyle}`
                }`}
                id={`btn-cta-${plan.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {ctaBlocked ? (lang === 'ar' ? 'الاشتراكات متوقفة حاليًا' : 'Currently Unavailable') : plan.ctaText}
              </button>

              {/* Feature Checklist */}
              <div className="flex-grow">
                {plan.subText && (
                  <p className="font-mono text-xs text-on-surface font-semibold uppercase tracking-wider mb-4">
                    {plan.subText}
                  </p>
                )}
                <ul className="space-y-3.5 flex flex-col text-left">
                  {plan.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-xs md:text-sm text-on-surface-variant leading-tight">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.isPopular ? 'text-primary' : 'text-secondary'}`} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust & Enterprise Section */}
      <div className="mt-12 text-center w-full max-w-4xl pt-8 border-t border-white/5">
        {/* NOTE: fabricated "trusted by" company logos (Acme Corp / Globex /
            Initech — fictional placeholder brands) were removed. Do not
            re-add customer logos until real customers can be named with
            their permission. */}
      </div>

    </div>
  );
}
