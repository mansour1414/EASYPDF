import React, { useState } from 'react';
import { Shield, Lock, Eye, Trash2, Database, ShieldAlert, Loader2 } from 'lucide-react';
import { authenticatedFetch } from '../lib/supabaseClient';

interface PrivacyPageProps {
  lang?: 'ar' | 'en';
  currentUser?: { email: string } | null;
  /** Called after the account is actually deleted, to clear local session
   *  state — reuses App.tsx's own handleLogout so this stays in one place. */
  onAccountDeleted?: () => void;
}

export default function PrivacyPage({ lang = 'en', currentUser = null, onAccountDeleted }: PrivacyPageProps) {
  const isAr = lang === 'ar';
  const [deleteState, setDeleteState] = useState<'idle' | 'confirming' | 'deleting'>('idle');

  const handleDeleteAccount = async () => {
    setDeleteState('deleting');
    try {
      const response = await authenticatedFetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        alert(isAr ? 'تم حذف حسابك وبياناتك نهائياً.' : 'Your account and data have been permanently deleted.');
        onAccountDeleted?.();
      } else {
        alert(data.error || (isAr ? 'تعذّر حذف الحساب. حاول مرة أخرى أو تواصل مع الدعم.' : 'Could not delete your account. Please try again or contact support.'));
        setDeleteState('idle');
      }
    } catch (err: any) {
      alert(err.message || (isAr ? 'حدث خطأ أثناء الحذف.' : 'An error occurred while deleting your account.'));
      setDeleteState('idle');
    }
  };

  return (
    <div className={`w-full flex flex-col gap-10 md:gap-14 py-6 animate-fadeIn ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-secondary/10 blur-[130px] rounded-full pointer-events-none -z-10"></div>

      {/* Hero Header */}
      <section className="text-center max-w-3xl mx-auto flex flex-col gap-4">
        <span className="text-xs font-bold font-mono text-secondary uppercase tracking-widest bg-secondary/10 px-3.5 py-1.5 rounded-full w-fit mx-auto">
          {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
        </span>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-on-surface tracking-tight leading-tight">
          {isAr ? 'خصوصيتك هي أولويتنا القصوى' : 'Your Privacy is Our Top Priority'}
        </h1>
        <p className="text-sm md:text-base text-neutral-300 leading-relaxed font-sans">
          {isAr
            ? 'نحن ملتزمون بحماية مستنداتك وبياناتك الشخصية. يوضح هذا المستند كيفية معالجة ملفاتك وضمان أمانها الكامل.'
            : 'We are committed to safeguarding your documents and personal information. This policy explains how we process and guarantee absolute security.'}
        </p>
      </section>

      {/* Main Content Sections */}
      <section className="max-w-4xl mx-auto w-full flex flex-col gap-8">
        
        {/* Section 1: PDF Security & Processing */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-secondary/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '١. المعالجة الآمنة لملفات الـ PDF' : '1. Secure PDF Processing'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'تتم معالجة جميع ملفات PDF والصور الخاصة بك بطريقة آمنة تماماً. نستخدم اتصالات HTTPS المشفرة (SSL/TLS) بمستوى تشفير عالي لتأمين انتقال البيانات بين جهازك وخوادمنا، مما يمنع أي طرف ثالث من اعتراض ملفاتك.'
              : 'All your PDF files and images are processed in a highly secure environment. We employ bank-grade HTTPS encryption (SSL/TLS) to safeguard data transmission between your device and our servers, preventing any third-party interception.'}
          </p>
        </div>

        {/* Section 2: Immediate File Deletion (Multer Cleanup) */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-red-400/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-400/10 flex items-center justify-center text-red-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٢. الحذف الفوري للملفات المؤقتة' : '2. Immediate Temporary File Deletion'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'نحن نطبق سياسة صارمة لعدم تخزين الملفات بشكل دائم. بعد رفع ملفاتك مؤقتاً لتسهيل المعالجة (على سبيل المثال، التحويل أو دمج المستندات) ورفعها بشكل آمن إلى وحدة التخزين السحابية الخاصة بالمستخدم، يتم حذف الملفات فوراً وتلقائياً من مجلد الرفع المؤقت في الخادم (Multer Temp Space) باستخدام عمليات الحذف الفوري لضمان عدم بقائها على خوادمنا.'
              : 'We operate a strict zero-persistent-storage policy. After your files are temporarily uploaded for processing (e.g. conversion, splitting, or merging) and safely synced to your user cloud bucket, they are immediately and automatically expunged from our server\'s temporary uploads folder using filesystem unlink actions. No trace of your raw files remains on our servers.'}
          </p>
        </div>

        {/* Section 3: Supabase Integration & Authentication */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-emerald-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٣. تخزين البيانات وبنية Supabase' : '3. Data Architecture via Supabase'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'تتم إدارة عمليات تسجيل دخول المستخدمين ومعلومات الملفات وتفاصيل الحساب من خلال بنية Supabase السحابية المؤمنة ببروتوكولات الأمان القياسية. يتم تخزين معلومات ملفاتك (الأسماء والأحجام وتواريخ المعالجة) بشكل آمن في قاعدة بيانات مشفرة ومحمية بقوانين الوصول الدقيقة للمستندات لضمان عدم تمكن أي شخص سواك من تصفحها.'
              : 'User authentication, file registries, and profile details are securely managed via Supabase infrastructure backed by industry-standard protocols. Your processing history and file metadata (such as names, sizes, and timestamps) are saved in an encrypted database protected by Row-Level Security (RLS) rules to ensure only you can access them.'}
          </p>
        </div>

        {/* Section 4: Data Protection Rights */}
        <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col gap-4 border border-white/5 bg-white/2 hover:border-indigo-500/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface font-display">
              {isAr ? '٤. حقوق حماية البيانات والتحكم بحسابك' : '4. Data Control & Deletion Rights'}
            </h2>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed font-sans">
            {isAr
              ? 'أنت تملك بياناتك. يمكنك حذف حسابك وبياناتك المخزّنة سحابياً نهائياً في أي وقت من هذه الصفحة. الملفات التي تعالجها بأدوات المتصفح تبقى على جهازك ولا تُرفع أصلاً. المستندات الناتجة عن تصدير "تعديل نص PDF" تُحفظ في التخزين السحابي حتى تحذف حسابك (أو يزيلها المشغّل يدوياً).'
              : 'You own your data. You can permanently delete your account and any files stored in the cloud at any time from this page. Files you process with the browser-based tools stay on your device and are never uploaded. Documents produced by the Edit PDF Text export are kept in cloud storage until you delete your account (or the operator removes them by hand).'}
          </p>

          {currentUser && (
            <div className="mt-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex flex-col gap-3">
              <p className="text-xs text-red-300/90 leading-relaxed font-sans">
                {isAr
                  ? 'حذف الحساب إجراء نهائي لا يمكن التراجع عنه: سيُحذف حسابك وملفاتك المخزّنة سحابياً وسجل اشتراكك.'
                  : 'Deleting your account is permanent and cannot be undone: your account, any files stored in the cloud, and your subscription record will all be removed.'}
              </p>
              {deleteState === 'idle' && (
                <button
                  onClick={() => setDeleteState('confirming')}
                  className="self-start flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                  id="btn-delete-account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isAr ? 'حذف حسابي نهائياً' : 'Permanently delete my account'}
                </button>
              )}
              {deleteState === 'confirming' && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-neutral-300 font-sans">
                    {isAr
                      ? `للتأكيد، هذا سيحذف الحساب المسجّل بالبريد ${currentUser.email}. لا يمكن التراجع عن هذا الإجراء.`
                      : `To confirm, this will delete the account signed in as ${currentUser.email}. This cannot be undone.`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      className="text-xs font-bold text-white bg-red-500/80 hover:bg-red-500 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      id="btn-confirm-delete-account"
                    >
                      {isAr ? 'نعم، احذف حسابي نهائياً' : 'Yes, permanently delete my account'}
                    </button>
                    <button
                      onClick={() => setDeleteState('idle')}
                      className="text-xs font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}
              {deleteState === 'deleting' && (
                <p className="text-xs text-neutral-300 font-sans flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {isAr ? 'جاري حذف الحساب...' : 'Deleting your account...'}
                </p>
              )}
            </div>
          )}
        </div>

      </section>

      {/* Date Updated */}
      <div className="text-center text-xs text-neutral-500 font-mono mt-4">
        {isAr ? 'آخر تحديث: ٢٠ يوليو ٢٠٢٦' : 'Last Updated: July 20, 2026'}
      </div>
    </div>
  );
}
