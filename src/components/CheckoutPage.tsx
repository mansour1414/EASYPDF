import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, ShieldCheck, CreditCard, Wallet, Smartphone, Globe, PauseCircle } from 'lucide-react';
import { PageType } from '../types';
import { authenticatedFetch } from '../lib/supabaseClient';

interface CheckoutPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  currentUser: { id: string; email: string; plan: 'free' | 'pro' } | null;
}

export default function CheckoutPage({ onNavigate, lang: propLang, currentUser }: CheckoutPageProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('ar');
  const lang = propLang || localLang;
  const setLang = localSetLang;
  
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'mada' | 'applepay' | 'paypal'>('card');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [cardholder, setCardholder] = useState('');
  const [country, setCountry] = useState('SA');
  const [loading, setLoading] = useState(false);

  // SECURITY/TRUST fix: the "Bank Transfer" option previously displayed a
  // fabricated IBAN ("SA 80 8000 0000 1234 5678 9012" / Al Rajhi Bank) that
  // does not correspond to any verified EasyPDF business account. Displaying
  // fake banking details in a production checkout risks real customers
  // wiring money to an account nobody owns. Until a real, verified business
  // IBAN is configured, bank transfer is removed from the checkout entirely
  // instead of being shown with placeholder account data.

  const [visibleMethods, setVisibleMethods] = useState({
    card: true,
    applepay: true,
    googlepay: true,
    paypal: true,
    bank: true
  });

  // Centralized subscription ON/OFF switch (Admin Dashboard → Settings).
  // FAIL-CLOSED default (false): someone landing here directly (e.g. a
  // stale tab or bookmark) sees the disabled state until confirmed
  // otherwise, rather than briefly being able to submit the form. The real
  // enforcement is server-side in /api/stripe/checkout — this only avoids
  // showing a working-looking form for a purchase that will be rejected.
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch('/api/subscription-status')
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setSubscriptionsEnabled(data?.enabled === true);
      })
      .catch(err => console.error('Error fetching subscription status:', err));
    return () => { cancelled = true; };
  }, []);

  // Sync email when user logs in/changes
  useEffect(() => {
    if (currentUser?.email) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  // Load configured payment methods (public config, no admin rights needed)
  useEffect(() => {
    authenticatedFetch('/api/payment-methods')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setVisibleMethods(data);
          // Set first visible method as default
          if (!data.card) {
            if (data.applepay) setPaymentMethod('applepay');
            else if (data.paypal) setPaymentMethod('paypal');
          }
        }
      })
      .catch(err => console.error('Error fetching visible payment methods:', err));
  }, []);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      alert(lang === 'ar' ? 'يرجى تسجيل الدخول أولاً لإتمام الدفع.' : 'Please sign in first to complete payment.');
      return;
    }

    // UI-level guard mirroring the server-side check in /api/stripe/checkout.
    // The submit button below is already disabled in this state, but this
    // covers a submit triggered another way (e.g. pressing Enter).
    if (!subscriptionsEnabled) {
      alert(lang === 'ar' ? 'الاشتراكات متوقفة حاليًا.' : 'Subscriptions are currently unavailable.');
      return;
    }

    // NOTE (audit, Aug 2026): the backend's /api/stripe/checkout only ever
    // creates a card-only Stripe Checkout Session
    // (payment_method_types: ['card']) — there is no PayPal or bank-transfer
    // integration on the backend at all. Card/Mada is the one method that is
    // actually wired to a real, working checkout. Bank transfer was fully
    // removed (fake IBAN — see the note above the state declarations); PayPal /
    // Apple Pay are surfaced as not yet available instead of silently
    // substituting an unrelated flow.
    if (paymentMethod === 'paypal' || paymentMethod === 'applepay') {
      alert(
        lang === 'ar'
          ? 'هذه الطريقة غير متاحة بعد في هذا الإصدار. يرجى استخدام الدفع بالبطاقة لإتمام العملية الآن.'
          : "This payment method isn't available yet in this build. Please use Card to complete your purchase for now."
      );
      return;
    }

    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Checkout initialization failed');
      }

      if (data.url) {
        // Redirect user to Stripe session URL (or mock success handler)
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      alert(err.message || 'Error connecting to Stripe payments pipeline');
      setLoading(false);
    }
  };

  const t = {
    en: {
      back: "Back to Pricing",
      checkout: "Checkout",
      selectedPlan: "Selected Plan",
      proPlan: "Pro Plan",
      proDesc: "Unlimited cloud uploads and AI actions, plus all PDF tools.",
      price: "$9.99",
      period: "/month",
      feat1: "Unlimited cloud uploads",
      feat2: "Unlimited AI actions",
      feat3: "All PDF tools included",
      // NOTE (audit, Aug 2026): this used to hardcode "$12" here, while the
      // real Stripe charge (unit_amount: 999 in /api/stripe/checkout on the
      // server) is $9.99/mo — the same real price already shown correctly
      // on PricingPage.tsx, TermsPage.tsx, and RefundPage.tsx. A user
      // selecting Pro would see $12 on this exact checkout screen, then be
      // charged $9.99 by Stripe — a real, user-facing mismatch on the one
      // page where it matters most. Now matches the actual charge.
      secureBadge: "Your payments are secure and encrypted",
      chooseMethod: "Choose Payment Method",
      creditCard: "Credit Card",
      mada: "Mada",
      applePay: "Apple Pay",
      bankTransfer: "Bank Transfer",
      paypal: "PayPal",
      email: "Email Address",
      country: "Country",
      cardholder: "Cardholder Name",
      cardholderPlace: "Name as it appears on card",
      cardNumber: "Card Number",
      expiry: "Expiration Date",
      cvv: "CVV",
      bankDetails: "Bank Transfer Details",
      bankName: "Bank Name",
      bankNameVal: "Al Rajhi Bank",
      accountName: "Account Name",
      accountNameVal: "Easy PDF Company",
      iban: "IBAN",
      copyBtn: "Copy IBAN",
      copied: "Copied!",
      payBtn: "Pay Now",
      countries: {
        SA: "Saudi Arabia",
        AE: "United Arab Emirates",
        EG: "Egypt",
        KW: "Kuwait"
      }
    },
    ar: {
      back: "العودة للأسعار",
      checkout: "الدفع",
      selectedPlan: "الخطة المختارة",
      proPlan: "خطة برو (Pro Plan)",
      proDesc: "رفع سحابي وعمليات ذكاء اصطناعي غير محدودة، مع جميع أدوات PDF.",
      price: "$9.99",
      period: "/شهرياً",
      feat1: "رفع سحابي غير محدود",
      feat2: "عمليات ذكاء اصطناعي غير محدودة",
      feat3: "جميع أدوات PDF مشمولة",
      secureBadge: "مدفوعاتك آمنة ومشفره",
      chooseMethod: "اختر وسيلة الدفع",
      creditCard: "بطاقة ائتمان",
      mada: "مدى",
      applePay: "Apple Pay",
      bankTransfer: "تحويل بنكي",
      paypal: "PayPal",
      email: "البريد الإلكتروني",
      country: "الدولة",
      cardholder: "اسم صاحب البطاقة",
      cardholderPlace: "الاسم كما يظهر على البطاقة",
      cardNumber: "رقم البطاقة",
      expiry: "تاريخ الانتهاء",
      cvv: "رمز التحقق (CVV)",
      bankDetails: "بيانات التحويل البنكي",
      bankName: "اسم البنك",
      bankNameVal: "مصرف الراجحي",
      accountName: "اسم الحساب",
      accountNameVal: "شركة إيزي بي دي إف",
      iban: "الايبان (IBAN)",
      copyBtn: "نسخ الايبان",
      copied: "تم النسخ!",
      payBtn: "ادفع الآن",
      countries: {
        SA: "المملكة العربية السعودية",
        AE: "الإمارات العربية المتحدة",
        EG: "جمهورية مصر العربية",
        KW: "الكويت"
      }
    }
  };

  const isRTL = lang === 'ar';

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Lang Switcher bar */}
      <div className="flex justify-end items-center gap-2 mb-2">
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono font-bold hover:bg-white/10 cursor-pointer transition-all"
        >
          <Globe className="w-3.5 h-3.5 text-primary" />
          {lang === 'ar' ? 'English Interface' : 'الواجهة العربية'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left/Right Order Summary */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('pricing')}
              className="text-primary hover:text-primary-container transition-colors flex items-center gap-1.5 text-sm font-semibold cursor-pointer"
            >
              {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              {t[lang].back}
            </button>
          </div>

          <h1 className="text-3xl font-display font-extrabold text-on-surface">
            {t[lang].checkout}
          </h1>

          {/* Subscriptions-disabled notice — centralized Admin Dashboard switch */}
          {!subscriptionsEnabled && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
              <PauseCircle className="w-4 h-4 shrink-0" />
              <span>{lang === 'ar' ? 'الاشتراكات متوقفة حاليًا' : 'Subscriptions are temporarily unavailable'}</span>
            </div>
          )}

          {/* Plan Card */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group border-primary/20">
            <div className="absolute top-0 right-0 left-0 h-[3px] bg-primary"></div>
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-primary font-mono text-xs uppercase tracking-widest font-bold">
                  {t[lang].selectedPlan}
                </span>
                <h2 className="text-xl font-display font-bold text-on-surface mt-1">
                  {t[lang].proPlan}
                </h2>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                  {t[lang].proDesc}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-4xl font-display font-extrabold text-on-surface">{t[lang].price}</span>
                <span className="text-xs text-on-surface-variant block mt-0.5">{t[lang].period}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
              <div className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span>{t[lang].feat1}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span>{t[lang].feat2}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span>{t[lang].feat3}</span>
              </div>
            </div>
          </div>

          {/* Secure badge */}
          <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-primary/5 border border-primary/10">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-on-surface">{t[lang].secureBadge}</span>
          </div>
        </div>

        {/* Right/Left Checkout Form */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 md:p-8 border-white/10 shadow-2xl">
          <div className="flex flex-col gap-6">
            
            {/* Payment Tabs */}
            <div>
              <label className="text-xs font-bold font-mono text-on-surface-variant uppercase tracking-wider mb-3 block">
                {t[lang].chooseMethod}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { id: 'card', label: t[lang].creditCard, icon: <CreditCard className="w-4 h-4" />, visible: visibleMethods.card },
                  { id: 'mada', label: t[lang].mada, icon: <Wallet className="w-4 h-4" />, visible: visibleMethods.card },
                  { id: 'applepay', label: t[lang].applePay, icon: <Smartphone className="w-4 h-4" />, visible: visibleMethods.applepay || visibleMethods.googlepay },
                  // NOTE: "Bank Transfer" intentionally removed — no verified
                  // business bank account exists in project configuration, and
                  // the previously shown IBAN was fabricated. Do not re-add a
                  // bank option without wiring it to real, verified details.
                  { id: 'paypal', label: t[lang].paypal, icon: <Wallet className="w-4 h-4" />, visible: visibleMethods.paypal },
                ].filter(m => m.visible !== false).map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center gap-1.5 cursor-pointer ${
                      paymentMethod === method.id
                        ? 'border-primary bg-primary/10 text-on-surface font-semibold'
                        : 'border-white/5 bg-white/2 text-on-surface-variant hover:border-white/10 hover:text-on-surface'
                    }`}
                  >
                    {method.icon}
                    <span className="text-xs tracking-wide">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Form Fields */}
            <form onSubmit={handlePay} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-on-surface">{t[lang].email}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-white/5 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 outline-none text-xs text-on-surface"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-on-surface">{t[lang].country}</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-primary rounded-xl px-4 py-3 outline-none text-xs text-on-surface cursor-pointer"
                  >
                    <option value="SA">{t[lang].countries.SA}</option>
                    <option value="AE">{t[lang].countries.AE}</option>
                    <option value="EG">{t[lang].countries.EG}</option>
                    <option value="KW">{t[lang].countries.KW}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-on-surface">{t[lang].cardholder}</label>
                  <input
                    type="text"
                    required={paymentMethod === 'card' || paymentMethod === 'mada'}
                    value={cardholder}
                    onChange={(e) => setCardholder(e.target.value)}
                    placeholder={t[lang].cardholderPlace}
                    className="w-full bg-white/5 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3 outline-none text-xs text-on-surface"
                  />
                </div>
              </div>

              {(paymentMethod === 'card' || paymentMethod === 'mada') && (
                <div className="mt-2 p-4 rounded-xl bg-white/2 border border-white/5 flex items-start gap-3">
                  <CreditCard className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {lang === 'ar'
                      ? 'سيتم تحويلك إلى صفحة الدفع الآمنة من Stripe لإدخال بيانات بطاقتك. لا تقوم منصتنا بتخزين أو معالجة أرقام البطاقات مباشرة.'
                      : "You'll be redirected to Stripe's secure checkout page to enter your card details. We never store or process raw card numbers ourselves."}
                  </p>
                </div>
              )}

              {paymentMethod === 'applepay' && (
                <div className="p-6 rounded-xl bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 mt-2">
                  <Smartphone className="w-8 h-8 text-on-surface" />
                  <p className="text-xs text-on-surface-variant text-center">
                    {lang === 'ar'
                      ? 'Apple Pay غير متاح بعد في هذا الإصدار — يرجى استخدام الدفع بالبطاقة حالياً.'
                      : "Apple Pay isn't available yet in this build — please use Card for now."}
                  </p>
                </div>
              )}

              {paymentMethod === 'paypal' && (
                <div className="p-6 rounded-xl bg-white/2 border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 mt-2">
                  <Wallet className="w-8 h-8 text-primary" />
                  <p className="text-xs text-on-surface-variant text-center">
                    {lang === 'ar'
                      ? 'الدفع عبر PayPal غير متاح بعد في هذا الإصدار — يرجى استخدام الدفع بالبطاقة حالياً.'
                      : "PayPal isn't available yet in this build — please use Card for now."}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={!subscriptionsEnabled || loading}
                className={`w-full py-4 rounded-xl font-display font-bold text-sm tracking-wider uppercase shadow-[0_4px_25px_rgba(79,70,229,0.3)] mt-4 ${
                  !subscriptionsEnabled || loading
                    ? 'bg-white/5 text-on-surface-variant cursor-not-allowed opacity-60 shadow-none'
                    : 'btn-primary hover:shadow-[0_4px_30px_rgba(99,102,241,0.5)] cursor-pointer'
                }`}
              >
                {!subscriptionsEnabled
                  ? (lang === 'ar' ? 'الاشتراكات متوقفة حاليًا' : 'Currently Unavailable')
                  : t[lang].payBtn}
              </button>

            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
