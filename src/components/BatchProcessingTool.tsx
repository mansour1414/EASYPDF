import React, { useState } from 'react';
import { Files, Play, Download, CheckCircle, Loader2, Minimize, Lock, Stamp, FileText, Trash2 } from 'lucide-react';
import { FileItem } from '../types';
import { compressPdf, protectPdf, addWatermark, pdfErrorMessage } from '../lib/pdfOperations';
import { AnimatedCounter } from './AnimatedFeedback';

interface BatchProcessingToolProps {
  files: FileItem[];
  lang?: 'ar' | 'en';
  onClearFiles: () => void;
  onRemoveFile: (id: string) => void;
}

interface BatchResultItem {
  id: string;
  name: string;
  status: 'idle' | 'processing' | 'done' | 'error';
  progress: number;
  blobUrl?: string;
  size?: number;
  error?: string;
}

export default function BatchProcessingTool({ files, lang = 'en', onClearFiles, onRemoveFile }: BatchProcessingToolProps) {
  const [operation, setOperation] = useState<'compress' | 'protect' | 'watermark'>('compress');
  const [password, setPassword] = useState('Password123!');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRunBatch = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    const initialResults: BatchResultItem[] = files.map(f => ({
      id: f.id,
      name: f.name,
      status: 'idle',
      progress: 0
    }));
    setBatchResults(initialResults);

    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];
      if (!fileItem.data) continue;

      setBatchResults(prev => prev.map(r => r.id === fileItem.id ? { ...r, status: 'processing', progress: 30 } : r));

      try {
        let outputBytes = fileItem.data;

        if (operation === 'protect') {
          outputBytes = await protectPdf(fileItem.data, password);
        } else if (operation === 'watermark') {
          outputBytes = await addWatermark(fileItem.data, {
            type: 'text',
            text: watermarkText,
            position: 'center',
            opacity: 0.3,
            fontSize: 32,
            rotationAngle: 45,
            colorHex: '#EF4444'
          });
        } else {
          // Compress mode
          outputBytes = await compressPdf(fileItem.data);
        }

        const blob = new Blob([outputBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        setBatchResults(prev => prev.map(r => 
          r.id === fileItem.id 
            ? { 
                ...r, 
                status: 'done', 
                progress: 100, 
                blobUrl, 
                size: blob.size,
                name: `${operation.toUpperCase()}_${fileItem.name}`
              } 
            : r
        ));
      } catch (err: any) {
        console.error(`Error processing batch file ${fileItem.name}:`, err);
        // Was previously silent — status was tracked as 'error' in state
        // but no branch in the render below ever displayed it, so a
        // failed file just showed nothing next to it, indistinguishable
        // from being silently stuck. Now shows a visible error with the
        // actual message (audit, Aug 2026).
        setBatchResults(prev => prev.map(r => r.id === fileItem.id ? { ...r, status: 'error', progress: 0, error: pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشلت المعالجة' : 'Processing failed') } : r));
      }
    }

    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full p-6 content-card rounded-2xl border border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Files className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base text-on-surface">
              {lang === 'ar' ? 'المعاملات الجماعية المتزامنة (Batch Processor)' : 'Concurrent Batch Queue Processor'}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {lang === 'ar' ? 'تنفيذ عملية واحدة على مجموعة ملفات دفعة واحدة' : 'Apply the same action across multiple files simultaneously'}
            </p>
          </div>
        </div>

        <button
          onClick={onClearFiles}
          className="text-xs text-on-surface-variant hover:text-error flex items-center gap-1 bg-surface-bright px-3 py-1.5 rounded-lg border border-white/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {lang === 'ar' ? 'تفراغ القائمة' : 'Clear Queue'}
        </button>
      </div>

      {/* Operation selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { id: 'compress', label: lang === 'ar' ? 'ضغط جميع الملفات' : 'Compress Batch', icon: Minimize },
          { id: 'protect', label: lang === 'ar' ? 'حماية بكلمة سر' : 'Protect Batch', icon: Lock },
          { id: 'watermark', label: lang === 'ar' ? 'إضافة علامة مائية' : 'Watermark Batch', icon: Stamp },
        ].map(op => {
          const IconComponent = op.icon;
          return (
            <button
              key={op.id}
              onClick={() => setOperation(op.id as any)}
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                operation === op.id
                  ? 'bg-primary text-on-primary border-primary shadow-md'
                  : 'bg-surface-bright text-on-surface-variant border-white/10 hover:text-on-surface'
              }`}
            >
              <IconComponent className="w-4 h-4" />
              {op.label}
            </button>
          );
        })}
      </div>

      {operation === 'protect' && (
        <div className="flex flex-col gap-1 text-xs">
          <label className="text-on-surface font-medium">{lang === 'ar' ? 'كلمة المرور الموحدة' : 'Batch Password'}</label>
          <input
            type="text"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="px-3.5 py-2 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface"
          />
        </div>
      )}

      {operation === 'watermark' && (
        <div className="flex flex-col gap-1 text-xs">
          <label className="text-on-surface font-medium">{lang === 'ar' ? 'نص العلامة المائية الموحد' : 'Batch Watermark Text'}</label>
          <input
            type="text"
            value={watermarkText}
            onChange={e => setWatermarkText(e.target.value)}
            className="px-3.5 py-2 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface"
          />
        </div>
      )}

      {/* Execute Button */}
      <button
        onClick={handleRunBatch}
        disabled={isProcessing || files.length === 0}
        className="py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
        id="btn-run-batch"
      >
        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
        {lang === 'ar' ? `تشغيل الدفعة على (${files.length}) ملفات` : `Process Batch Queue (${files.length} Files)`}
      </button>

      {/* Itemized Queue & Results */}
      <div className="flex flex-col gap-2 mt-2">
        <span className="text-xs font-semibold text-on-surface">
          {lang === 'ar' ? 'قائمة وقيم تقدم المعالجة:' : 'Queue Items & Processing Status:'}
        </span>

        <div className="divide-y divide-white/10 rounded-xl border border-white/10 content-card overflow-hidden">
          {files.map((file) => {
            const result = batchResults.find(r => r.id === file.id);
            const status = result?.status || 'idle';
            const progress = result?.progress || 0;

            return (
              <div key={file.id} className="p-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-on-surface truncate">
                      {result?.name || file.name}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {status === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-primary font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <AnimatedCounter to={progress} className="font-mono font-bold" />
                    </div>
                  )}

                  {status === 'done' && result?.blobUrl && (
                    <a
                      href={result.blobUrl}
                      download={result.name}
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30 hover:bg-emerald-500/30"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {lang === 'ar' ? 'تنزيل' : 'Download'}
                    </a>
                  )}

                  {status === 'idle' && (
                    <span className="text-xs text-on-surface-variant font-mono bg-white/5 px-2 py-1 rounded">
                      {lang === 'ar' ? 'جاهز' : 'Ready'}
                    </span>
                  )}

                  {status === 'error' && (
                    <span
                      title={result?.error}
                      className="px-3 py-1 rounded-lg bg-error/20 text-error text-xs font-semibold flex items-center gap-1 border border-error/30"
                    >
                      {lang === 'ar' ? `فشل: ${result?.error || ''}` : `Failed: ${result?.error || ''}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
