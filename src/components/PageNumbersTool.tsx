import React, { useState } from 'react';
import { Hash, AlignLeft, AlignCenter, AlignRight, Download, Loader2 } from 'lucide-react';
import { addPageNumbers, PageNumberOptions, pdfErrorMessage } from '../lib/pdfOperations';

interface PageNumbersToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function PageNumbersTool({ pdfBytes, fileName, lang = 'en', onExport }: PageNumbersToolProps) {
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center'>('bottom-center');
  const [format, setFormat] = useState('Page {n} of {total}');
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(10);
  const [colorHex, setColorHex] = useState('#333333');
  const [isProcessing, setIsProcessing] = useState(false);
  // Was previously silent-fail on error (audit, Aug 2026).
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setError(null);

    try {
      const options: PageNumberOptions = {
        position,
        format,
        startNumber,
        fontSize,
        colorHex
      };

      const numberedBytes = await addPageNumbers(pdfBytes, options);
      const blob = new Blob([numberedBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      onExport({
        name: `Numbered_${fileName || 'Document.pdf'}`,
        blobUrl,
        size: blob.size
      });
    } catch (err: any) {
      console.error('Failed to add page numbers:', err);
      setError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشلت إضافة أرقام الصفحات' : 'Failed to add page numbers'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto w-full p-6 content-card rounded-2xl border border-white/10">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
          <Hash className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-display font-bold text-base text-on-surface">
            {lang === 'ar' ? 'أداة ترقيم الصفحات التلقائية' : 'Automated Page Numbering'}
          </h3>
          <p className="text-xs text-on-surface-variant">
            {lang === 'ar' ? 'إضافة وتخصيص أرقام الصفحات عبر كامل المستند' : 'Insert and customize page numbers across all PDF pages'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Template format input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-on-surface">
            {lang === 'ar' ? 'صيغة الترقيم (استخدم {n} للرقم و {total} للمجموع)' : 'Number Format ({n} = page, {total} = count)'}
          </label>
          <input
            type="text"
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="px-3.5 py-2 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary font-mono"
          />
          <div className="flex gap-2">
            {['Page {n} of {total}', '{n}', 'صفحة {n} من {total}', '{n} / {total}'].map((preset, i) => (
              <button
                key={i}
                onClick={() => setFormat(preset)}
                className="text-xs font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Position Grid */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-on-surface">
            {lang === 'ar' ? 'موقع الأرقام بالصفحة' : 'Page Position'}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'top-center', label: 'Top Center' },
              { id: 'top-right', label: 'Top Right' },
              { id: 'bottom-left', label: 'Bottom Left' },
              { id: 'bottom-center', label: 'Bottom Center' },
              { id: 'bottom-right', label: 'Bottom Right' }
            ].map(pos => (
              <button
                key={pos.id}
                onClick={() => setPosition(pos.id as any)}
                className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                  position === pos.id
                    ? 'bg-primary text-on-primary border-primary shadow-sm font-bold'
                    : 'bg-surface-bright border-white/5 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'رقم بداية الترقيم' : 'Start Number'}
            </label>
            <input
              type="number"
              min="1"
              value={startNumber}
              onChange={e => setStartNumber(Number(e.target.value))}
              className="px-3 py-2 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'حجم الخط (pt)' : 'Font Size (pt)'}
            </label>
            <input
              type="number"
              min="8"
              max="24"
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              className="px-3 py-2 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface"
            />
          </div>
        </div>

        {error && (
          <div className="w-full text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleApply}
          disabled={isProcessing}
          className="mt-3 py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
          {lang === 'ar' ? 'إضافة الترقيم وتصدير المستند' : 'Insert Page Numbers & Save'}
        </button>
      </div>
    </div>
  );
}
