import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import LogoImage from './LogoImage';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

// Shown when Supabase fires a PASSWORD_RECOVERY auth event (the user landed
// on the app via the "reset your password" email link). Lets them actually
// set a new password — closing the loop that the "Forgot password?" link
// in AuthModal.tsx starts. Without this, clicking the emailed reset link
// signed the user into a temporary recovery session with no way to act on it.
export default function ResetPasswordModal({ isOpen, onClose, lang }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const isAr = lang === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password.length < 6) {
      setErrorMsg(isAr ? 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل' : 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccessMsg(isAr ? 'تم تحديث كلمة المرور بنجاح!' : 'Your password has been updated successfully!');
      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Update password error:', err);
      setErrorMsg(err.message || (isAr ? 'تعذر تحديث كلمة المرور. حاول مرة أخرى.' : 'Could not update password. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fadeIn"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="auth-panel-in glass-panel rounded-3xl p-6 sm:p-8 max-w-md w-full relative border border-white/10 shadow-2xl bg-surface/95 text-on-surface z-10">
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="relative mb-3">
            <span className="auth-logo-glow" aria-hidden="true" />
            <LogoImage className="h-20 w-auto" alt="EasyPDF Logo" hero />
          </div>
          <h2 className="text-2xl font-display font-bold tracking-tight text-on-surface">
            {isAr ? 'تعيين كلمة مرور جديدة' : 'Set a New Password'}
          </h2>
          <p className="text-xs text-on-surface-variant mt-1.5 max-w-xs">
            {isAr ? 'أدخل كلمة مرور جديدة لحسابك.' : 'Choose a new password for your account.'}
          </p>
        </div>

        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2 font-medium animate-fadeIn">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2 font-medium animate-fadeIn">
            <span className="shrink-0 font-bold">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-left rtl:text-right">
            <label className="text-xs font-semibold text-on-surface-variant">
              {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 rtl:left-auto rtl:right-3.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 rtl:pl-10 rtl:pr-10 py-3 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50"
                id="input-new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 rtl:right-auto rtl:left-3.5 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer p-1.5 -m-1.5"
                aria-label={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-left rtl:text-right">
            <label className="text-xs font-semibold text-on-surface-variant">
              {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 rtl:left-auto rtl:right-3.5 w-4 h-4 text-on-surface-variant pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-3 bg-surface-bright rounded-xl border border-white/10 text-xs text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50"
                id="input-confirm-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`btn-primary w-full py-3.5 rounded-xl text-xs font-semibold uppercase tracking-wider mt-2 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 transition-all ${
              loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-primary/40 active:scale-[0.99]'
            }`}
            id="btn-reset-password-submit"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isAr ? 'جاري التحديث...' : 'Updating...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>{isAr ? 'تحديث كلمة المرور' : 'Update Password'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
