import React, { useState } from 'react';
import { Save, RefreshCw, Trash2, Edit, Plus, Info, LayoutDashboard, Group, CreditCard, Settings, ToggleLeft, ToggleRight, LogOut, Globe } from 'lucide-react';
import { PageType } from '../types';
import LogoImage from './LogoImage';

interface AdminPricingPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  onLogout?: () => void;
}

export default function AdminPricingPage({ onNavigate, lang: propLang, setLang: propSetLang, onLogout }: AdminPricingPageProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('en');
  const lang = propLang || localLang;
  const setLang = propSetLang || localSetLang;
  const [currency, setCurrency] = useState('USD');
  const [taxRate, setTaxRate] = useState(0);
  const [stripeEnabled, setStripeEnabled] = useState(true);

  // Default plans mock state
  const [freePriceMonthly, setFreePriceMonthly] = useState('0.00');
  const [freePriceYearly, setFreePriceYearly] = useState('0.00');
  const [freeMaxSize, setFreeMaxSize] = useState(10);
  const [freeDailyLimit, setFreeDailyLimit] = useState(5);
  const [freeAds, setFreeAds] = useState(true);
  const [freeApi, setFreeApi] = useState(false);

  const [proPriceMonthly, setProPriceMonthly] = useState('12.99');
  const [proPriceYearly, setProPriceYearly] = useState('120.00');
  const [proMaxSize, setProMaxSize] = useState(100);
  const [proDailyLimit, setProDailyLimit] = useState(100);
  const [proAds, setProAds] = useState(false);
  const [proApi, setProApi] = useState(true);

  const [bizPriceMonthly, setBizPriceMonthly] = useState('49.99');
  const [bizPriceYearly, setBizPriceYearly] = useState('499.00');
  const [bizAds, setBizAds] = useState(false);
  const [bizApi, setBizApi] = useState(true);

  // Coupons
  // Sample coupons (including the old-brand "LUMINA20") were removed: coupons
  // are not implemented on the server, so there are none to list.
  const [coupons, setCoupons] = useState<{ code: string; discount: string }[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDiscount, setNewDiscount] = useState('');
  const [showAddCoupon, setShowAddCoupon] = useState(false);

  const handleSave = () => {
    // NOTE (audit, Aug 2026): this page's plan/price/quota fields are
    // local-only React state — there is no backend endpoint that persists
    // them, and the live app's actual quotas (3/day free) and Stripe price
    // ($9.99/mo, hardcoded in /api/stripe/checkout) are NOT read from here.
    // The button previously showed "All pricing updates have been saved
    // successfully!", falsely implying these edits took effect on the live
    // app. Wiring real persistence + having server.ts read dynamic pricing
    // from it is a genuine new feature (new table, new endpoints, rewiring
    // hardcoded quota checks) that's out of scope for a bug-fix pass — so
    // instead of building that out silently, this alert now says plainly
    // that changes here are local-preview-only, until that feature exists.
    alert(
      lang === 'ar'
        ? 'ملاحظة: هذه الصفحة معاينة محلية فقط حالياً — التعديلات هنا لا تُطبَّق فعلياً على حدود الاستخدام أو أسعار Stripe الحقيقية في التطبيق المباشر. ربط هذه الصفحة بالخادم يتطلب إضافة ميزة جديدة (جدول بيانات + نقاط API) لم تُنفَّذ بعد.'
        : "Note: this page is currently a local preview only — changes here do not actually apply to the live app's real usage quotas or Stripe pricing. Wiring this page to the backend requires a new feature (a data table + API endpoints) that hasn't been built yet."
    );
  };

  const handleAddCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCode && newDiscount) {
      setCoupons([...coupons, { code: newCode.toUpperCase(), discount: newDiscount }]);
      setNewCode('');
      setNewDiscount('');
      setShowAddCoupon(false);
    }
  };

  const handleDeleteCoupon = (codeToDelete: string) => {
    setCoupons(coupons.filter(c => c.code !== codeToDelete));
  };

  const t = {
    en: {
      title: "Pricing & Subscriptions",
      saveChanges: "Save Changes",
      dashboard: "Dashboard",
      files: "Files",
      pricingControl: "Pricing Control",
      userManagement: "User Management",
      systemSettings: "System Settings",
      default: "Default",
      growth: "Growth",
      scalable: "Scalable",
      popular: "Popular",
      monthlyPrice: "Monthly Price (USD)",
      yearlyPrice: "Yearly Price (USD)",
      features: "Feature Checklist",
      maxSize: "Max File Size (MB)",
      dailyLimit: "Daily Usage Limit",
      showAds: "Show Advertisements",
      apiAccess: "API Access",
      unlimited: "Unlimited",
      paymentGateway: "Payment Gateway Settings",
      gatewayDesc: "Manage processors, currency, and discounts",
      defaultCurrency: "Default Currency",
      taxRate: "Tax Rate (%)",
      discountCodes: "Discount Code Manager",
      createCode: "Create New Code",
      code: "Code",
      discount: "Discount",
      addBtn: "Add",
      cancelBtn: "Cancel",
      lastSaved: "Last saved today at 14:32:05",
      discard: "Discard Changes",
      saveAll: "Save All Plan Updates",
      usd: "USD - US Dollar ($)",
      eur: "EUR - Euro (€)",
      gbp: "GBP - British Pound (£)",
      jpy: "JPY - Japanese Yen (¥)",
    },
    ar: {
      title: "التحكم بالأسعار والاشتراكات",
      saveChanges: "حفظ التغييرات",
      dashboard: "لوحة التحكم",
      files: "الملفات والملقمات",
      pricingControl: "التحكم بالأسعار",
      userManagement: "إدارة المستخدمين",
      systemSettings: "إعدادات النظام",
      default: "افتراضي",
      growth: "نمو",
      scalable: "قابل للتوسع",
      popular: "شائع",
      monthlyPrice: "السعر الشهري (USD)",
      yearlyPrice: "السعر السنوي (USD)",
      features: "قائمة الصلاحيات والخصائص",
      maxSize: "الحد الأقصى للملف (MB)",
      dailyLimit: "حد الاستخدام اليومي",
      showAds: "عرض الإعلانات للمستخدم",
      apiAccess: "الوصول لواجهة البرمجية API",
      unlimited: "غير محدود",
      paymentGateway: "إعدادات بوابة الدفع الإلكترونية",
      gatewayDesc: "إدارة بوابات الدفع، العملة الافتراضية، والضرائب والأكواد ترويجية",
      defaultCurrency: "العملة الافتراضية للفوترة",
      taxRate: "نسبة الضريبة الناتجة (%)",
      discountCodes: "أكواد الخصم والقسائم",
      createCode: "إنشاء كود خصم جديد",
      code: "كود الخصم",
      discount: "قيمة الخصم والوصف",
      addBtn: "إضافة الكود",
      cancelBtn: "إلغاء",
      lastSaved: "آخر حفظ تلقائي تم اليوم الساعة 14:32:05",
      discard: "تجاهل التعديلات",
      saveAll: "حفظ جميع تعديلات الخطط والأسعار",
      usd: "دولار أمريكي - USD ($)",
      eur: "يورو - EUR (€)",
      gbp: "جنيه إسترليني - GBP (£)",
      jpy: "ين ياباني - JPY (¥)",
    }
  };

  const isRTL = lang === 'ar';

  return (
    <div className="flex min-h-screen bg-surface-dim text-on-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Sidebar navigation */}
      <aside className="w-64 border-r border-white/10 hidden md:flex flex-col bg-surface-container-low shrink-0 h-screen sticky top-0">
        <div className="p-6 flex flex-col gap-1.5">
          <div className="flex items-center">
            <LogoImage className="h-10 w-auto" alt="EasyPDF Logo" />
          </div>
          <span className="text-[9px] font-mono text-on-surface-variant tracking-wider uppercase font-extrabold">ADMIN CONTROL</span>
        </div>

        <nav className="flex-grow mt-4 flex flex-col gap-1 px-3">
          <button
            onClick={() => onNavigate('admin-dashboard')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>{t[lang].dashboard}</span>
          </button>
          
          <button
            onClick={() => onNavigate('admin-editor')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Edit className="w-4 h-4" />
            <span>{lang === 'ar' ? 'محرر المحتوى' : 'Content Editor'}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-users')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Group className="w-4 h-4" />
            <span>{t[lang].userManagement}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-pricing')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold transition-all cursor-pointer text-xs text-left"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t[lang].pricingControl}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-settings')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Settings className="w-4 h-4" />
            <span>{lang === 'ar' ? 'الإعدادات العامة' : 'Global Settings'}</span>
          </button>

          <div className="px-4 pt-6 pb-2">
            <span className="text-[9px] font-mono text-on-surface-variant/40 tracking-wider uppercase font-bold">{lang === 'ar' ? 'النظام والبيئة' : 'System'}</span>
          </div>

          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Globe className="w-4 h-4 text-secondary" />
            <span>{lang === 'ar' ? 'بوابة التطبيق' : 'App Portal'}</span>
          </button>
        </nav>

        <div className="p-6 border-t border-white/5 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-extrabold text-xs">
              AD
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface">Admin User</p>
              <p className="text-xs text-on-surface-variant">Master Admin</p>
            </div>
          </div>
          <button 
            onClick={() => onLogout ? onLogout() : onNavigate('home')}
            className="text-on-surface-variant hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            title={lang === 'ar' ? 'تسجيل الخروج' : 'Log out'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="flex-grow flex flex-col pb-32 relative min-w-0">
        
        {/* Top bar inside admin panel */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-white/5 px-6 md:px-8 py-4 flex justify-between items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-display font-bold text-on-surface">{t[lang].title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono font-bold hover:bg-white/10 cursor-pointer transition-all shrink-0"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button
              onClick={handleSave}
              className="bg-primary text-on-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-[1.02] transition-transform cursor-pointer shadow-[0_4px_15px_rgba(160,120,255,0.3)] shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t[lang].saveChanges}</span>
            </button>
          </div>
        </header>

        {/* Honest status banner: nothing on this page is connected to the
            live app. Its default numbers do not match the real plans. */}
        <div role="status" className="mx-6 md:mx-8 mt-6 max-w-6xl self-center w-[calc(100%-3rem)] md:w-[calc(100%-4rem)] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 leading-relaxed">
          {lang === 'ar'
            ? 'معاينة فقط: هذه الصفحة غير مرتبطة بالتطبيق الفعلي. الأرقام الظاهرة هنا أمثلة ولا تطابق خططك وأسعارك الحقيقية، ولا يتم حفظ أي تعديل ولا تأثير له على الأسعار أو الحدود.'
            : 'Preview only: this page is not connected to the live app. The numbers shown are examples that do not match your real plans and prices, and nothing you change here is saved or affects live prices or limits.'}
        </div>

        {/* Outer content container */}
        <div className="px-6 md:px-8 py-8 flex flex-col gap-8 max-w-6xl w-full mx-auto">
          
          {/* Plans section */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Free Plan card */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <span className="bg-white/5 text-on-surface-variant px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                    {t[lang].default}
                  </span>
                  <h3 className="text-lg font-display font-bold text-on-surface mt-2">Free Plan</h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 text-on-surface-variant">
                  📄
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].monthlyPrice}</label>
                  <input
                    type="text"
                    value={freePriceMonthly}
                    onChange={(e) => setFreePriceMonthly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].yearlyPrice}</label>
                  <input
                    type="text"
                    value={freePriceYearly}
                    onChange={(e) => setFreePriceYearly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6 flex-grow">
                <span className="text-[10px] font-mono text-primary uppercase tracking-wider font-extrabold block">{t[lang].features}</span>
                
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].maxSize}</span>
                  <input
                    type="number"
                    value={freeMaxSize}
                    onChange={(e) => setFreeMaxSize(parseInt(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-center text-xs text-on-surface"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].dailyLimit}</span>
                  <input
                    type="number"
                    value={freeDailyLimit}
                    onChange={(e) => setFreeDailyLimit(parseInt(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-center text-xs text-on-surface"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].showAds}</span>
                  <button
                    onClick={() => setFreeAds(!freeAds)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {freeAds ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].apiAccess}</span>
                  <button
                    onClick={() => setFreeApi(!freeApi)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {freeApi ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Pro Plan card */}
            <div className="content-card-elevated rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden border-primary/30 shadow-2xl">
              <div className="absolute top-0 right-0 left-0 bg-primary h-[3px]"></div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border border-primary/20">
                    {t[lang].growth}
                  </span>
                  <h3 className="text-lg font-display font-bold text-on-surface mt-2">Pro Plan</h3>
                </div>
                <div className="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center text-sm border border-primary/20 font-bold">
                  ⚡
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].monthlyPrice}</label>
                  <input
                    type="text"
                    value={proPriceMonthly}
                    onChange={(e) => setProPriceMonthly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].yearlyPrice}</label>
                  <input
                    type="text"
                    value={proPriceYearly}
                    onChange={(e) => setProPriceYearly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6 flex-grow">
                <span className="text-[10px] font-mono text-primary uppercase tracking-wider font-extrabold block">{t[lang].features}</span>
                
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].maxSize}</span>
                  <input
                    type="number"
                    value={proMaxSize}
                    onChange={(e) => setProMaxSize(parseInt(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-center text-xs text-on-surface"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].dailyLimit}</span>
                  <input
                    type="number"
                    value={proDailyLimit}
                    onChange={(e) => setProDailyLimit(parseInt(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-center text-xs text-on-surface"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].showAds}</span>
                  <button
                    onClick={() => setProAds(!proAds)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {proAds ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].apiAccess}</span>
                  <button
                    onClick={() => setProApi(!proApi)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {proApi ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Business Plan card */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <span className="bg-white/5 text-on-surface-variant px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                    {t[lang].scalable}
                  </span>
                  <h3 className="text-lg font-display font-bold text-on-surface mt-2">Business Plan</h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 text-on-surface-variant">
                  🏢
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].monthlyPrice}</label>
                  <input
                    type="text"
                    value={bizPriceMonthly}
                    onChange={(e) => setBizPriceMonthly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].yearlyPrice}</label>
                  <input
                    type="text"
                    value={bizPriceYearly}
                    onChange={(e) => setBizPriceYearly(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6 flex-grow">
                <span className="text-xs font-mono text-primary uppercase tracking-wider font-extrabold block">{t[lang].features}</span>
                
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].maxSize}</span>
                  <span className="text-xs font-mono font-bold text-primary">{t[lang].unlimited}</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-on-surface-variant">{t[lang].dailyLimit}</span>
                  <span className="text-xs font-mono font-bold text-primary">{t[lang].unlimited}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].showAds}</span>
                  <button
                    onClick={() => setBizAds(!bizAds)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {bizAds ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-on-surface-variant">{t[lang].apiAccess}</span>
                  <button
                    onClick={() => setBizApi(!bizApi)}
                    className="text-primary hover:text-primary-container cursor-pointer"
                  >
                    {bizApi ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                  </button>
                </div>
              </div>
            </div>

          </section>

          {/* Payment gateway settings */}
          <section className="content-card rounded-2xl p-6 md:p-8 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-6">
              <div>
                <h2 className="text-lg font-display font-bold text-on-surface">{t[lang].paymentGateway}</h2>
                <p className="text-xs text-on-surface-variant mt-1">{t[lang].gatewayDesc}</p>
              </div>

              <div className="flex items-center gap-3 bg-white/2 px-4 py-2 rounded-xl border border-white/5 shrink-0 self-start">
                <span className="text-xs font-semibold text-on-surface">Stripe Gateway</span>
                <button
                  type="button"
                  onClick={() => setStripeEnabled(!stripeEnabled)}
                  className="cursor-pointer"
                >
                  {stripeEnabled ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-on-surface-variant" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface">{t[lang].defaultCurrency}</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-on-surface outline-none cursor-pointer"
                  >
                    <option value="USD">{t[lang].usd}</option>
                    <option value="EUR">{t[lang].eur}</option>
                    <option value="GBP">{t[lang].gbp}</option>
                    <option value="JPY">{t[lang].jpy}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-on-surface">{t[lang].taxRate}</label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-on-surface outline-none"
                  />
                </div>
              </div>

              {/* Discount Code manager */}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-on-surface">{t[lang].discountCodes}</label>
                  {!showAddCoupon && (
                    <button
                      onClick={() => setShowAddCoupon(true)}
                      className="text-xs text-primary font-bold flex items-center gap-1 hover:text-primary-container cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t[lang].createCode}
                    </button>
                  )}
                </div>

                {showAddCoupon && (
                  <form onSubmit={handleAddCoupon} className="p-4 bg-white/2 rounded-xl border border-white/5 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-on-surface-variant font-mono uppercase font-bold">{t[lang].code}</label>
                        <input
                          type="text"
                          required
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value)}
                          placeholder="e.g. FIFTY"
                          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-on-surface-variant font-mono uppercase font-bold">{t[lang].discount}</label>
                        <input
                          type="text"
                          required
                          value={newDiscount}
                          onChange={(e) => setNewDiscount(e.target.value)}
                          placeholder="e.g. 50% Off"
                          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddCoupon(false)}
                        className="px-2.5 py-1 text-xs rounded hover:bg-white/5 font-semibold text-on-surface-variant cursor-pointer"
                      >
                        {t[lang].cancelBtn}
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 text-xs rounded bg-primary text-on-primary font-bold hover:scale-102 cursor-pointer transition-transform"
                      >
                        {t[lang].addBtn}
                      </button>
                    </div>
                  </form>
                )}

                <div className="bg-white/2 rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                  {coupons.map((coupon) => (
                    <div key={coupon.code} className="p-3.5 flex justify-between items-center hover:bg-white/5 transition-colors gap-4">
                      <div>
                        <span className="font-bold text-primary text-xs font-mono">{coupon.code}</span>
                        <span className="text-xs text-on-surface-variant ml-2 font-medium">{coupon.discount}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteCoupon(coupon.code)}
                          className="p-1 text-on-surface-variant hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </section>

        </div>

        {/* Fixed Save Footer */}
        <footer className="fixed bottom-0 left-0 right-0 md:left-64 bg-surface-container-low/80 backdrop-blur-md border-t border-white/10 px-6 md:px-8 py-4 z-30 flex justify-between items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-on-surface-variant text-xs">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span>{t[lang].lastSaved}</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => onNavigate('home')}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer"
            >
              {t[lang].discard}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:scale-[1.02] cursor-pointer transition-transform shadow-lg shadow-primary/20"
            >
              {t[lang].saveAll}
            </button>
          </div>
        </footer>

      </main>
    </div>
  );
}
