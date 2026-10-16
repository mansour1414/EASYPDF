import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Group, 
  CreditCard, 
  Settings, 
  Edit, 
  Globe, 
  Save, 
  LogOut,
  Type,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  FileText
} from 'lucide-react';
import { PageType } from '../types';
import { useTranslation } from '../lib/TranslationContext';

interface AdminEditorPageProps {
  onNavigate: (page: PageType) => void;
  lang?: 'ar' | 'en';
  setLang?: (lang: 'ar' | 'en') => void;
  onLogout?: () => void;
}

export default function AdminEditorPage({ onNavigate, onLogout }: AdminEditorPageProps) {
  const { translations, saveTranslation, refreshTranslations, loading, lang, setLang } = useTranslation();
  
  // Local edit state to track changes before saving
  const [editStates, setEditStates] = useState<Record<string, { en: string; ar: string }>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [successKeys, setSuccessKeys] = useState<Record<string, boolean>>({});
  
  // Custom new string form state
  const [newId, setNewId] = useState('');
  const [newEn, setNewEn] = useState('');
  const [newAr, setNewAr] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState('');

  // Sync translation values to local edit state on load or change
  useEffect(() => {
    if (translations) {
      const initialEdits: Record<string, { en: string; ar: string }> = {};
      Object.entries(translations).forEach(([key, val]) => {
        const item = val as { en: string; ar: string };
        initialEdits[key] = { en: item.en, ar: item.ar };
      });
      setEditStates(initialEdits);
    }
  }, [translations]);

  const handleTextChange = (key: string, field: 'en' | 'ar', value: string) => {
    setEditStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const handleSaveKey = async (key: string) => {
    const editVal = editStates[key];
    if (!editVal) return;

    setSavingKeys(prev => ({ ...prev, [key]: true }));
    const success = await saveTranslation(key, editVal.en, editVal.ar);
    setSavingKeys(prev => ({ ...prev, [key]: false }));

    if (success) {
      setSuccessKeys(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setSuccessKeys(prev => ({ ...prev, [key]: false }));
      }, 3000);
    } else {
      alert(`Failed to save string: ${key}`);
    }
  };

  const handleAddNewString = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const formattedId = newId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!formattedId) {
      setFormError('Please enter a valid text identifier.');
      return;
    }

    if (translations[formattedId]) {
      setFormError('An application string with this key already exists.');
      return;
    }

    if (!newEn.trim() || !newAr.trim()) {
      setFormError('Both English and Arabic translations are required.');
      return;
    }

    setSavingKeys(prev => ({ ...prev, [formattedId]: true }));
    const success = await saveTranslation(formattedId, newEn.trim(), newAr.trim());
    setSavingKeys(prev => ({ ...prev, [formattedId]: false }));

    if (success) {
      setNewId('');
      setNewEn('');
      setNewAr('');
      setShowAddForm(false);
      await refreshTranslations();
    } else {
      setFormError('Failed to save the new string to the server database.');
    }
  };

  const isRTL = lang === 'ar';

  const tLocal = {
    en: {
      dashboard: "Overview",
      settings: "Global Settings",
      overviewTitle: "Dynamic Text & Copy Editor",
      overviewDesc: "Edit all landing titles, CTA text, pricing plans and labels in real-time. Changes are synced instantly with Supabase.",
      save: "Save",
      saving: "Saving...",
      saved: "Saved!",
      backToPortal: "App Portal",
      navSystem: "System",
      adminConsole: "ADMIN CONSOLE",
      contentEditor: "Content Editor",
      userManagement: "User Management",
      pricingControl: "Pricing Control",
      logout: "Log out",
      textId: "String ID / Key",
      englishText: "English Copy",
      arabicText: "Arabic Copy (RTL)",
      addNew: "Add Custom Translation Key",
      formIdPlaceholder: "e.g., hero_main_title",
      formEnPlaceholder: "Enter English display text",
      formArPlaceholder: "أدخل النص العربي البديل هنا",
      cancel: "Cancel",
      create: "Create Key",
      previewTitle: "Live Real-time Preview",
      previewSubtitle: "This demonstrates how the dynamic strings render inside the app components on-the-fly."
    },
    ar: {
      dashboard: "نظرة عامة",
      settings: "الإعدادات العامة",
      overviewTitle: "محرر ومترجم النصوص التفاعلي",
      overviewDesc: "تعديل جميع عناوين الهبوط، نصوص الأزرار، وباقات الأسعار فورياً. تتم مزامنة التغييرات مباشرة مع قاعدة بيانات Supabase والملفات المحلية.",
      save: "حفظ التغييرات",
      saving: "جاري الحفظ...",
      saved: "تم الحفظ بنجاح!",
      backToPortal: "بوابة التطبيق",
      navSystem: "النظام والبيئة",
      adminConsole: "لوحة التحكم والإدارة",
      contentEditor: "محرر المحتوى",
      userManagement: "إدارة المستخدمين",
      pricingControl: "التحكم بالأسعار",
      logout: "تسجيل الخروج",
      textId: "معرّف النص (مفتاح البرمجة)",
      englishText: "النص الإنجليزي",
      arabicText: "النص العربي (RTL)",
      addNew: "إضافة مفتاح ترجمة مخصص",
      formIdPlaceholder: "مثال: hero_main_title",
      formEnPlaceholder: "أدخل النص الإنجليزي المقابل",
      formArPlaceholder: "أدخل النص العربي المعتمد هنا",
      cancel: "إلغاء",
      create: "إنشاء وحفظ",
      previewTitle: "معاينة مباشرة حية",
      previewSubtitle: "توضح هذه اللوحة كيفية تطبيق ومزامنة النصوص التفاعلية داخل واجهات ومكونات التطبيق فعلياً."
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-dim text-on-surface" dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-white/10 hidden md:flex flex-col bg-surface-container-low shrink-0 h-screen sticky top-0">
        <div className="p-6 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-on-primary">
              <span className="text-sm font-bold font-display">EP</span>
            </div>
            <span className="font-headline-md text-lg tracking-tight font-bold text-primary">Easy PDF</span>
          </div>
          <span className="text-[9px] font-mono text-on-surface-variant tracking-wider uppercase font-extrabold">
            {tLocal[lang].adminConsole}
          </span>
        </div>

        <nav className="flex-grow mt-4 flex flex-col gap-1 px-3">
          <button
            onClick={() => onNavigate('admin-dashboard')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>{tLocal[lang].dashboard}</span>
          </button>
          
          <button
            onClick={() => onNavigate('admin-editor')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-bold transition-all cursor-pointer text-xs text-left"
          >
            <Edit className="w-4 h-4" />
            <span>{tLocal[lang].contentEditor}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-users')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Group className="w-4 h-4" />
            <span>{tLocal[lang].userManagement}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-pricing')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <CreditCard className="w-4 h-4" />
            <span>{tLocal[lang].pricingControl}</span>
          </button>

          <button
            onClick={() => onNavigate('admin-settings')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Settings className="w-4 h-4" />
            <span>{tLocal[lang].settings}</span>
          </button>

          <div className="px-4 pt-6 pb-2">
            <span className="text-[9px] font-mono text-on-surface-variant/40 tracking-wider uppercase font-bold">
              {tLocal[lang].navSystem}
            </span>
          </div>

          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer text-xs font-semibold text-left"
          >
            <Globe className="w-4 h-4 text-secondary" />
            <span>{tLocal[lang].backToPortal}</span>
          </button>
        </nav>

        <div className="p-6 border-t border-white/5 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-extrabold text-xs">
              AD
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-on-surface">Admin User</p>
              <p className="text-xs text-on-surface-variant">Master Admin</p>
            </div>
          </div>
          <button 
            onClick={() => onLogout ? onLogout() : onNavigate('home')}
            className="text-on-surface-variant hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            title={tLocal[lang].logout}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-grow flex flex-col pb-16 min-w-0">
        
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-xl border-b border-white/5 px-6 md:px-8 py-5 flex justify-between items-center gap-4">
          <div className="flex flex-col text-left">
            <h1 className="text-xl md:text-2xl font-display font-bold text-on-surface">{tLocal[lang].overviewTitle}</h1>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-xl">{tLocal[lang].overviewDesc}</p>
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
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-primary text-on-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-[1.02] transition-transform cursor-pointer shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>{tLocal[lang].addNew}</span>
            </button>
          </div>
        </header>

        {/* Content Configuration Form */}
        <div className="px-6 md:px-8 py-8 flex flex-col lg:grid lg:grid-cols-12 gap-8 max-w-7xl w-full mx-auto">
          
          {/* Main Customizer Section */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Add Custom Translation Key Modal/Form */}
            {showAddForm && (
              <form onSubmit={handleAddNewString} className="content-card rounded-2xl p-6 border border-primary/20 bg-primary/5 flex flex-col gap-4 animate-fadeIn">
                <h3 className="text-sm font-display font-extrabold text-on-surface flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  {tLocal[lang].addNew}
                </h3>
                {formError && (
                  <p className="text-xs font-semibold text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20">{formError}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-mono uppercase tracking-wider text-on-surface-variant font-bold">{tLocal[lang].textId}</label>
                    <input
                      type="text"
                      required
                      placeholder={tLocal[lang].formIdPlaceholder}
                      value={newId}
                      onChange={(e) => setNewId(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-primary text-on-surface font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-mono uppercase tracking-wider text-on-surface-variant font-bold">{tLocal[lang].englishText}</label>
                    <input
                      type="text"
                      required
                      placeholder={tLocal[lang].formEnPlaceholder}
                      value={newEn}
                      onChange={(e) => setNewEn(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-left" dir="rtl">
                    <label className="text-xs font-mono uppercase tracking-wider text-on-surface-variant font-bold">{tLocal[lang].arabicText}</label>
                    <input
                      type="text"
                      required
                      placeholder={tLocal[lang].formArPlaceholder}
                      value={newAr}
                      onChange={(e) => setNewAr(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-primary text-on-surface text-right"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    {tLocal[lang].cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-on-primary text-xs font-bold rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
                  >
                    {tLocal[lang].create}
                  </button>
                </div>
              </form>
            )}

            {/* List of Dynamic Text Strings */}
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <p className="text-xs text-on-surface-variant font-mono">Loading Dynamic Database Strings...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {Object.keys(editStates).length === 0 ? (
                  <p className="text-center py-8 text-xs text-on-surface-variant font-mono">No translation strings loaded.</p>
                ) : (
                  Object.keys(editStates).map((key) => {
                    const stringValues = editStates[key];
                    const isSaving = savingKeys[key];
                    const isSuccess = successKeys[key];

                    return (
                      <div 
                        key={key} 
                        className="content-card rounded-2xl p-5 md:p-6 border border-white/5 hover:border-white/10 transition-all flex flex-col gap-4 text-left"
                      >
                        {/* Header of String Card */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                              <Type className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold font-mono text-on-surface tracking-tight">{key}</span>
                          </div>
                          
                          <button
                            onClick={() => handleSaveKey(key)}
                            disabled={isSaving}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                              isSuccess 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-white/5 hover:bg-primary hover:text-on-primary hover:scale-[1.02] text-on-surface border border-white/10'
                            }`}
                          >
                            {isSaving ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>{tLocal[lang].saving}</span>
                              </>
                            ) : isSuccess ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{tLocal[lang].saved}</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-3 h-3" />
                                <span>{tLocal[lang].save}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Textboxes for English & Arabic translation values */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider">{tLocal[lang].englishText}</label>
                            {stringValues.en.length > 80 ? (
                              <textarea
                                value={stringValues.en}
                                onChange={(e) => handleTextChange(key, 'en', e.target.value)}
                                rows={2}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-sans leading-relaxed resize-none"
                              />
                            ) : (
                              <input
                                type="text"
                                value={stringValues.en}
                                onChange={(e) => handleTextChange(key, 'en', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-sans font-medium"
                              />
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5" dir="rtl">
                            <label className="text-xs font-mono text-on-surface-variant uppercase tracking-wider text-right">{tLocal[lang].arabicText}</label>
                            {stringValues.ar.length > 80 ? (
                              <textarea
                                value={stringValues.ar}
                                onChange={(e) => handleTextChange(key, 'ar', e.target.value)}
                                rows={2}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-sans leading-relaxed resize-none text-right"
                              />
                            ) : (
                              <input
                                type="text"
                                value={stringValues.ar}
                                onChange={(e) => handleTextChange(key, 'ar', e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary font-sans font-medium text-right"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Right Column - Live Preview Panel */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="content-card-elevated rounded-2xl p-5 md:p-6 flex flex-col gap-4 sticky top-28 border border-primary/20 bg-primary/2">
              <h3 className="text-sm font-display font-extrabold text-on-surface border-b border-white/5 pb-2.5 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {tLocal[lang].previewTitle}
              </h3>
              <p className="text-xs text-on-surface-variant leading-normal mb-1">
                {tLocal[lang].previewSubtitle}
              </p>

              {/* Dynamic Hero Simulation Card */}
              <div className="bg-black/35 rounded-xl p-4 border border-white/5 flex flex-col gap-4 text-left" dir={isRTL ? 'rtl' : 'ltr'}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
                  <span className="text-xs font-mono text-on-surface-variant uppercase tracking-wider font-bold">
                    {editStates.hero_badge?.[lang] || 'Engine Active'}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-display font-extrabold text-on-surface leading-tight">
                    {editStates.hero_title_en?.[lang] || 'Master Your PDFs'}
                  </h4>
                  <span className="text-xs text-secondary font-mono">
                    {editStates.hero_subtitle?.[lang] || 'Gemini AI Powered'}
                  </span>
                  <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 mt-1">
                    {editStates.hero_description?.[lang] || 'Optimize document payloads quickly and safely.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button className="bg-primary text-on-primary text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider">
                    {editStates.btn_get_started_free?.[lang] || 'Get Started'}
                  </button>
                  <button className="bg-white/5 text-on-surface text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider border border-white/10">
                    {editStates.btn_view_pricing?.[lang] || 'Pricing'}
                  </button>
                </div>
              </div>

              {/* Dynamic Pricing Simulation Card */}
              <div className="bg-black/35 rounded-xl p-4 border border-white/5 flex flex-col gap-2.5 text-left" dir={isRTL ? 'rtl' : 'ltr'}>
                <h4 className="text-xs font-display font-bold text-on-surface">
                  {editStates.pricing_title_en?.[lang] || 'Simple Pricing'}
                </h4>
                <p className="text-xs text-on-surface-variant leading-normal line-clamp-2">
                  {editStates.pricing_subtitle?.[lang] || 'Choose the ideal subscription tier.'}
                </p>
              </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
