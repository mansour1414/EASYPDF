import React, { useState } from 'react';
import { Stamp, Image as ImageIcon, Type, Download, Loader2, Sliders, Palette, Move } from 'lucide-react';
import { addWatermark, WatermarkOptions, pdfErrorMessage } from '../lib/pdfOperations';

interface WatermarkToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function WatermarkTool({ pdfBytes, fileName, lang = 'en', onExport }: WatermarkToolProps) {
  const [type, setType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL / سري للغاية');
  const [position, setPosition] = useState<'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('center');
  const [opacity, setOpacity] = useState(0.3);
  const [fontSize, setFontSize] = useState(36);
  const [rotationAngle, setRotationAngle] = useState(45);
  const [colorHex, setColorHex] = useState('#EF4444');
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [imageType, setImageType] = useState<'png' | 'jpg'>('png');
  const [isProcessing, setIsProcessing] = useState(false);
  // Was previously silent-fail on error (console.error only, no visible
  // feedback to the user) — audit, Aug 2026, same fix applied to
  // ESignatureTool.tsx and PageNumbersTool.tsx.
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    setImageType(ext === 'jpg' || ext === 'jpeg' ? 'jpg' : 'png');

    const buffer = await file.arrayBuffer();
    setImageBytes(new Uint8Array(buffer));
  };

  const handleApplyWatermark = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (type === 'image' && !imageBytes) {
        throw new Error(
          lang === 'ar'
            ? 'يرجى رفع صورة الشعار أولاً لاستخدامها كعلامة مائية.'
            : 'Please upload a logo image first to use as the watermark.'
        );
      }

      const options: WatermarkOptions = {
        type,
        text,
        imageBytes: imageBytes || undefined,
        imageType,
        position,
        opacity,
        fontSize,
        rotationAngle,
        colorHex
      };

      const watermarkedBytes = await addWatermark(pdfBytes, options);
      const blob = new Blob([watermarkedBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      onExport({
        name: `Watermarked_${fileName || 'Document.pdf'}`,
        blobUrl,
        size: blob.size
      });
    } catch (err: any) {
      console.error('Failed to add watermark:', err);
      setError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشل تطبيق العلامة المائية' : 'Failed to apply the watermark'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mx-auto p-6 content-card rounded-2xl border border-white/10">
      {/* Controls Column */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-on-surface border-b border-white/10 pb-3">
          <Stamp className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-base">
            {lang === 'ar' ? 'إعدادات العلامة المائية' : 'Watermark Configuration'}
          </h3>
        </div>

        {/* Type selector */}
        <div className="flex rounded-xl bg-surface-bright p-1 border border-white/10">
          <button
            onClick={() => setType('text')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              type === 'text' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'علامة نصية' : 'Text Watermark'}
          </button>
          <button
            onClick={() => setType('image')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              type === 'image' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'علامة صورة/شعار' : 'Image Watermark'}
          </button>
        </div>

        {type === 'text' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface">
                {lang === 'ar' ? 'نص العلامة المائية' : 'Watermark Text'}
              </label>
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                className="px-3 py-2 bg-surface-bright rounded-lg border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-on-surface">
                  {lang === 'ar' ? 'حجم الخط' : 'Font Size'} ({fontSize}pt)
                </label>
                <input
                  type="range"
                  min="16"
                  max="72"
                  value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="accent-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-on-surface">
                  {lang === 'ar' ? 'درجة الدوران' : 'Rotation'} ({rotationAngle}°)
                </label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={rotationAngle}
                  onChange={e => setRotationAngle(Number(e.target.value))}
                  className="accent-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-on-surface flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-primary" />
                {lang === 'ar' ? 'لون النص' : 'Color'}
              </label>
              <input
                type="color"
                value={colorHex}
                onChange={e => setColorHex(e.target.value)}
                className="w-10 h-7 rounded bg-transparent cursor-pointer border border-white/10"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'رفع صورة الشعار (PNG/JPG)' : 'Upload Logo Image (PNG/JPG)'}
            </label>
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleImageUpload}
              className="text-xs text-on-surface-variant file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-surface-bright file:text-xs file:text-primary hover:file:bg-white/10"
            />
          </div>
        )}

        {/* Position Grid */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-on-surface flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5 text-primary" />
            {lang === 'ar' ? 'موقع العلامة المائية' : 'Position'}
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {/* NOTE (audit, Aug 2026): this grid previously had 'center'
                listed twice (positions 2 and 5), which — since React keys
                buttons by array index, not id — created two visually
                distinct buttons that both activated and highlighted for
                the exact same 'center' value. Clicking either did the
                same thing, and whenever 'center' was selected, BOTH
                buttons lit up as "active" at once, which looked broken.
                WatermarkOptions only supports these 5 real positions, so
                the grid now shows exactly 5 buttons instead of a 6th
                slot that was really just a dead duplicate. */}
            {[
              { id: 'top-left', label: 'Top Left' },
              { id: 'center', label: 'Center' },
              { id: 'top-right', label: 'Top Right' },
              { id: 'bottom-left', label: 'Bottom Left' },
              { id: 'bottom-right', label: 'Bottom Right' }
            ].map((pos) => (
              <button
                key={pos.id}
                onClick={() => setPosition(pos.id as any)}
                className={`py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  position === pos.id 
                    ? 'bg-primary/20 border-primary text-primary font-bold' 
                    : 'bg-surface-bright border-white/5 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>

        {/* Opacity slider */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface flex items-center justify-between">
            <span>{lang === 'ar' ? 'درجة الشفافية (Opacity)' : 'Opacity'}</span>
            <span className="font-mono text-primary">{Math.round(opacity * 100)}%</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={opacity}
            onChange={e => setOpacity(Number(e.target.value))}
            className="accent-primary"
          />
        </div>

        {error && (
          <div className="w-full text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleApplyWatermark}
          disabled={isProcessing}
          className="mt-2 py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
          {lang === 'ar' ? 'تطبيق العلامة المائية وتصدير PDF' : 'Apply Watermark & Save PDF'}
        </button>
      </div>

{/* Visual Live Preview Box */}
      <div className="flex flex-col items-center justify-center content-card rounded-xl p-6 border border-white/10 relative overflow-hidden min-h-[280px]">
        <div className="text-xs font-mono text-on-surface-variant absolute top-3 left-3 bg-surface-container/80 px-2 py-0.5 rounded">
          {lang === 'ar' ? 'معاينة الموقع والنمط' : 'Live Style Preview'}
        </div>

        <div className="w-48 h-64 bg-surface-container border border-white/20 rounded shadow-2xl relative flex items-center justify-center overflow-hidden">
          {type === 'text' ? (
            <div
              style={{
                color: colorHex,
                opacity,
                transform: `rotate(${rotationAngle}deg)`,
                fontSize: `${Math.max(12, fontSize / 2.5)}px`
              }}
              className="font-bold text-center select-none pointer-events-none px-2"
            >
              {text}
            </div>
          ) : (
            <div style={{ opacity }} className="flex flex-col items-center justify-center gap-1 text-primary">
              <ImageIcon className="w-10 h-10" />
              <span className="text-xs font-mono">{lang === 'ar' ? 'الشعار المرفق' : 'Logo Asset'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
