import React, { useState } from 'react';
import { authenticatedFetch } from '../lib/supabaseClient';
import { Search, ChevronLeft, ChevronRight, FileDown, Trash2, Edit, LayoutDashboard, Group, CreditCard, Settings, UserPlus, Info, LogOut, Globe } from 'lucide-react';
import { PageType } from '../types';
import LogoImage from './LogoImage';

interface AdminUserPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  onLogout?: () => void;
}

export default function AdminUserPage({ onNavigate, lang: propLang, setLang: propSetLang, onLogout }: AdminUserPageProps) {
  const [localLang, localSetLang] = useState<'ar' | 'en'>('en');
  const lang = propLang || localLang;
  const setLang = propSetLang || localSetLang;
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = () => {
    setLoading(true);
    authenticatedFetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const todayUtc = new Date().toISOString().slice(0, 10);
          // Daily counters are only reset when the user next calls the API, so a
          // stored "today" count can be days old. Treat it as today's usage only
          // if its reset date is today.
          const usedToday = (u: any) => (String(u.last_usage_reset_date ?? '').slice(0, 10) === todayUtc ? (Number(u.uploads_count_today) || 0) : 0);
          const mapped = data.map((u, index) => ({
            id: u.id,
            name: u.email.split('@')[0],
            email: u.email,
            plan: u.plan === 'pro' ? 'Pro' : 'Free',
            usage: `${usedToday(u)} uploads`,
            limit: u.plan === 'pro' ? 'Unlimited' : '3 limit',
            percentage: u.plan === 'pro' ? 100 : Math.min(100, Math.round((usedToday(u) / 3) * 100)),
            date: new Date(u.created_at || Date.now()).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'),
            avatar: index % 3 === 0 ? 'face' : index % 3 === 1 ? 'image' : 'shield',
            // Real ban status from Supabase Auth (see /api/admin/users) — not
            // a column in our own tables.
            banned: !!u.banned
          }));
          setUsers(mapped);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching admin users:', err);
        setLoading(false);
      });
  };

  React.useEffect(() => {
    fetchUsers();
  }, [lang]);

  const updatePlan = async (userId: string, plan: 'free' | 'pro') => {
    try {
      const response = await authenticatedFetch('/api/admin/update-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan })
      });
      if (response.ok) {
        alert(lang === 'ar' ? 'تم تحديث خطة العضو بنجاح!' : 'User plan updated successfully!');
        fetchUsers();
      } else {
        const d = await response.json();
        alert(d.error || 'Failed to update plan');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating plan');
    }
  };

  // NOTE (Sep 2026): "delete user" and "disable user" used to change ONLY
  // the React state of this page (nothing was sent to the server, and the
  // user came back after a refresh), while looking as if they worked. Both
  // are now real: delete calls DELETE /api/admin/users/:id (reusing the same
  // cleanup as a user's own self-service account deletion) and requires
  // typing the target's exact email as confirmation; ban/unban calls
  // POST /api/admin/users/:id/ban, which uses Supabase Auth's own
  // ban_duration — a real, reversible block on signing in, with no new
  // database column.
  const deleteUser = async (userId: string, email: string) => {
    const typed = prompt(
      lang === 'ar'
        ? `للتأكيد النهائي (لا يمكن التراجع)، اكتب البريد الإلكتروني لهذا المستخدم بالضبط:\n${email}`
        : `To permanently delete this user (this cannot be undone), type their exact email address:\n${email}`
    );
    if (typed === null) return; // cancelled
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: typed })
      });
      const d = await response.json().catch(() => ({}));
      if (response.ok) {
        alert(lang === 'ar' ? 'تم حذف المستخدم نهائياً.' : 'The user has been permanently deleted.');
        fetchUsers();
      } else {
        alert(d.error || (lang === 'ar' ? 'فشل حذف المستخدم.' : 'Failed to delete the user.'));
      }
    } catch (err: any) {
      alert(err.message || (lang === 'ar' ? 'حدث خطأ أثناء الحذف.' : 'An error occurred while deleting.'));
    }
  };

  const toggleBan = async (userId: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? 'unban' : 'ban';
    const confirmMsg = currentlyBanned
      ? (lang === 'ar' ? 'إعادة تفعيل هذا الحساب والسماح له بتسجيل الدخول؟' : 'Re-enable this account and allow it to sign in again?')
      : (lang === 'ar' ? 'حظر هذا الحساب؟ لن يتمكن من تسجيل الدخول حتى تتم إعادة تفعيله.' : "Ban this account? They won't be able to sign in until unbanned.");
    if (!confirm(confirmMsg)) return;
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const d = await response.json().catch(() => ({}));
      if (response.ok) {
        fetchUsers();
      } else {
        alert(d.error || (lang === 'ar' ? 'فشلت العملية.' : 'The action failed.'));
      }
    } catch (err: any) {
      alert(err.message || (lang === 'ar' ? 'حدث خطأ.' : 'An error occurred.'));
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) || 
                          user.email.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === 'all' || user.plan.toLowerCase() === planFilter.toLowerCase();
    return matchesSearch && matchesPlan;
  });

  // Real CSV export of the currently filtered user list (previously this
  // button was `alert('CSV Export initiated')` with no actual file — audit,
  // Aug 2026). Escapes quotes/commas per RFC 4180 and neutralizes any
  // leading formula-trigger character, matching the same convention used
  // server-side in /api/ai/extract-data since this opens directly in
  // Excel/Sheets.
  const csvField = (value: string) => {
    let v = String(value ?? '');
    if (/^[=+\-@]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    if (filteredUsers.length === 0) return;
    const header = ['Name', 'Email', 'Plan', 'Usage', 'Limit', 'Joined'];
    const rows = filteredUsers.map(u => [
      csvField(u.name), csvField(u.email), csvField(u.plan), csvField(u.usage), csvField(u.limit), csvField(u.date)
    ].join(','));
    const csv = [header.map(csvField).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `easypdf-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const t = {
    en: {
      title: "User Directory",
      desc: "Manage accounts, permissions, and monitor platform usage.",
      dashboard: "Dashboard",
      pricingControl: "Pricing Control",
      userManagement: "User Management",
      inviteUser: "Invite User",
      searchPlaceholder: "Search by name or email...",
      allPlans: "All Plans",
      freePlan: "Free",
      proPlan: "Pro",
      bizPlan: "Business",
      filters: "More Filters",
      export: "Export CSV",
      userDetails: "User Details",
      planStatus: "Plan Status",
      usageEfficiency: "Usage Efficiency",
      joinDate: "Join Date",
      actions: "Actions",
      showing: "Showing 1-4 of 1,284 users",
      notAvailableYet: "Not available yet: this action is not connected to the server, so it is disabled."
    },
    ar: {
      title: "دليل المستخدمين والمشتركين",
      desc: "إدارة الحسابات والصلاحيات ومراقبة معدلات استهلاك المساحة والموارد للعملاء.",
      dashboard: "لوحة التحكم",
      pricingControl: "التحكم بالأسعار",
      userManagement: "إدارة المستخدمين",
      inviteUser: "دعوة مستخدم جديد",
      searchPlaceholder: "ابحث بالاسم أو البريد الإلكتروني...",
      allPlans: "جميع الخطط",
      freePlan: "المجانية",
      proPlan: "برو",
      bizPlan: "المؤسسات",
      filters: "تصفية متقدمة",
      export: "تصدير البيانات CSV",
      userDetails: "بيانات المستخدم",
      planStatus: "نوع الخطة الحالية",
      usageEfficiency: "استهلاك مساحة الموارد",
      joinDate: "تاريخ الانضمام",
      actions: "خيارات التحكم",
      showing: "عرض 1-4 من أصل 1,284 مستخدم نشط",
      notAvailableYet: "غير متاح بعد: هذا الإجراء غير مرتبط بالخادم، لذلك هو معطّل."
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold transition-all cursor-pointer text-xs text-left"
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

      {/* Main content */}
      <main className="flex-grow flex flex-col relative min-w-0">
        
        {/* Header section */}
        <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-white/5 px-6 md:px-8 py-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex flex-col text-left">
            <h1 className="text-xl md:text-2xl font-display font-bold text-on-surface">{t[lang].title}</h1>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-xl">{t[lang].desc}</p>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono font-bold hover:bg-white/10 cursor-pointer transition-all"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <button
              disabled
              aria-disabled="true"
              title={t[lang].notAvailableYet}
              className="bg-primary text-on-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 opacity-40 cursor-not-allowed shadow-lg shadow-primary/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t[lang].inviteUser}</span>
            </button>
          </div>
        </header>

        {/* Toolbar zone */}
        <div className="px-6 md:px-8 py-4 flex flex-col md:flex-row gap-4 items-center justify-between z-10">
          <div className="relative w-full md:w-96">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant ${isRTL ? 'right-3' : 'left-3'}`} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t[lang].searchPlaceholder}
              className={`w-full bg-white/5 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl py-2.5 outline-none text-xs text-on-surface ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
            />
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-on-surface cursor-pointer outline-none shrink-0"
            >
              <option value="all">{t[lang].allPlans}</option>
              <option value="free">{t[lang].freePlan}</option>
              <option value="pro">{t[lang].proPlan}</option>
              <option value="business">{t[lang].bizPlan}</option>
            </select>

            <button
              onClick={handleExportCsv}
              disabled={filteredUsers.length === 0}
              className="glass-panel px-4 py-2.5 rounded-xl flex items-center gap-1.5 hover:bg-white/5 text-xs font-medium cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="w-3.5 h-3.5 text-primary" />
              <span>{t[lang].export}</span>
            </button>
          </div>
        </div>

        {/* Main table workspace */}
        <div className="flex-grow px-6 md:px-8 pb-8 overflow-hidden">
          <div className="h-full content-card rounded-2xl flex flex-col border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
<tr className="border-b border-white/5 bg-white/2">
                  <th className={`px-6 py-4 text-xs font-mono text-on-surface-variant uppercase tracking-wider font-semibold ${isRTL ? 'text-right' : 'text-left'}`}>
                      {t[lang].userDetails}
                    </th>
                    <th className="px-6 py-4 text-xs font-mono text-on-surface-variant uppercase tracking-wider font-semibold text-center">
                      {t[lang].planStatus}
                    </th>
                    <th className={`px-6 py-4 text-xs font-mono text-on-surface-variant uppercase tracking-wider font-semibold ${isRTL ? 'text-right' : 'text-left'}`}>
                      {t[lang].usageEfficiency}
                    </th>
                    <th className={`px-6 py-4 text-xs font-mono text-on-surface-variant uppercase tracking-wider font-semibold ${isRTL ? 'text-right' : 'text-left'}`}>
                      {t[lang].joinDate}
                    </th>
                    <th className={`px-6 py-4 text-xs font-mono text-on-surface-variant uppercase tracking-wider font-semibold ${isRTL ? 'text-left' : 'text-right'}`}>
                      {t[lang].actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                            {user.avatar === 'face' ? '👩‍💻' : user.avatar === 'image' ? '🧑‍💼' : user.avatar === 'shield' ? '👨‍🚀' : '👤'}
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-xs text-on-surface">{user.name}</p>
                            <p className="text-xs text-on-surface-variant mt-0.5">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest border ${
                          user.plan === 'Business'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : user.plan === 'Pro'
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-white/5 text-on-surface-variant border-white/5'
                        }`}>
                          {user.plan}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="w-48">
                          <div className="flex justify-between text-xs mb-1 font-mono">
                            <span className="text-on-surface-variant">{user.usage} / {user.limit}</span>
                            <span className={`font-semibold ${user.percentage > 80 ? 'text-red-400' : 'text-primary'}`}>{user.percentage}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                user.percentage > 80 ? 'bg-red-500' : 'bg-gradient-to-r from-primary to-secondary'
                              }`} 
                              style={{ width: `${user.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      <td className={`px-6 py-4 text-xs text-on-surface-variant font-medium ${isRTL ? 'text-right' : 'text-left'}`}>
                        {user.date}
                      </td>

                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-2.5 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                          <button
                            onClick={() => {
                              const newPlan = prompt(
                                lang === 'ar' 
                                  ? 'أدخل نوع الاشتراك الجديد للمستخدم (free أو pro):' 
                                  : 'Enter new subscription type for user (free or pro):', 
                                user.plan.toLowerCase()
                              );
                              if (newPlan) {
                                const p = newPlan.trim().toLowerCase();
                                if (p === 'free' || p === 'pro') {
                                  updatePlan(user.id, p as 'free' | 'pro');
                                } else {
                                  alert(lang === 'ar' ? 'نوع الاشتراك المدخل غير صحيح! يرجى كتابة free أو pro.' : 'Invalid subscription type! Please enter "free" or "pro".');
                                }
                              }
                            }}
                            className="p-1.5 text-on-surface-variant hover:text-primary transition-colors hover:bg-primary/10 rounded-lg cursor-pointer"
                            id={`btn-edit-user-plan-${user.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleBan(user.id, !!user.banned)}
                            title={user.banned
                              ? (lang === 'ar' ? 'إعادة تفعيل الحساب' : 'Re-enable account')
                              : (lang === 'ar' ? 'حظر الحساب' : 'Ban account')}
                            className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-colors border ${
                              user.banned
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-green-500/10 text-green-400 border-green-500/20'
                            }`}
                          >
                            {user.banned ? (lang === 'ar' ? 'محظور' : 'Banned') : (lang === 'ar' ? 'نشط' : 'Active')}
                          </button>
                          <button
                            onClick={() => deleteUser(user.id, user.email)}
                            title={lang === 'ar' ? 'حذف المستخدم نهائياً' : 'Permanently delete this user'}
                            className="p-1.5 text-on-surface-variant hover:text-red-400 transition-colors hover:bg-red-500/10 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-auto px-6 py-4 border-t border-white/5 flex items-center justify-between gap-4 bg-white/1">
              <p className="text-xs text-on-surface-variant font-medium">
                {loading 
                  ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading users...') 
                  : (lang === 'ar' 
                      ? `عرض ${filteredUsers.length} من أصل ${users.length} مستخدم` 
                      : `Showing ${filteredUsers.length} of ${users.length} users`)}
              </p>
              
              <div className="flex items-center gap-1 font-mono">
                <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer">1</button>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
