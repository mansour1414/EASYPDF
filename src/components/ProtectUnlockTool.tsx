import React, { useState } from 'react';
import { Lock, Unlock, ShieldCheck, Key, Download, Loader2 } from 'lucide-react';
import { protectPdf, unlockPdf, pdfErrorMessage } from '../lib/pdfOperations';

interface ProtectUnlockToolProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  mode: 'protect' | 'unlock';
  lang?: 'ar' | 'en';
  onExport: (result: { name: string; blobUrl: string; size: number }) => void;
}

export default function ProtectUnlockTool({ pdfBytes, fileName, mode, lang = 'en', onExport }: ProtectUnlockToolProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcess = async () => {
    if (!pdfBytes) return;
    setError(null);

    if (mode === 'protect') {
      if (!password) {
        setError(lang === 'ar' ? 'الرجاء إدخال كلمة المرور' : 'Please enter a password');
        return;
      }
      if (password !== confirmPassword) {
        setError(lang === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match');
        return;
      }

      setIsProcessing(true);
      try {
        const encryptedBytes = await protectPdf(pdfBytes, password);
        const blob = new Blob([encryptedBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        onExport({
          name: `Protected_${fileName || 'Document.pdf'}`,
          blobUrl,
          size: blob.size
        });
      } catch (err: any) {
        setError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'فشلت عملية تشفير المستند' : 'Failed to encrypt document'));
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Unlock PDF mode
      setIsProcessing(true);
      try {
        const unlockedBytes = await unlockPdf(pdfBytes, password || undefined);
        const blob = new Blob([unlockedBytes], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        onExport({
          name: `Unlocked_${fileName || 'Document.pdf'}`,
          blobUrl,
          size: blob.size
        });
      } catch (err: any) {
        setError(pdfErrorMessage(err, lang) || (lang === 'ar' ? 'كلمة المرور غير صحيحة أو يتعذر فك التشفير' : 'Incorrect password or decryption failed'));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 max-w-xl mx-auto w-full p-6 content-card rounded-2xl border border-white/10">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
        {mode === 'protect' ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
      </div>

      <div className="text-center">
        <h3 className="text-xl font-display font-bold text-on-surface">
          {mode === 'protect' 
            ? (lang === 'ar' ? 'تشفير وحماية المستند' : 'Protect PDF Document')
            : (lang === 'ar' ? 'إزالة كلمة المرور وفك الحماية' : 'Unlock PDF Document')}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          {mode === 'protect'
            ? (lang === 'ar' ? 'قم بإدخال كلمة مرور قوية لتشفيير ملف الـ PDF' : 'Enter a strong password to restrict unauthorized access')
            : (lang === 'ar' ? 'أدخل كلمة المرور الحالية لفك حماية المستند وتنزيله بدون قيود' : 'Enter current password if set to decrypt and remove restrictions')}
        </p>
      </div>

      {error && (
        <div className="w-full text-xs text-error bg-error/10 border border-error/20 p-3 rounded-lg text-center">
          {error}
        </div>
      )}

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-on-surface flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-primary" />
            {lang === 'ar' ? 'كلمة المرور' : 'Password'}
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={lang === 'ar' ? 'أدخل كلمة المرور...' : 'Enter password...'}
            className="w-full px-4 py-2.5 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary"
            id="input-pdf-password"
          />
        </div>

        {mode === 'protect' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-on-surface flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              {lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={lang === 'ar' ? 'أعد إدخال كلمة المرور...' : 'Re-enter password...'}
              className="w-full px-4 py-2.5 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary"
              id="input-pdf-confirm-password"
            />
          </div>
        )}

        <button
          onClick={handleProcess}
          disabled={isProcessing}
          className="w-full mt-2 py-3 bg-primary hover:bg-primary-hover text-on-primary rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer"
          id="btn-execute-protect-unlock"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : mode === 'protect' ? (
            <Lock className="w-4 h-4" />
          ) : (
            <Unlock className="w-4 h-4" />
          )}
          {mode === 'protect'
            ? (lang === 'ar' ? 'تطبيق التشفير وحفظ الملف' : 'Encrypt & Protect PDF')
            : (lang === 'ar' ? 'فك الحماية وتنزيل المستند' : 'Unlock & Save PDF')}
        </button>
      </div>
    </div>
  );
}
