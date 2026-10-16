import React, { useState } from 'react';
import { authenticatedFetch } from '../lib/supabaseClient';
import LogoImage from './LogoImage';
import { 
  LayoutDashboard, 
  Group, 
  CreditCard, 
  Settings, 
  Edit, 
  Search, 
  Plus, 
  UserPlus, 
  FileText, 
  Sparkles, 
  LogOut, 
  ShieldAlert, 
  Globe, 
  ArrowRight,
  Menu
} from 'lucide-react';
import { PageType } from '../types';

interface AdminDashboardPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  onLogout?: () => void;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);
const usedToday = (u: any, field: 'uploads_count_today' | 'ai_count_today'): number =>
  String(u?.last_usage_reset_date ?? '').slice(0, 10) === todayUtc() ? (Number(u?.[field]) || 0) : 0;

export default function AdminDashboardPage({ onNavigate, lang: propLang, setLang: propSetLang, onLogout }: AdminDashboardPageProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('en');
  const lang = propLang || localLang;
  const setLang = propSetLang || localSetLang;

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    filesProcessed: 0,
    proAccounts: 0,
  });
  // Raw user rows kept alongside the aggregated `stats` so the "New
  // Report" button (previously a fake `alert('Exporting live dashboard
  // state...')` with no actual export) can generate a real CSV from data
  // already fetched for this page, instead of just claiming to.
  const [rawUsers, setRawUsers] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  React.useEffect(() => {
    authenticatedFetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRawUsers(data);
          const uCount = data.length;
          // Pro accounts = plan 'pro'. This INCLUDES accounts granted Pro by
          // an admin (e.g. the owner's), so it is NOT paying-customer revenue.
          // The old "Est. Monthly Revenue" tile multiplied this count by
          // $9.99 and presented the result as revenue, which was misleading
          // (Stripe is not confirmed as configured and admin grants pay
          // nothing), so the tile now shows the plain count.
          const proCount = data.filter(u => u.plan === 'pro').length;
          // Daily counters are only reset when a user next calls the API, so
          // a user's stored "today" value can be days old. Count a user's
          // usage as "today" only if their reset date IS today (UTC, the
          // same day boundary the server uses).
          const actCount = data.filter(u => usedToday(u, 'uploads_count_today') > 0 || usedToday(u, 'ai_count_today') > 0).length;
          const processed = data.reduce((acc, u) => acc + usedToday(u, 'uploads_count_today'), 0);

          setStats({
            totalUsers: uCount,
            activeUsers: actCount,
            filesProcessed: processed,
            proAccounts: proCount,
          });
        }
      })
      .catch(err => {
        console.error('Error fetching admin dashboard stats:', err);
      });
  }, []);

  // Real CSV export of the user list already loaded for this page. Escapes
  // quotes/commas per RFC 4180 and neutralizes any leading formula-trigger
  // character (=, +, -, @) the same way /api/ai/extract-data does
  // server-side, since this CSV can be opened directly in Excel/Sheets.
  const csvField = (value: string) => {
    let v = String(value ?? '');
    if (/^[=+\-@]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };

  const handleExportReport = () => {
    if (isExporting || rawUsers.length === 0) return;
    setIsExporting(true);
    try {
      const header = ['Email', 'Plan', 'Is Admin', 'Uploads Today', 'AI Uses Today', 'Created At'];
      const rows = rawUsers.map(u => [
        csvField(u.email || ''),
        csvField(u.plan === 'pro' ? 'Pro' : 'Free'),
        csvField(u.is_admin ? 'Yes' : 'No'),
        csvField(String(usedToday(u, 'uploads_count_today'))),
        csvField(String(usedToday(u, 'ai_count_today'))),
        csvField(u.created_at ? new Date(u.created_at).toISOString() : '')
      ].join(','));
      const csv = [header.map(csvField).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `easypdf-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const t = {
    en: {
      dashboard: "Overview",
      fileManager: "File Manager",
      settings: "Global Settings",
      analytics: "Analytics",
      securityLogs: "Security Logs",
      overviewTitle: "Overview Dashboard",
      overviewDesc: "Account statistics from your user database",
      newReport: "New Report",
      totalUsers: "Total Users",
      activeUsers: "Active Users",
      filesProcessed: "Files Uploaded Today",
      monthlyRevenue: "Pro Accounts (incl. admin-granted)",
      notConnectedGrowth: "User-growth history is not available yet.",
      notConnectedUsage: "Per-tool usage is not tracked yet (most tools run in your browser).",
      notConnectedActivity: "No activity log is available yet.",
      userGrowth: "User Growth",
      fileUsage: "File Usage by Tool",
      recentActivity: "Recent Activity",
      viewAll: "View All Actions",
      backToPortal: "App Portal",
      navSystem: "System",
      support: "Support",
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
      overviewTitle: "لوحة التحكم الرئيسية",
      overviewDesc: "إحصائيات الحسابات من قاعدة بيانات المستخدمين",
      newReport: "تقرير جديد",
      totalUsers: "إجمالي المستخدمين",
      activeUsers: "المستخدمين النشطين",
      filesProcessed: "الملفات المرفوعة اليوم",
      monthlyRevenue: "حسابات Pro (تشمل الممنوحة من الإدارة)",
      notConnectedGrowth: "سجل نمو المستخدمين غير متاح بعد.",
      notConnectedUsage: "لا يتم تتبّع استخدام كل أداة بعد (معظم الأدوات تعمل داخل المتصفح).",
      notConnectedActivity: "لا يوجد سجل نشاط بعد.",
      userGrowth: "نمو المستخدمين",
      fileUsage: "الاستهلاك حسب الأداة",
      recentActivity: "أحدث النشاطات",
      viewAll: "عرض كافة النشاطات",
      backToPortal: "بوابة التطبيق",
      navSystem: "النظام والبيئة",
      support: "الدعم والمساعدة",
      adminConsole: "لوحة التحكم والإدارة",
      contentEditor: "محرر المحتوى",
      userManagement: "إدارة المستخدمين",
      pricingControl: "التحكم بالأسعار",
      logout: "تسجيل الخروج"
    }
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold transition-all cursor-pointer text-xs text-left"
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
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
              onClick={handleExportReport}
              disabled={isExporting || rawUsers.length === 0}
              className="bg-primary text-on-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-[1.02] transition-transform cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Plus className="w-4 h-4" />
              <span>{t[lang].newReport}</span>
            </button>
          </div>
        </header>

        {/* Outer content container */}
        <div className="px-6 md:px-8 py-8 flex flex-col gap-8 max-w-6xl w-full mx-auto">
          
          {/* Stats Row */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total Users */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-base">
                  👥
                </span>
              </div>
              <div>
                <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].totalUsers}</p>
                <h3 className="text-3xl font-display font-extrabold text-on-surface mt-1">{stats.totalUsers}</h3>
              </div>
            </div>

            {/* Active Users */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center">
                <span className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center text-tertiary text-base">
                  ⚡
                </span>
              </div>
              <div>
                <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].activeUsers}</p>
                <h3 className="text-3xl font-display font-extrabold text-on-surface mt-1">{stats.activeUsers}</h3>
              </div>
            </div>

            {/* Total Files */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center">
                <span className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400 text-base">
                  📄
                </span>
              </div>
              <div>
                <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].filesProcessed}</p>
                <h3 className="text-3xl font-display font-extrabold text-on-surface mt-1">{stats.filesProcessed}</h3>
              </div>
            </div>

            {/* Monthly Revenue */}
            <div className="content-card rounded-2xl p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-center">
                <span className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 text-base">
                  💰
                </span>
              </div>
              <div>
                <p className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">{t[lang].monthlyRevenue}</p>
                <h3 className="text-3xl font-display font-extrabold text-on-surface mt-1">{stats.proAccounts}</h3>
              </div>
            </div>

          </section>

          {/* Graphs Area */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* User Growth Chart Box */}
            <div className="lg:col-span-8 content-card rounded-2xl p-6 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-display font-bold text-on-surface">{t[lang].userGrowth}</h3>
              </div>

              {/* The former chart here was a hard-coded decoration (fixed
                  curve, fake "Oct 14 / 1,402 Users" marker) with dead
                  30/90-day buttons. Removed rather than presenting invented
                  numbers as analytics. */}
              <div className="h-64 w-full bg-black/15 rounded-2xl border border-white/5 flex items-center justify-center px-6 text-center">
                <p className="text-xs text-on-surface-variant leading-relaxed">{t[lang].notConnectedGrowth}</p>
              </div>
            </div>

            {/* File Usage by Tool Chart Box */}
            <div className="lg:col-span-4 content-card rounded-2xl p-6 flex flex-col gap-6">
              <h3 className="text-base font-display font-bold text-on-surface">{t[lang].fileUsage}</h3>

              {/* The former bars (Merge 42% / Split 28% / Compress 18% /
                  Convert 12%) were hard-coded. Tool usage is not recorded
                  anywhere (the core tools run in the browser). */}
              <div className="flex-grow flex items-center justify-center text-center px-2">
                <p className="text-xs text-on-surface-variant leading-relaxed">{t[lang].notConnectedUsage}</p>
              </div>
            </div>

          </section>

          {/* Recent Activity List */}
          <section className="content-card rounded-2xl overflow-hidden flex flex-col border-white/5">
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-display font-bold text-on-surface">{t[lang].recentActivity}</h3>
              </div>
            </div>

            {/* The four rows that were here were invented sample events
                (fake signup, "auto-deleted 500 files / 30-day retention",
                "security scan", "API key rotation"). There is no activity
                log or audit-event source, so nothing is shown. */}
            <div className="p-8 text-center">
              <p className="text-xs text-on-surface-variant leading-relaxed">{t[lang].notConnectedActivity}</p>
            </div>
          </section>

        </div>

      </main>
    </div>
  );
}
