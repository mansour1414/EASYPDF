import React, { useState, useEffect } from 'react';
import { Reorder } from 'motion/react';
import { 
  RotateCw, Trash2, ArrowLeft, ArrowRight, Plus, Download, 
  Layers, CheckCircle, Loader2, Sparkles, RefreshCw, GripVertical
} from 'lucide-react';
import { renderPdfThumbnails, PageThumbnail } from '../lib/pdfRenderer';
import { manipulatePages, assertPdfNotEncrypted, pdfErrorMessage } from '../lib/pdfOperations';

interface VisualPageManagerProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function VisualPageManager({ pdfBytes, fileName, lang = 'en', onExport }: VisualPageManagerProps) {
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [appendFiles, setAppendFiles] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // Was previously silent-fail on error in both loadThumbnails and
  // handleApplyChanges (console.error only) — e.g. a corrupt/unusual PDF
  // that fails thumbnail rendering just showed an empty grid with zero
  // explanation. Now surfaced to the user (audit, Aug 2026).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (pdfBytes) {
      loadThumbnails(pdfBytes);
    }
  }, [pdfBytes]);

  const loadThumbnails = async (bytes: Uint8Array) => {
    setLoading(true);
    setLoadError(null);
    try {
      // pdf.js cannot render encrypted PDFs: say \"unlock it first\" clearly.
      await assertPdfNotEncrypted(bytes, fileName);
      const thumbs = await renderPdfThumbnails(bytes, 100, 0.35);
      setThumbnails(thumbs);
      setPageOrder(thumbs.map(t => t.pageIndex));
      setRotations({});
    } catch (err: any) {
      console.error('Failed to load page thumbnails:', err);
      setLoadError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'تعذر عرض صفحات المستند' : "Couldn't render this document's pages"));
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = (origIndex: number) => {
    setRotations(prev => ({
      ...prev,
      [origIndex]: ((prev[origIndex] || 0) + 90) % 360
    }));
  };

  const handleDelete = (orderIndex: number) => {
    setPageOrder(prev => prev.filter((_, idx) => idx !== orderIndex));
  };

  const handleMove = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === pageOrder.length - 1) return;

    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    const newOrder = [...pageOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setPageOrder(newOrder);
  };

  const handleAppendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    setAppendFiles(prev => [...prev, { name: file.name, bytes }]);
  };

  const handleApplyChanges = async () => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setApplyError(null);
    try {
      const extraPdfs = appendFiles.map(f => f.bytes);
      const modifiedBytes = await manipulatePages(pdfBytes, pageOrder, rotations, extraPdfs);
      const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const outName = `Managed_${fileName || 'Document.pdf'}`;

      onExport({
        name: outName,
        blobUrl,
        size: blob.size
      });
    } catch (err: any) {
      console.error('Error manipulating PDF pages:', err);
      setApplyError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشل تطبيق التعديلات على الصفحات' : 'Failed to apply the page changes'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-medium">
          {lang === 'ar' ? 'جاري استخراج صور المصغرات لكافة الصفحات...' : 'Rendering visual page thumbnails...'}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error border border-error/20">
          <Layers className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-error">{loadError}</p>
        <button
          onClick={() => pdfBytes && loadThumbnails(pdfBytes)}
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-bright hover:bg-white/10 text-xs font-semibold text-on-surface border border-white/10 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header controls bar */}
      <div className="content-card p-4 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-on-surface">
          <Layers className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">
            {lang === 'ar' 
              ? `إدارة الصفحات (${pageOrder.length} صفحة متبقية)` 
              : `Visual Page Manager (${pageOrder.length} pages remaining)`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-bright hover:bg-white/10 text-xs font-medium text-on-surface border border-white/10 cursor-pointer transition-colors">
            <Plus className="w-4 h-4 text-primary" />
            {lang === 'ar' ? 'إضافة صفحات من PDF آخر' : 'Append PDF Pages'}
            <input type="file" accept="application/pdf" onChange={handleAppendFile} className="hidden" />
          </label>

          <button
            onClick={handleApplyChanges}
            disabled={isProcessing || pageOrder.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold shadow-md transition-all disabled:opacity-50"
            id="btn-apply-page-manager"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {lang === 'ar' ? 'تصدير المستند المعدل' : 'Export Modified PDF'}
          </button>
        </div>
      </div>

      {appendFiles.length > 0 && (
        <div className="content-card p-3 py-2 rounded-lg border border-primary/20 bg-primary/5 flex flex-wrap gap-2 text-xs text-primary">
          <span>{lang === 'ar' ? 'الملفات المدمجة الإضافية:' : 'Appended Extra Files:'}</span>
          {appendFiles.map((f, i) => (
            <span key={i} className="font-mono bg-surface-bright px-2 py-0.5 rounded text-on-surface">
              {f.name}
            </span>
          ))}
        </div>
      )}

      {applyError && (
        <div className="text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg text-center">
          {applyError}
        </div>
      )}

      {/* Grid of Page Thumbnails with Reorder.Group */}
      <Reorder.Group
        values={pageOrder}
        onReorder={setPageOrder}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
      >
        {pageOrder.map((origIndex, currentIdx) => {
          const thumb = thumbnails.find(t => t.pageIndex === origIndex);
          const currentRotation = rotations[origIndex] || 0;

          return (
    <Reorder.Item 
      key={origIndex}
      value={origIndex}
      whileDrag={{ scale: 1.05, zIndex: 30, boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}
      className="content-card group relative flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
    >
              {/* Page Number Badge & Drag Grip */}
              <div className="absolute top-2 left-2 z-10 bg-black/80 text-on-surface font-mono text-xs px-2 py-0.5 rounded-full border border-white/20 flex items-center gap-1">
                <GripVertical className="w-3 h-3 text-neutral-400" />
                #{currentIdx + 1} ({lang === 'ar' ? 'أصلي' : 'Orig'} #{origIndex + 1})
              </div>

              {/* Thumbnail Canvas Preview with Rotation */}
              <div className="w-full h-44 flex items-center justify-center overflow-hidden rounded-lg bg-white/5 p-1 relative mt-4">
                {thumb ? (
                  <img 
                    src={thumb.dataUrl} 
                    alt={`Page ${origIndex + 1}`}
                    style={{ transform: `rotate(${currentRotation}deg)` }}
                    className="max-h-full max-w-full object-contain shadow-md pointer-events-none"
                  />
                ) : (
                  <div className="text-xs text-on-surface-variant">
                    {lang === 'ar' ? 'صفحة مضافة' : 'Appended Page'}
                  </div>
                )}
              </div>

              {/* Quick Action Overlay Controls */}
              <div className="flex items-center justify-between w-full mt-2.5 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMove(currentIdx, 'left'); }}
                  disabled={currentIdx === 0}
                  className="p-1 rounded bg-surface-bright hover:bg-white/10 text-on-surface-variant disabled:opacity-30 cursor-pointer"
                  title="Move Left"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRotate(origIndex); }}
                  className="p-1 rounded bg-surface-bright hover:bg-primary/20 text-primary cursor-pointer"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(currentIdx); }}
                  className="p-1 rounded bg-surface-bright hover:bg-error/20 text-error cursor-pointer"
                  title="Delete Page"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMove(currentIdx, 'right'); }}
                  disabled={currentIdx === pageOrder.length - 1}
                  className="p-1 rounded bg-surface-bright hover:bg-white/10 text-on-surface-variant disabled:opacity-30 cursor-pointer"
                  title="Move Right"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </div>
  );
}
