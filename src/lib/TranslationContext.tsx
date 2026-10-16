import React, { createContext, useContext, useState, useEffect } from 'react';
import { authenticatedFetch } from './supabaseClient';

export interface AppString {
  id: string;
  en: string;
  ar: string;
}

interface TranslationContextType {
  translations: Record<string, { en: string; ar: string }>;
  t: (key: string, defaultVal?: string) => string;
  loading: boolean;
  lang: 'ar' | 'en';
  setLang: (lang: 'ar' | 'en') => void;
  refreshTranslations: () => Promise<void>;
  saveTranslation: (id: string, en: string, ar: string) => Promise<boolean>;
}

const defaultStrings: Record<string, { en: string; ar: string }> = {
  hero_badge: { en: "AI-powered PDF tools", ar: "أدوات PDF مدعومة بالذكاء الاصطناعي" },
  hero_title_en: { en: "Master Your PDFs in Seconds...", ar: "أنجز مهامك مع ملفات PDF في ثوانٍ..." },
  hero_subtitle: { en: "Empowered by Gemini AI.", ar: "بمساعدة الذكاء الاصطناعي." },
  hero_description: { en: "Forget traditional tools. With Easy PDF, edit, convert, and summarize your documents simply by conversing with your smart assistant.", ar: "انسَ الطرق التقليدية. مع Easy PDF، يمكنك تعديل، تحويل، وتلخيص مستنداتك بمجرد التحدث مع مساعدك الذكي." },
  btn_get_started_free: { en: "Get Started Free", ar: "ابدأ الآن مجاناً" },
  btn_view_pricing: { en: "View Pricing", ar: "الخطط والأسعار" },
  pricing_title_en: { en: "Simple Pricing for Smart Solutions", ar: "أسعار بسيطة لحلول ذكية ومتكاملة" },
  pricing_subtitle: { en: "Powerful document management tools tailored for individuals, professionals, and teams. Choose the plan that accelerates your workflow.", ar: "أدوات قوية لإدارة المستندات ومصممة خصيصاً للأفراد والمحترفين والفرق. اختر الخطة المناسبة لتسريع وتيرة عملك." },
  nav_tools: { en: "Tools", ar: "الأدوات" },
  nav_pricing: { en: "Pricing", ar: "الأسعار" },
  nav_workspace: { en: "Workspace", ar: "بيئة العمل" }
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export function TranslationProvider({ children, currentLang, setCurrentLang }: { children: React.ReactNode, currentLang: 'ar' | 'en', setCurrentLang: (lang: 'ar' | 'en') => void }) {
  const [translations, setTranslations] = useState<Record<string, { en: string; ar: string }>>(defaultStrings);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshTranslations = async () => {
    try {
      const res = await authenticatedFetch('/api/strings');
      const data = await res.json();
      if (data.success && Array.isArray(data.strings)) {
        const mapped: Record<string, { en: string; ar: string }> = { ...defaultStrings };
        data.strings.forEach((str: any) => {
          mapped[str.id] = { en: str.en, ar: str.ar };
        });
        setTranslations(mapped);
      }
    } catch (err) {
      console.error('Failed to load dynamic translations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTranslations();
  }, []);

  const saveTranslation = async (id: string, en: string, ar: string): Promise<boolean> => {
    try {
      const res = await authenticatedFetch('/api/admin/strings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, en, ar })
      });

      const data = await res.json();
      if (data.success) {
        setTranslations(prev => ({
          ...prev,
          [id]: { en, ar }
        }));
        return true;
      } else {
        console.error('Failed to save translation:', data.error);
        return false;
      }
    } catch (err) {
      console.error('Error in saveTranslation:', err);
      return false;
    }
  };

  const t = (key: string, defaultVal?: string): string => {
    const item = translations[key];
    if (item) {
      return currentLang === 'ar' ? item.ar : item.en;
    }
    return defaultVal || key;
  };

  return (
    <TranslationContext.Provider
      value={{
        translations,
        t,
        loading,
        lang: currentLang,
        setLang: setCurrentLang,
        refreshTranslations,
        saveTranslation
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
