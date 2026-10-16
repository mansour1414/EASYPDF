import React, { useState, useRef } from 'react';
import { PenTool, Upload, Type, Eraser, Check, Loader2, Move } from 'lucide-react';
import { addSignatureToPdf, SignatureOptions, pdfErrorMessage } from '../lib/pdfOperations';

interface ESignatureToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  pageCount?: number;
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function ESignatureTool({ pdfBytes, fileName, pageCount = 1, lang = 'en', onExport }: ESignatureToolProps) {
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('John Doe');
  const [targetPage, setTargetPage] = useState(0);
  const [xPercent, setXPercent] = useState(70);
  const [yPercent, setYPercent] = useState(80);
  const [sigWidth, setSigWidth] = useState(140);
  const [sigHeight, setSigHeight] = useState(60);
  const [isProcessing, setIsProcessing] = useState(false);
  // Was previously silent-fail on error (console.error only, no visible
  // feedback) — e.g. clicking "Place Signature" with nothing drawn/typed/
  // uploaded just stopped the spinner with zero explanation. Now surfaced
  // to the user like ProtectUnlockTool.tsx already does (audit, Aug 2026).
  const [error, setError] = useState<string | null>(null);

  // Drawing Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploadedSigBytes, setUploadedSigBytes] = useState<Uint8Array | null>(null);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setUploadedSigBytes(new Uint8Array(buffer));
  };

  // Convert drawn signature or typed signature to PNG Uint8Array
  const getSignaturePngBytes = async (): Promise<Uint8Array | null> => {
    if (activeTab === 'upload' && uploadedSigBytes) {
      return uploadedSigBytes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 300;
    tempCanvas.height = 120;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    if (activeTab === 'draw' && canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, 0, 300, 120);
    } else if (activeTab === 'type') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 120);
      ctx.font = 'italic bold 32px cursive, Georgia, serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName || 'Signature', 150, 60);
    }

    return new Promise(resolve => {
      tempCanvas.toBlob(async blob => {
        if (blob) {
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        } else {
          resolve(null);
        }
      }, 'image/png');
    });
  };

  const handleApplySignature = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setError(null);

    try {
      const sigPngBytes = await getSignaturePngBytes();
      if (!sigPngBytes) {
        throw new Error(
          lang === 'ar'
            ? 'لم يتم إنشاء أي توقيع بعد. ارسم توقيعاً، اكتب اسماً، أو ارفع صورة أولاً.'
            : 'No signature was created yet. Draw a signature, type a name, or upload an image first.'
        );
      }

      const options: SignatureOptions = {
        imageBytes: sigPngBytes,
        pageIndex: targetPage,
        xPercent,
        yPercent,
        width: sigWidth,
        height: sigHeight
      };

      const signedBytes = await addSignatureToPdf(pdfBytes, options);
      const blob = new Blob([signedBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      onExport({
        name: `Signed_${fileName || 'Document.pdf'}`,
        blobUrl,
        size: blob.size
      });
    } catch (err: any) {
      console.error('Failed to embed e-signature:', err);
      setError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشل تثبيت التوقيع على المستند' : 'Failed to place the signature on the document'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mx-auto p-6 content-card rounded-2xl border border-white/10">
      {/* Signature Creation Side */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <PenTool className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-base text-on-surface">
            {lang === 'ar' ? 'إنشاء التوقيع الإلكتروني' : 'Create E-Signature'}
          </h3>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-surface-bright p-1 border border-white/10">
          <button
            onClick={() => setActiveTab('draw')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'draw' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'رسم' : 'Draw'}
          </button>
          <button
            onClick={() => setActiveTab('type')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'type' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'كتابة' : 'Type'}
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'upload' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'رفع' : 'Upload'}
          </button>
        </div>

        {activeTab === 'draw' && (
          <div className="flex flex-col gap-2">
            <div className="relative border border-white/20 rounded-xl bg-white overflow-hidden shadow-inner">
              <canvas
                ref={canvasRef}
                width={300}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-28 cursor-crosshair touch-none"
              />
            </div>
            <button
              onClick={clearCanvas}
              className="self-end text-xs text-on-surface-variant hover:text-error flex items-center gap-1 px-2 py-1"
            >
              <Eraser className="w-3.5 h-3.5" />
              {lang === 'ar' ? 'مسح التوقيع' : 'Clear Canvas'}
            </button>
          </div>
        )}

        {activeTab === 'type' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'اكتب اسمك للتحويل إلى توقيع خطي' : 'Type name for cursive signature'}
            </label>
            <input
              type="text"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              className="px-3.5 py-2.5 bg-surface-bright rounded-xl border border-white/10 text-sm text-on-surface font-serif italic"
            />
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'رفع صورة التوقيع (PNG شفافة أو JPG)' : 'Upload signature image'}
            </label>
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleImageUpload}
              className="text-xs text-on-surface-variant file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-surface-bright file:text-xs file:text-primary hover:file:bg-white/10"
            />
          </div>
        )}

        {/* Page and Placement Controls */}
        <div className="flex flex-col gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-on-surface">
              {lang === 'ar' ? 'الصفحة المستهدفة للتوقيع' : 'Target Page'}
            </label>
            <select
              value={targetPage}
              onChange={e => setTargetPage(Number(e.target.value))}
              className="px-3 py-1 bg-surface-bright rounded-lg border border-white/10 text-xs text-on-surface"
            >
              {Array.from({ length: pageCount }).map((_, i) => (
                <option key={i} value={i}>
                  {lang === 'ar' ? `الصفحة ${i + 1}` : `Page ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface">
                {lang === 'ar' ? 'الموقع الأفقي (X)' : 'Position X'} ({xPercent}%)
              </label>
              <input
                type="range"
                min="0"
                max="85"
                value={xPercent}
                onChange={e => setXPercent(Number(e.target.value))}
                className="accent-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface">
                {lang === 'ar' ? 'الموقع العمودي (Y)' : 'Position Y'} ({yPercent}%)
              </label>
              <input
                type="range"
                min="0"
                max="90"
                value={yPercent}
                onChange={e => setYPercent(Number(e.target.value))}
                className="accent-primary"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="w-full text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleApplySignature}
          disabled={isProcessing}
          className="mt-2 py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
          {lang === 'ar' ? 'تثبيت التوقيع وتصدير المستند' : 'Place Signature & Export PDF'}
        </button>
      </div>

{/* Page Preview Simulation Box */}
      <div className="flex flex-col items-center justify-center content-card rounded-xl p-4 border border-white/10 relative overflow-hidden min-h-[300px]">
        <div className="text-xs font-mono text-on-surface-variant absolute top-3 left-3 bg-surface-container/80 px-2 py-0.5 rounded">
          {lang === 'ar' ? `معاينة الصفحة #${targetPage + 1}` : `Page #${targetPage + 1} Target Preview`}
        </div>

        <div className="w-52 h-72 bg-surface-container border border-white/20 rounded shadow-2xl relative overflow-hidden">
          {/* Simulated Signature Placement Badge */}
          <div
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 bg-primary/20 border-2 border-primary rounded px-2 py-1 flex items-center gap-1 text-xs font-bold text-primary shadow-lg backdrop-blur-sm pointer-events-none"
          >
            <PenTool className="w-3 h-3" />
            <span>{typedName || 'Signature'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
