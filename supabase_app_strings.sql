-- Create app_strings table
CREATE TABLE IF NOT EXISTS public.app_strings (
    id TEXT PRIMARY KEY,
    en TEXT NOT NULL,
    ar TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row-Level Security (RLS)
ALTER TABLE public.app_strings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to everyone (so landing pages can retrieve translations)
CREATE POLICY "Allow public read access" ON public.app_strings
    FOR SELECT TO public USING (true);

-- Allow authenticated admin users to modify strings
CREATE POLICY "Allow admin to modify strings" ON public.app_strings
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND (users.is_admin = true OR users.role = 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND (users.is_admin = true OR users.role = 'admin')
        )
    );

-- Seed default application copy rows.
-- NOTE (audit, Aug 2026): this previously used `ON CONFLICT (id) DO UPDATE
-- SET en = EXCLUDED.en, ar = EXCLUDED.ar`, which is NOT safe to re-run —
-- /api/admin/strings (server.ts) lets an admin genuinely edit these same
-- row ids live via the Admin Editor page. Re-running this file after an
-- admin has customized any of this copy would silently overwrite their
-- edits back to these hardcoded defaults, with no warning. Changed to
-- `DO NOTHING` so this only ever seeds a row the first time it doesn't
-- exist, and never clobbers content an admin has since changed.
INSERT INTO public.app_strings (id, en, ar) VALUES
('hero_badge', 'AI-powered PDF tools', 'أدوات PDF مدعومة بالذكاء الاصطناعي'),
('hero_title_en', 'Master Your PDFs in Seconds...', 'أنجز مهامك مع ملفات PDF في ثوانٍ...'),
('hero_subtitle', 'Empowered by Gemini AI.', 'بمساعدة الذكاء الاصطناعي.'),
('hero_description', 'Forget traditional tools. With Easy PDF, edit, convert, and summarize your documents simply by conversing with your smart assistant.', 'انسَ الطرق التقليدية. مع Easy PDF، يمكنك تعديل، تحويل، وتلخيص مستنداتك بمجرد التحدث مع مساعدك الذكي.'),
('btn_get_started_free', 'Get Started Free', 'ابدأ الآن مجاناً'),
('btn_view_pricing', 'View Pricing', 'الخطط والأسعار'),
('pricing_title_en', 'Simple Pricing for Smart Solutions', 'أسعار بسيطة لحلول ذكية ومتكاملة'),
('pricing_subtitle', 'Powerful document management tools tailored for individuals, professionals, and teams. Choose the plan that accelerates your workflow.', 'أدوات قوية لإدارة المستندات ومصممة خصيصاً للأفراد والمحترفين والفرق. اختر الخطة المناسبة لتسريع وتيرة عملك.'),
('nav_tools', 'Tools', 'الأدوات'),
('nav_pricing', 'Pricing', 'الأسعار'),
('nav_workspace', 'Workspace', 'بيئة العمل')
ON CONFLICT (id) DO NOTHING;
