import React, { useState } from 'react';
import { ScanText, Copy, Download, Sparkles, Cpu, Check, Loader2, FileText } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { extractPdfPageImage } from '../lib/pdfRenderer';
import { assertPdfNotEncrypted, pdfErrorMessage } from '../lib/pdfOperations';
import { authenticatedFetch } from '../lib/supabaseClient';

interface OcrToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  lang?: 'ar' | 'en';
}

export default function OcrTool({ pdfBytes, fileName, lang = 'en' }: OcrToolProps) {
  const [mode, setMode] = useState<'local' | 'gemini'>('local');
  const [extractedText, setExtractedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  // True when the last Gemini-mode result came from the backend's labeled
  // `demo: true` fallback (server has no GEMINI_API_KEY configured) rather
  // than a real read of the uploaded page, so the UI can say so instead of
  // presenting simulated sample text as if it were the user's real document.
  const [isDemoResult, setIsDemoResult] = useState(false);

  const handleRunOcr = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setProgress(10);
    setExtractedText('');
    setIsDemoResult(false);

    try {
      await assertPdfNotEncrypted(pdfBytes, fileName);
      // Render the first page to an image up front — needed for local
      // Tesseract OCR, and now also sent to the Gemini endpoint so it
      // actually analyzes the real uploaded page instead of guessing.
      const pageDataUrl = await extractPdfPageImage(pdfBytes, 0, 2.0);
      if (!pageDataUrl) {
        throw new Error('Failed to render page image for OCR.');
      }

      if (mode === 'local') {
        setProgress(30);
        const worker = await createWorker(lang === 'ar' ? 'ara+eng' : 'eng');
        setProgress(60);

        const ret = await worker.recognize(pageDataUrl);
        setExtractedText(ret.data.text || (lang === 'ar' ? 'لم يتم العثور على نصوص واضحة' : 'No text recognized'));
        await worker.terminate();
        setProgress(100);

      } else {
        // Call secure Gemini Vision backend endpoint, sending the actual
        // rendered page image so results reflect the real document.
        setProgress(40);
        const res = await authenticatedFetch('/api/pdf/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lang, fileName, imageBase64: pageDataUrl, mimeType: 'image/png' })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.textLayers && Array.isArray(data.textLayers)) {
            const formatted = data.textLayers.map((b: any) => b.text).join('\n\n');
            setExtractedText(formatted);
            setIsDemoResult(!!data.demo);
          } else {
            setExtractedText(lang === 'ar' ? 'تعذر استخراج النصوص عبر الذكاء الاصطناعي' : 'Could not extract text via Gemini');
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setExtractedText(`OCR Error: ${err.error || res.statusText}`);
        }
        setProgress(100);
      }
    } catch (err: any) {
      console.error('OCR Extraction error:', err);
      setExtractedText(`OCR Error: ${pdfErrorMessage(err, lang) || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    // Was previously fire-and-forget — the "Copied!" checkmark state showed
    // unconditionally even if writeText() rejected (denied permission,
    // insecure context, unfocused document). Now only shows success once
    // the copy actually resolves (audit, Aug 2026).
    navigator.clipboard.writeText(extractedText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      (err) => {
        console.error('Clipboard copy failed:', err);
      }
    );
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OCR_${fileName || 'Extracted_Text'}.txt`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full p-6 content-card rounded-2xl border border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <ScanText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-on-surface">
              {lang === 'ar' ? 'استخراج النصوص من المستندات الممسوحة (OCR)' : 'OCR Scanned Document Text Extractor'}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {lang === 'ar' ? 'تحويل المستندات والصور الممسوحة ضوئياً إلى نصوص قابلة للتعديل والنسخ' : 'Convert scanned documents and images into editable, copyable text'}
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex rounded-xl bg-surface-bright p-1 border border-white/10">
          <button
            onClick={() => setMode('local')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all ${
              mode === 'local' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'مبني بالمؤشر (Tesseract)' : 'Fast Offline (Tesseract)'}
          </button>
          <button
            onClick={() => setMode('gemini')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all ${
              mode === 'gemini' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            {lang === 'ar' ? 'دقة عالية (Gemini AI)' : 'AI Precision (Gemini)'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <button
          onClick={handleRunOcr}
          disabled={isProcessing || !pdfBytes}
          className="w-full py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
          id="btn-run-ocr"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
          {lang === 'ar' ? 'بدء معالجة واستخراج النصوص الآن' : 'Start OCR Text Extraction'}
        </button>

        {isProcessing && (
          <div className="w-full bg-surface-bright rounded-full h-2 overflow-hidden border border-white/10">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
        )}

        {extractedText && (
          <div className="flex flex-col gap-2 mt-2">
            {isDemoResult && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                <span className="font-bold shrink-0">⚠ {lang === 'ar' ? 'نتيجة تجريبية' : 'Simulated result'}</span>
                <span>
                  {lang === 'ar'
                    ? 'خدمة Gemini غير مُفعّلة على الخادم، لذا هذا نص نموذجي وليس استخراجاً حقيقياً من صفحتك.'
                    : "Gemini isn't configured on the server, so this is placeholder sample text — not a real extraction from your page."}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary" />
                {lang === 'ar' ? 'النصوص المستخرجة:' : 'Extracted Document Text:'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-surface-bright hover:bg-white/10 text-xs font-medium text-on-surface flex items-center gap-1 border border-white/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? (lang === 'ar' ? 'تم النسخ!' : 'Copied!') : (lang === 'ar' ? 'نسخ النص' : 'Copy Text')}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-xs font-medium text-primary flex items-center gap-1 border border-primary/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'تنزيل كملف TXT' : 'Export .TXT'}
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={extractedText}
              rows={10}
              className="w-full p-4 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface font-mono leading-relaxed focus:outline-none resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
