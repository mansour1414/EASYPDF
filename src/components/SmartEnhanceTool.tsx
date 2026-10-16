import React, { useState } from 'react';
import { Sparkles, Sliders, FileSpreadsheet, Edit3, Download, Loader2, Check, RefreshCw } from 'lucide-react';
import { authenticatedFetch } from '../lib/supabaseClient';
import { extractPdfPageImage, extractPdfText } from '../lib/pdfRenderer';
import { assertPdfNotEncrypted, pdfErrorMessage } from '../lib/pdfOperations';

interface SmartEnhanceToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function SmartEnhanceTool({ pdfBytes, fileName, lang = 'en', onExport }: SmartEnhanceToolProps) {
  const [activeTab, setActiveTab] = useState<'enhance' | 'rename' | 'extract'>('enhance');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Enhancement States
  const [enhanceResult, setEnhanceResult] = useState<{
    rotationAngle: number;
    brightness: number;
    contrast: number;
    recommendations: string;
  } | null>(null);

  // Renaming States
  const [suggestedName, setSuggestedName] = useState<string>('');
  const [renameReason, setRenameReason] = useState<string>('');

  // Structured Extraction States
  const [extractedData, setExtractedData] = useState<Array<{ key: string; value: string }>>([]);
  const [csvContent, setCsvContent] = useState<string>('');

  // Tracks whether the current result on each tab came from the backend's
  // labeled `demo: true` fallback (no GEMINI_API_KEY configured server-side)
  // rather than a real Gemini read of the document, so the UI can say so
  // instead of presenting simulated sample output as if it were real.
  const [enhanceIsDemo, setEnhanceIsDemo] = useState(false);
  const [renameIsDemo, setRenameIsDemo] = useState(false);
  const [extractIsDemo, setExtractIsDemo] = useState(false);

  // 1. Auto-Enhance Scanned Image
  const handleEnhance = async () => {
    if (!pdfBytes) return;
    setErrorMsg('');
    setEnhanceIsDemo(false);
    setIsProcessing(true);
    try {
      await assertPdfNotEncrypted(pdfBytes);
      const imageBase64 = await extractPdfPageImage(pdfBytes, 0, 2.0);
      if (!imageBase64) {
        throw new Error(lang === 'ar' ? 'تعذر عرض صفحة المستند' : 'Could not render the document page');
      }

      const res = await authenticatedFetch('/api/ai/enhance-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, imageBase64, mimeType: 'image/png' })
      });
      const data = await res.json();
      if (res.ok) {
        setEnhanceResult({
          rotationAngle: data.rotationAngle || 0,
          brightness: data.brightness || 115,
          contrast: data.contrast || 125,
          recommendations: data.recommendations || "Image deskewed and contrast boosted."
        });
        setEnhanceIsDemo(!!data.demo);
      } else {
        setErrorMsg(data.error || (lang === 'ar' ? 'فشل التحليل' : 'Analysis failed'));
      }
    } catch (err: any) {
      console.error('Enhance image failed:', err);
      setErrorMsg(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشل التحليل' : 'Analysis failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Smart Renaming
  const handleSmartRename = async () => {
    if (!pdfBytes) return;
    setErrorMsg('');
    setRenameIsDemo(false);
    setIsProcessing(true);
    try {
      await assertPdfNotEncrypted(pdfBytes);
      const documentText = await extractPdfText(pdfBytes);
      const res = await authenticatedFetch('/api/ai/smart-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText, currentFileName: fileName, lang })
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestedName(data.suggestedFileName || 'SmartDocument.pdf');
        setRenameReason(data.reason || 'Analyzed file title and contents.');
        setRenameIsDemo(!!data.demo);
      } else {
        setErrorMsg(data.error || (lang === 'ar' ? 'فشلت إعادة التسمية' : 'Rename suggestion failed'));
      }
    } catch (err: any) {
      console.error('Smart rename failed:', err);
      setErrorMsg(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشلت إعادة التسمية' : 'Rename suggestion failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Extract Structured Data
  const handleExtractData = async () => {
    if (!pdfBytes) return;
    setErrorMsg('');
    setExtractIsDemo(false);
    setIsProcessing(true);
    try {
      // Prefer the real embedded text layer; fall back to a rendered page
      // image (e.g. for scanned PDFs with no text layer) so Gemini always
      // has real content to extract from.
      await assertPdfNotEncrypted(pdfBytes);
      let documentText = await extractPdfText(pdfBytes);
      let imageBase64: string | null = null;
      if (!documentText) {
        imageBase64 = await extractPdfPageImage(pdfBytes, 0, 2.0);
      }

      const res = await authenticatedFetch('/api/ai/extract-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText, imageBase64, lang })
      });
      const data = await res.json();
      if (res.ok) {
        setExtractedData(data.extractedData || []);
        setCsvContent(data.csvContent || '');
        setExtractIsDemo(!!data.demo);
      } else {
        setErrorMsg(data.error || (lang === 'ar' ? 'فشل الاستخراج' : 'Extraction failed'));
      }
    } catch (err: any) {
      console.error('Extract data failed:', err);
      setErrorMsg(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشل الاستخراج' : 'Extraction failed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Extracted_Data_${fileName || 'Doc'}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full p-6 content-card rounded-2xl border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-on-surface">
              {lang === 'ar' ? 'أدوات الذكاء الاصطناعي الذكية (Gemini Pro)' : 'Gemini AI Smart Suite'}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {lang === 'ar' ? 'تحسين المستندات، إعادة التسمية الذكية، واستخراج الجداول والبيانات' : 'Auto-enhance scans, smart file renaming, and invoice data extraction'}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-surface-bright p-1 border border-white/10">
          <button
            onClick={() => setActiveTab('enhance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all ${
              activeTab === 'enhance' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'تحسين الصور' : 'Auto Enhance'}
          </button>
          <button
            onClick={() => setActiveTab('rename')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all ${
              activeTab === 'rename' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'تسمية ذكية' : 'Smart Rename'}
          </button>
          <button
            onClick={() => setActiveTab('extract')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all ${
              activeTab === 'extract' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'استخراج CSV' : 'Extract Data'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Tab 1: Auto Enhance */}
      {activeTab === 'enhance' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-on-surface-variant">
            {lang === 'ar'
              ? 'يقوم النموذج بتحليل المستند الممسوح ضوئياً وتحديد زاوية الميلان وإعدادات الإضاءة والتباين لرفع وضوح النص.'
              : 'Gemini Vision analyzes your scan to detect deskew angles, shadow reduction, and optimal contrast boost.'}
          </p>

          <button
            onClick={handleEnhance}
            disabled={isProcessing}
            className="py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
            {lang === 'ar' ? 'تحليل وتحسين جودة المسح الضوئي' : 'Analyze & Auto-Enhance Scan Quality'}
          </button>

          {enhanceResult && enhanceIsDemo && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
              <span className="font-bold shrink-0">⚠ {lang === 'ar' ? 'نتيجة تجريبية' : 'Simulated result'}</span>
              <span>
                {lang === 'ar'
                  ? 'خدمة Gemini غير مُفعّلة على الخادم، لذا هذه القيم افتراضية وليست تحليلاً حقيقياً لصفحتك.'
                  : "Gemini isn't configured on the server, so these are placeholder values — not a real analysis of your page."}
              </span>
            </div>
          )}

          {enhanceResult && (
            <div className="p-4 rounded-xl bg-surface-bright border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-bold text-primary">
                <span>{lang === 'ar' ? 'نتائج التحسين التلقائي:' : 'Enhancement Recommendation:'}</span>
                <span className="font-mono text-[11px] bg-primary/20 px-2 py-0.5 rounded text-on-surface">
                  Rotation: {enhanceResult.rotationAngle}°
                </span>
              </div>
              <p className="text-xs text-on-surface leading-relaxed">
                {enhanceResult.recommendations}
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono border-t border-white/5">
                <div className="bg-white/5 p-2 rounded">Brightness Boost: {enhanceResult.brightness}%</div>
                <div className="bg-white/5 p-2 rounded">Contrast Boost: {enhanceResult.contrast}%</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Smart Rename */}
      {activeTab === 'rename' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-on-surface-variant">
            {lang === 'ar'
              ? 'تحليل محتوى المستند وتوليد اسم ملف احترافي ومنظم بناءً على النوع والجهة والتاريخ.'
              : 'Gemini inspects the document summary and proposes a clean, standardized filename for your archive.'}
          </p>

          <button
            onClick={handleSmartRename}
            disabled={isProcessing}
            className="py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
            {lang === 'ar' ? 'توليد اسم ذكي للمستند' : 'Suggest Smart Filename'}
          </button>

          {suggestedName && renameIsDemo && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
              <span className="font-bold shrink-0">⚠ {lang === 'ar' ? 'نتيجة تجريبية' : 'Simulated result'}</span>
              <span>
                {lang === 'ar'
                  ? 'خدمة Gemini غير مُفعّلة على الخادم، لذا هذا اسم عام وليس مبنياً على محتوى مستندك الفعلي.'
                  : "Gemini isn't configured on the server, so this is a generic name — not based on your document's real content."}
              </span>
            </div>
          )}

          {suggestedName && (
            <div className="p-4 rounded-xl bg-surface-bright border border-white/10 flex flex-col gap-2">
              <span className="text-xs font-medium text-on-surface-variant">
                {lang === 'ar' ? 'الاسم المقترح:' : 'Suggested Filename:'}
              </span>
              <div className="text-sm font-mono font-bold text-emerald-400 bg-black/40 p-3 rounded-lg border border-emerald-500/30">
                {suggestedName}
              </div>
              <p className="text-xs text-on-surface-variant italic mt-1">
                {renameReason}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Extract Data */}
      {activeTab === 'extract' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-on-surface-variant">
            {lang === 'ar'
              ? 'استخراج كافة الحقول الهيكلية والجداول (مثل الفواتير وإيصالات الدفع) وتصديرها كجدول بيانات CSV.'
              : 'Extract key invoice and receipt fields into structured JSON and export directly as CSV spreadsheet.'}
          </p>

          <button
            onClick={handleExtractData}
            disabled={isProcessing}
            className="py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {lang === 'ar' ? 'استخراج الحقول والجداول الهيكلية' : 'Extract Structured Document Fields'}
          </button>

          {extractedData.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface">
                  {lang === 'ar' ? 'البيانات المستخرجة:' : 'Extracted Key-Value Table:'}
                </span>
                <button
                  onClick={downloadCsv}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'تنزيل كملف CSV' : 'Export .CSV'}
                </button>
              </div>

              <div className="rounded-xl border border-white/10 overflow-hidden bg-surface-bright">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/5 border-b border-white/10 text-on-surface font-semibold">
                    <tr>
                      <th className="p-3">{lang === 'ar' ? 'الحقل / المفتاح' : 'Field Name'}</th>
                      <th className="p-3">{lang === 'ar' ? 'القيمة المستخرجة' : 'Extracted Value'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-on-surface-variant">
                    {extractedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="p-3 font-medium text-on-surface">{row.key}</td>
                        <td className="p-3 font-mono">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
