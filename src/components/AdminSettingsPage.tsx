import React, { useState } from 'react';
import { authenticatedFetch } from '../lib/supabaseClient';
import LogoImage from './LogoImage';
import { 
  LayoutDashboard, 
  Group, 
  CreditCard, 
  Settings, 
  Edit, 
  ShieldAlert, 
  Globe, 
  Trash2, 
  Plus, 
  Save, 
  LogOut,
  Sliders,
  Shield,
  FileText,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { PageType } from '../types';

interface AdminSettingsPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  onLogout?: () => void;
}

export default function AdminSettingsPage({ onNavigate, lang: propLang, setLang: propSetLang, onLogout }: AdminSettingsPageProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('en');
  const lang = propLang || localLang;
  const setLang = propSetLang || localSetLang;
  const [siteName, setSiteName] = useState('Easy PDF Online');
  const [logoUrl, setLogoUrl] = useState('/assets/logo.png');
  const [faviconUrl, setFaviconUrl] = useState('/assets/logo.png');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  
  const [deleteTimer, setDeleteTimer] = useState(30);
  const [maxUploadSize, setMaxUploadSize] = useState(256);
  const [concurrentOps, setConcurrentOps] = useState(5);
  const [ipBlockedList, setIpBlockedList] = useState('192.168.1.1, 10.0.0.1, 172.16.0.45');

  const [paymentMethods, setPaymentMethods] = useState<Record<string, boolean>>({
    card: true,
    applepay: true,
    googlepay: true,
    paypal: true,
    bank: true
  });

  React.useEffect(() => {
    authenticatedFetch('/api/admin/payment-methods')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setPaymentMethods(data);
        }
      })
      .catch(err => console.error('Error fetching admin payment methods:', err));
  }, []);

  const handleTogglePaymentMethod = async (key: string) => {
    const updated = { ...paymentMethods, [key]: !paymentMethods[key] };
    setPaymentMethods(updated);
    try {
      await authenticatedFetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error('Error updating payment methods:', err);
    }
  };

  // ---------------------------------------------------------------------
  // Subscription master ON/OFF switch — the single centralized control
  // requested by the project owner. Real, persisted via Supabase
  // app_settings on the backend (see /api/admin/subscription-status in
  // server.ts) — unlike most of the rest of this page's fields, this is
  // not local-preview-only state.
  // ---------------------------------------------------------------------
  // Safe default while loading: false (disabled), matching the backend's
  // own fail-closed default. Immediately corrected by the GET below once
  // the real persisted value is known.
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);

  React.useEffect(() => {
    authenticatedFetch('/api/admin/subscription-status')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enabled === 'boolean') {
          setSubscriptionEnabled(data.enabled);
        }
      })
      .catch(err => console.error('Error fetching subscription status:', err));
  }, []);

  const handleToggleSubscription = async () => {
    const previous = subscriptionEnabled;
    const next = !previous;
    setSubscriptionEnabled(next); // optimistic UI update
    setSubscriptionSaving(true);
    try {
      const res = await authenticatedFetch('/api/admin/subscription-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update subscription status');
      }
      setSubscriptionEnabled(data.enabled === true);
    } catch (err) {
      console.error('Error updating subscription status:', err);
      // Revert — never leave the UI claiming a change that didn't persist.
      setSubscriptionEnabled(previous);
      alert(
        lang === 'ar'
          ? 'تعذر تحديث حالة الاشتراكات. لم يتم حفظ أي تغيير — حاول مرة أخرى.'
          : 'Failed to update subscription status. No change was saved — please try again.'
      );
    } finally {
      setSubscriptionSaving(false);
    }
  };

  // NOTE: this list starts EMPTY on purpose. It previously shipped with
  // fabricated operator names/emails ("Alex Rivera", "jordan@lumina.pdf",
  // ...) that looked like real staff accounts. Operator management is
  // local-only preview state (see the warning banner in the UI) — showing
  // invented people here created a false impression of who has admin access.
  const [admins, setAdmins] = useState<Array<{ name: string; email: string; role: string }>>([]);

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const t = {
    en: {
      dashboard: "Overview",
      fileManager: "File Manager",
      settings: "Global Settings",
      analytics: "Analytics",
      securityLogs: "Security Logs",
      overviewTitle: "Global Settings",
      overviewDesc: "Configure general site configurations, safety constraints, and admin users",
      save: "Save Changes",
      siteName: "Site Name",
      logo: "Platform Logo Path",
      favicon: "Favicon Path",
      maintenance: "Maintenance Mode",
      maintenanceDesc: "Lock public access to the workspace with a maintenance screen",
      deleteTimer: "File Auto-delete Timer (minutes)",
      maxUpload: "Max Upload Size (MB)",
      concurrent: "Concurrent Operations Limit",
      ipBlock: "IP Blocking List (comma-separated)",
      adminsList: "Admins & Operators",
      addAdmin: "Add New Admin",
      adminName: "Admin Name",
      adminEmail: "Admin Email",
      adminRole: "Role / Permission Level",
      backToPortal: "App Portal",
      navSystem: "System",
      adminConsole: "ADMIN CONSOLE",
      contentEditor: "Content Editor",
      userManagement: "User Management",
      pricingControl: "Pricing Control",
      logout: "Log out"
    },
    ar: {
      dashboard: "نظرة عامة",
      fileManager: "مدير الملفات",
      settings: "الإعدادات العامة",
      analytics: "التحليلات والمؤشرات",
      securityLogs: "سجلات الأمان",
      overviewTitle: "الإعدادات العامة للنظام",
      overviewDesc: "تعديل إعدادات الموقع، شروط الأمان والحماية، وحسابات المسؤولين",
      save: "حفظ الإعدادات والتعديلات",
      siteName: "اسم الموقع",
      logo: "مسار شعار المنصة",
      favicon: "مسار الفايكون (Favicon)",
      maintenance: "وضع الصيانة",
      maintenanceDesc: "حظر وصول المستخدمين لبيئة العمل مؤقتاً وعرض صفحة التحديثات",
      deleteTimer: "مؤقت الحذف التلقائي للملفات (بالدقائق)",
      maxUpload: "الحد الأقصى لحجم الملفات (ميجابايت)",
      concurrent: "أقصى عمليات متزامنة لكل جهاز",
      ipBlock: "قائمة العناوين المحظورة (تفصل بفواصل)",
      adminsList: "المسؤولون والمشرفون على المنصة",
      addAdmin: "إضافة مسؤول جديد",
      adminName: "الاسم الكامل",
      adminEmail: "البريد الإلكتروني",
      adminRole: "الصلاحية / مستوى الوصول",
      backToPortal: "بوابة التطبيق",
      navSystem: "النظام والبيئة",
      adminConsole: "لوحة التحكم والإدارة",
      contentEditor: "محرر المحتوى",
      userManagement: "إدارة المستخدمين",
      pricingControl: "التحكم بالأسعار",
      logout: "تسجيل الخروج"
    }
  };

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail) return;
    setAdmins([...admins, { name: newAdminName, email: newAdminEmail, role: 'Operator' }]);
    setNewAdminName('');
    setNewAdminEmail('');
  };

  const handleRemoveAdmin = (email: string) => {
    setAdmins(admins.filter(admin => admin.email !== email));
  };

  const isRTL = lang === 'ar';

  return (
    <div className="flex min-h-screen bg-surface-dim text-on-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/10 hidden md:flex flex-col bg-surface-container-low shrink-0 h-screen sticky top-0">
        <div className="p-6 flex flex-col gap-1.5">
          <div className="flex items-center">
            <LogoImage className="h-10 w-auto" alt="EasyPDF Logo" />
          </div>
          <span className="text-[9px] font-mono text-on-surface-variant tracking-wider uppercase font-extrabold">{t[lang].adminConsole}</span>
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
            <span>{t[lang].contentEditor}</span>
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t[lang].pricingControl}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-settings')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold transition-all cursor-pointer text-xs text-left"
          >
            <Settings className="w-4 h-4" />
            <span>{t[lang].settings}</span>
          </button>

          <div className="px-4 pt-6 pb-2">
            <span className="text-[9px] font-mono text-on-surface-variant/40 tracking-wider uppercase font-bold">{t[lang].navSystem}</span>
          </div>

          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Globe className="w-4 h-4 text-secondary" />
            <span>{t[lang].backToPortal}</span>
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
            title={t[lang].logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-grow flex flex-col pb-16 min-w-0">
        
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-white/5 px-6 md:px-8 py-5 flex justify-between items-center gap-4">
          <div className="flex flex-col text-left">
            <h1 className="text-xl md:text-2xl font-display font-bold text-on-surface">{t[lang].overviewTitle}</h1>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-xl">{t[lang].overviewDesc}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono font-bold hover:bg-white/10 cursor-pointer transition-all"
            >
              <Globe className="w-3.5 h-3.5 text-primary" />
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button
              onClick={() => alert(
                lang === 'ar'
                  ? 'ملاحظة: هذه الصفحة معاينة محلية فقط حالياً — التغييرات هنا (اسم الموقع، وضع الصيانة، حدود الرفع، قائمة الحظر، إلخ) لا تُطبَّق فعلياً على الخادم المباشر. ربط هذه الصفحة يتطلب إضافة ميزة جديدة (جدول إعدادات + نقاط API) لم تُنفَّذ بعد.'
                  : "Note: this page is currently a local preview only — changes here (site name, maintenance mode, upload limits, IP block list, etc.) don't actually apply to the live server. Wiring this up requires a new feature (a settings table + API endpoints) that hasn't been built yet."
              )}
              className="bg-primary text-on-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-[1.02] transition-transform cursor-pointer shadow-lg shadow-primary/20"
            >
              <Save className="w-4 h-4" />
              <span>{t[lang].save}</span>
            </button>
          </div>
        </header>

        {/* Settings Area */}
        <div className="px-6 md:px-8 py-8 flex flex-col lg:grid lg:grid-cols-12 gap-8 max-w-6xl w-full mx-auto">
          
          {/* Left Columns - Form Inputs */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* General Settings */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <Sliders className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-display font-bold text-on-surface uppercase tracking-wider">General Settings</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].siteName}</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].logo}</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].favicon}</label>
                  <input
                    type="text"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary transition-colors font-mono"
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-xl">
                  <div className="text-left">
                    <p className="text-xs font-bold text-on-surface">{t[lang].maintenance}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 leading-tight">{t[lang].maintenanceDesc}</p>
                  </div>
                  <button
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none cursor-pointer ${
                      maintenanceMode ? 'bg-primary' : 'bg-white/10'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                      isRTL 
                        ? (maintenanceMode ? 'left-1' : 'left-6') 
                        : (maintenanceMode ? 'right-1' : 'right-6')
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Security and Storage Configuration */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <Shield className="w-4 h-4 text-secondary" />
                <h3 className="text-sm font-display font-bold text-on-surface uppercase tracking-wider">Security & Storage Parameters</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].deleteTimer}</label>
                  <input
                    type="number"
                    value={deleteTimer}
                    onChange={(e) => setDeleteTimer(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].maxUpload}</label>
                  <input
                    type="number"
                    value={maxUploadSize}
                    onChange={(e) => setMaxUploadSize(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-xs font-semibold text-on-surface-variant">{t[lang].concurrent}</label>
                  <input
                    type="number"
                    value={concurrentOps}
                    onChange={(e) => setConcurrentOps(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-xs font-semibold text-on-surface-variant">{t[lang].ipBlock}</label>
                <textarea
                  value={ipBlockedList}
                  onChange={(e) => setIpBlockedList(e.target.value)}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-on-surface focus:outline-none focus:border-primary font-mono leading-relaxed resize-none"
                />
              </div>
            </div>

            {/* Subscription Master Switch — centralized ON/OFF control */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <CreditCard className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-display font-bold text-on-surface uppercase tracking-wider">
                  {lang === 'ar' ? 'حالة الاشتراكات' : 'Subscription Status'}
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="text-left">
                  <p className="text-xs font-bold text-on-surface">
                    {lang === 'ar' ? 'اشتراكات الموقع' : 'Site Subscriptions'}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-md">
                    {lang === 'ar'
                      ? 'يتحكم هذا المفتاح في إمكانية اشتراك المستخدمين من صفحة الأسعار. عند الإيقاف، تظهر رسالة "الاشتراكات متوقفة حاليًا" ولا يمكن بدء أي عملية دفع، حتى لو تم استدعاء الخادم مباشرة.'
                      : 'Controls whether users can subscribe from the Pricing page. When off, users see "Subscriptions are temporarily unavailable" and no checkout can be started — enforced on the server too.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSubscription}
                  disabled={subscriptionSaving}
                  id="btn-toggle-subscription-status"
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold shrink-0 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    subscriptionEnabled
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  {subscriptionEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  {lang === 'ar'
                    ? (subscriptionEnabled ? 'الاشتراكات: مفعلة' : 'الاشتراكات: متوقفة')
                    : (subscriptionEnabled ? 'Subscriptions: Enabled' : 'Subscriptions: Disabled')}
                </button>
              </div>
            </div>

            {/* Payment Methods Configuration */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <CreditCard className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-display font-bold text-on-surface uppercase tracking-wider">
                  {lang === 'ar' ? 'تهيئة بوابات الدفع النشطة' : 'Enabled Payment Gateways'}
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { key: 'card', name: lang === 'ar' ? 'بطاقة ائتمان' : 'Credit Card', icon: '💳' },
                  { key: 'applepay', name: 'Apple Pay', icon: '🍏' },
                  { key: 'googlepay', name: 'Google Pay', icon: '🤖' },
                  { key: 'paypal', name: 'PayPal', icon: '🅿️' },
                  { key: 'bank', name: lang === 'ar' ? 'حوالة بنكية' : 'Bank Transfer', icon: '🏛️' }
                ].map((gate) => (
                  <div key={gate.key} className="flex flex-col items-center justify-between p-3.5 bg-white/2 border border-white/5 rounded-xl text-center gap-2.5 hover:border-white/10 transition-all">
                    <span className="text-xl">{gate.icon}</span>
                    <span className="text-xs font-bold text-on-surface truncate w-full">{gate.name}</span>
                    <button
                      onClick={() => handleTogglePaymentMethod(gate.key)}
                      className={`w-9 h-5 rounded-full relative transition-colors focus:outline-none cursor-pointer ${
                        paymentMethods[gate.key] ? 'bg-primary' : 'bg-white/10'
                      }`}
                      id={`btn-toggle-gateway-${gate.key}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${
                        paymentMethods[gate.key] 
                          ? (isRTL ? 'left-0.5' : 'right-0.5') 
                          : (isRTL ? 'left-4.5' : 'right-4.5')
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column - Admin list and quick actions */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Admins & Team Section */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="text-sm font-display font-bold text-on-surface border-b border-white/5 pb-3 uppercase tracking-wider">
                {t[lang].adminsList}
              </h3>

              {/* NOTE (audit, Aug 2026): this list and the add/remove form
                  below are local-only React state — they do NOT touch the
                  real `is_admin` column in Supabase (which is what
                  actually controls access to /api/admin/* on the
                  backend). Flagged explicitly here since "who has admin
                  access" is security-sensitive and this could otherwise
                  give a false sense that access was actually granted. */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                <span className="font-bold shrink-0">⚠</span>
                <span>
                  {lang === 'ar'
                    ? 'معاينة محلية فقط — لا يمنح هذا وصول أدمن حقيقي على الخادم.'
                    : "Local preview only — this does not grant real admin access on the server."}
                </span>
              </div>

              {/* List of Admins */}
              <div className="flex flex-col gap-3">
                {admins.map((adm, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-white/2 border border-white/5 hover:bg-white/4 transition-colors">
                    <div className="text-left">
                      <p className="text-xs font-bold text-on-surface">{adm.name}</p>
                      <p className="text-xs text-on-surface-variant font-mono mt-0.5">{adm.email}</p>
                      <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-xs uppercase tracking-wider font-extrabold mt-1">
                        {adm.role}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveAdmin(adm.email)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 cursor-pointer transition-colors"
                      title="Remove Admin Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Form to add admin */}
              <form onSubmit={handleAddAdmin} className="flex flex-col gap-3 mt-4 border-t border-white/5 pt-4">
                <h4 className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-extrabold">
                  {t[lang].addAdmin}
                </h4>
                <div className="flex flex-col gap-1 text-left">
                  <input
                    type="text"
                    placeholder="E.g. Sarah Connor"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1 text-left">
                  <input
                    type="email"
                    placeholder="E.g. sarah@easy.pdf"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-secondary text-on-secondary text-xs font-bold hover:scale-[1.01] transition-transform cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t[lang].addAdmin}</span>
                </button>
              </form>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
