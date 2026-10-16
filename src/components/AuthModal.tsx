import React, { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured, getAuthRedirectUrl } from '../lib/supabaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSignUpDefault?: boolean;
  lang: 'ar' | 'en';
  onSuccess?: (user?: any) => void;
}

// Official Google Icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    {/* Official Google brand colors (fixed, not theme tokens) — Google's
        multi-color "G" is a fixed brand mark and must not shift with the
        site's light/dark theme variables (fixed, Sept 2026 audit). */}
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const TwitterIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#1DA1F2">
    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

export default function AuthModal({
  isOpen,
  onClose,
  isSignUpDefault = false,
  lang,
  onSuccess
}: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(isSignUpDefault);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const errorId = useId();
  const successId = useId();
  const emailId = useId();
  const passwordId = useId();

  // Reset tab and loading state when modal opens or mode changes
  useEffect(() => {
    setIsSignUp(isSignUpDefault);
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(false);
    setGoogleLoading(false);
    setForgotPasswordMode(false);
    setResetLoading(false);
  }, [isOpen, isSignUpDefault]);

  if (!isOpen) return null;

  const isAr = lang === 'ar';

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setGoogleLoading(true);

    const timeoutId = setTimeout(() => {
      setGoogleLoading(false);
    }, 12000);

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getAuthRedirectUrl(),
          },
        });

        if (error) {
          clearTimeout(timeoutId);
          throw error;
        }
        return;
      }

      // Local development simulation fallback if Supabase is strictly unconfigured
      const isDev = (import.meta as any).env.DEV || (import.meta as any).env.MODE === 'development';
      if (!isDev) {
        throw new Error('Supabase authentication is not configured.');
      }

      const loggedInUser = {
        id: 'google-usr-' + Math.random().toString(36).substring(2, 9),
        email: 'user@gmail.com',
        plan: 'free' as const,
        created_at: new Date().toISOString()
      };

      localStorage.setItem('user_session', JSON.stringify(loggedInUser));
      setSuccessMsg(isAr ? 'تم تسجيل الدخول بنجاح عبر حساب Google!' : 'Successfully signed in with Google!');

      setTimeout(() => {
        clearTimeout(timeoutId);
        setGoogleLoading(false);
        onClose();
        if (onSuccess) onSuccess(loggedInUser);
      }, 600);

    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Google Sign In Error:', err);
      setErrorMsg(err.message || (isAr ? 'فشل تسجيل الدخول عبر Google' : 'Google sign in failed. Please try again.'));
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg(isAr ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email address.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMsg(
        isAr
          ? 'خدمة إعادة تعيين كلمة المرور غير متاحة حالياً على الخادم.'
          : 'Password reset is not available right now.'
      );
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) throw error;

      setSuccessMsg(
        isAr
          ? 'إذا كان هذا البريد الإلكتروني مسجلاً لدينا، فسيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق.'
          : "If an account exists for this email, we've sent a password reset link. Please check your inbox."
      );
    } catch (err: any) {
      console.error('Password reset error:', err);
      setErrorMsg(err.message || (isAr ? 'تعذر إرسال رابط إعادة التعيين. حاول مرة أخرى.' : 'Could not send reset link. Please try again.'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setErrorMsg(isAr ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter both your email and password.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg(isAr ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل' : 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    const timeoutId = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          setErrorMsg(isAr ? 'استغرق الاتصال وقتاً أطول من المتوقع. يرجى المحاولة مرة أخرى.' : 'Connection timed out. Please try again.');
          return false;
        }
        return false;
      });
    }, 10000);

    try {
      if (!isSupabaseConfigured) {
        const isDev = (import.meta as any).env.DEV || (import.meta as any).env.MODE === 'development';
        if (!isDev) {
          throw new Error(
            isAr
              ? 'خدمة تسجيل الدخول غير مُهيأة على الخادم حالياً. يرجى المحاولة لاحقاً أو التواصل مع الدعم.'
              : 'Authentication service is not configured on the server right now. Please try again later or contact support.'
          );
        }

        const loggedInUser = {
          id: 'user-' + Math.random().toString(36).substring(2, 9),
          email: trimmedEmail,
          plan: 'free' as const
        };
        localStorage.setItem('user_session', JSON.stringify(loggedInUser));
        setSuccessMsg(isAr ? 'تم تسجيل الدخول بنجاح! (وضع تطوير محلي)' : 'Successfully authenticated! (local dev mode)');
        setTimeout(() => {
          clearTimeout(timeoutId);
          setLoading(false);
          onClose();
          if (onSuccess) onSuccess(loggedInUser);
        }, 600);
        return;
      }

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        if (data.user) {
          await supabase.from('users').upsert([
            {
              id: data.user.id,
              email: trimmedEmail,
              plan: 'free',
              created_at: new Date().toISOString(),
            }
          ], { onConflict: 'id' });
        }

        clearTimeout(timeoutId);
        if (data.session) {
          setSuccessMsg(isAr ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح!' : 'Account created and signed in successfully!');
          const loggedInUser = {
            id: data.user.id,
            email: trimmedEmail,
            plan: 'free' as const,
            is_admin: false
          };
          localStorage.setItem('user_session', JSON.stringify(loggedInUser));
          setTimeout(() => {
            setLoading(false);
            onClose();
            if (onSuccess) onSuccess(loggedInUser);
          }, 1000);
        } else {
          setSuccessMsg(
            isAr
              ? 'تم إنشاء الحساب! يرجى مراجعة بريدك الإلكتروني لتأكيد التسجيل.'
              : 'Account created! Please check your email inbox to verify your account.'
          );
          setLoading(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        clearTimeout(timeoutId);
        if (data.user) {
          setSuccessMsg(isAr ? 'أهلاً بك مجدداً! جاري توجيهك...' : 'Welcome back! Redirecting...');

          let plan: 'free' | 'pro' = 'free';
          let isAdmin = false;
          try {
            const { data: userRow } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.user.id)
              .single();
            if (userRow) {
              plan = userRow.plan || 'free';
              isAdmin = userRow.is_admin === true || userRow.role === 'admin';
            }
          } catch (profileErr) {
            console.error('Failed to fetch profile during auth onSuccess:', profileErr);
          }

          const loggedInUser = {
            id: data.user.id,
            email: data.user.email || '',
            plan,
            is_admin: isAdmin
          };

          localStorage.setItem('user_session', JSON.stringify(loggedInUser));

          setTimeout(() => {
            setLoading(false);
            onClose();
            if (onSuccess) onSuccess(loggedInUser);
          }, 800);
        } else {
          setLoading(false);
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Email Auth Error:', err);
      setErrorMsg(err.message || (isAr ? 'فشلت عملية المصادقة. يرجى التحقق من صحة البيانات.' : 'Authentication failed. Please check your credentials.'));
      setLoading(false);
    }
  };

  const handleSocialClick = (platform: string) => {
    if (platform === 'google') {
      handleGoogleSignIn();
    } else {
      // Show visual warning/error since only google is configured
      setErrorMsg(
        isAr
          ? `تسجيل الدخول عبر ${platform} غير مفعل حالياً. يرجى استخدام Google أو البريد الإلكتروني.`
          : `${platform} sign-in is not active. Please use Google or Email.`
      );
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#030712]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && !googleLoading) {
          onClose();
        }
      }}
    >
      {/* Container card: sliding dual panels on desktop, beautiful single card on mobile */}
      <div className="relative w-full max-w-[450px] md:max-w-[900px] min-h-[580px] md:h-[550px] bg-surface/95 backdrop-blur-2xl border border-white/8 rounded-[2rem] overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col md:flex-row z-10 transition-all duration-300">

        {/* Adaptive Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading || googleLoading}
          className={`absolute top-4 ltr:right-4 rtl:left-4 z-50 transition-colors cursor-pointer w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 md:bg-transparent ${
            isSignUp
              ? 'text-on-surface-variant hover:text-on-surface md:text-on-primary/80 md:hover:text-on-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
          id="btn-close-auth-modal"
          aria-label={isAr ? 'إغلاق' : 'Close'}
        >
          <X className="w-5 h-5" />
        </button>

        {/* =========================================================================
            DESKTOP LAYOUT (md and up) — Smooth sliding panels + SVG curve
            ========================================================================= */}
        <div className="hidden md:flex w-full h-full relative">

          {/* SLIDING PURPLE PANEL */}
          <motion.div
            layout
            transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 20 }}
            className={`absolute top-0 bottom-0 z-20 bg-primary text-on-primary flex flex-col justify-center items-center px-12 text-center select-none overflow-visible ${
              isSignUp ? "ltr:right-0 rtl:left-0 w-[46%]" : "ltr:left-0 rtl:right-0 w-[46%]"
            }`}
          >
            {/* SVG Wave Divider attached to the edge of the sliding panel */}
            <svg
              viewBox="0 0 100 550"
              preserveAspectRatio="none"
              className={`absolute top-0 bottom-0 h-full w-[110px] text-primary fill-current pointer-events-none z-10 transition-transform duration-300 ${
                isSignUp
                  ? "ltr:right-full ltr:-scale-x-100 rtl:left-full rtl:scale-x-100"
                  : "ltr:left-full ltr:scale-x-100 rtl:right-full rtl:-scale-x-100"
              }`}
            >
              <path d="M0,0 L50,0 C80,180 30,370 0,550 Z" />
            </svg>

            {/* Sliding Panel Content (AnimatePresence for cross-fade) */}
            <AnimatePresence mode="wait">
              {!isSignUp ? (
                <motion.div
                  key="signin-promo"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center"
                >
                  <h3 className="text-3xl font-extrabold font-display text-on-primary mb-4">
                    {isAr ? "جديد هنا؟" : "New here?"}
                  </h3>
                  <p className="text-sm text-indigo-50/90 leading-relaxed mb-8 max-w-[280px]">
                    {isAr
                      ? "انضم إلينا اليوم واكتشف عالماً من الإمكانيات. أنشئ حسابك في ثوانٍ معدودة!"
                      : "Join us today and discover a world of possibilities. Create your account in seconds!"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="px-10 py-3 border-2 border-on-primary/80 text-on-primary rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-indigo-600 hover:border-white transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    {isAr ? "إنشاء حساب" : "SIGN UP"}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="signup-promo"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center"
                >
                  <h3 className="text-3xl font-extrabold font-display text-on-primary mb-4">
                    {isAr ? "عضو معنا؟" : "One of us?"}
                  </h3>
                  <p className="text-sm text-indigo-50/90 leading-relaxed mb-8 max-w-[280px]">
                    {isAr
                      ? "أهلاً بك مجدداً! سجل دخولك لمتابعة رحلتك معنا وإدارة ملفاتك."
                      : "Welcome back! Sign in to continue your journey with us and manage your files."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    className="px-10 py-3 border-2 border-on-primary/80 text-on-primary rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-indigo-600 hover:border-white transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    {isAr ? "تسجيل الدخول" : "SIGN IN"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* LEFT COLUMN CONTENT: Displays Sign Up Form when active */}
          <div className="w-1/2 h-full flex items-center justify-center p-8 bg-transparent">
            <div className={`w-full max-w-[340px] flex flex-col items-center transition-all duration-500 ${
              isSignUp ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}>
              <form onSubmit={handleEmailAuth} className="w-full flex flex-col items-center" noValidate>
                <h2 className="text-4xl font-extrabold font-display text-on-surface mb-6 text-center">
                  {isAr ? "إنشاء حساب" : "Sign up"}
                </h2>

                {/* Alerts inside Form */}
                {isSignUp && successMsg && (
                  <div className="w-full mb-4 p-3 bg-success-subtle border border-success-subtle rounded-xl text-success text-xs flex items-start gap-2 animate-fadeIn">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" />
                    <span className="leading-relaxed">{successMsg}</span>
                  </div>
                )}
                {isSignUp && errorMsg && (
                  <div className="w-full mb-4 p-3 bg-error-subtle border border-error-subtle rounded-xl text-error text-xs flex items-start gap-2 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                )}

                {/* Email Input */}
                <div className="relative w-full mb-4">
                  <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                    <Mail className="w-5 h-5" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isAr ? "البريد الإلكتروني" : "Email"}
                    className="w-full h-12 ltr:pl-12 ltr:pr-4 rtl:pr-12 rtl:pl-4 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>

                {/* Password Input */}
                <div className="relative w-full mb-6">
                  <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isAr ? "كلمة المرور" : "Password"}
                    className="w-full h-12 ltr:pl-12 ltr:pr-12 rtl:pr-12 rtl:pl-12 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute ltr:right-4 rtl:left-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-[160px] h-[48px] bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-full uppercase tracking-wider text-xs shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/50 transition-all hover:-translate-y-[1px] active:translate-y-0 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>{isAr ? "إنشاء حساب" : "SIGN UP"}</span>
                  )}
                </button>

                {/* Social Login */}
                <p className="text-xs text-on-surface-variant mt-8 mb-4">
                  {isAr ? "أو سجل دخولك عبر شبكات التواصل" : "Or sign up with social platforms"}
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleSocialClick('google')}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                  >
                    <GoogleIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSocialClick('Facebook')}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                  >
                    <FacebookIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSocialClick('Twitter')}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                  >
                    <TwitterIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSocialClick('LinkedIn')}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                  >
                    <LinkedInIcon />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN CONTENT: Displays Sign In Form when active */}
          <div className="w-1/2 h-full flex items-center justify-center p-8 bg-transparent">
            <div className={`w-full max-w-[340px] flex flex-col items-center transition-all duration-500 ${
              !isSignUp ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}>

              <AnimatePresence mode="wait">
                {forgotPasswordMode ? (
                  <motion.form
                    key="forgot-form"
                    onSubmit={handleForgotPassword}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                    noValidate
                  >
                    <h2 className="text-3xl font-extrabold font-display text-on-surface mb-2 text-center">
                      {isAr ? "استعادة الحساب" : "Reset Password"}
                    </h2>
                    <p className="text-xs text-on-surface-variant text-center mb-6">
                      {isAr ? "أدخل بريدك الإلكتروني لإرسال رابط استعادة كلمة المرور." : "Enter your email and we'll send you a reset link."}
                    </p>

                    {/* Alert messages */}
                    {!isSignUp && successMsg && (
                      <div className="w-full mb-4 p-3 bg-success-subtle border border-success-subtle rounded-xl text-success text-xs flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" />
                        <span className="leading-relaxed">{successMsg}</span>
                      </div>
                    )}
                    {!isSignUp && errorMsg && (
                      <div className="w-full mb-4 p-3 bg-error-subtle border border-error-subtle rounded-xl text-error text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                        <span className="leading-relaxed">{errorMsg}</span>
                      </div>
                    )}

                    {/* Email Input */}
                    <div className="relative w-full mb-6">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full h-12 ltr:pl-12 ltr:pr-4 rtl:pr-12 rtl:pl-4 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>

                    {/* Submit Reset Button */}
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full h-12 bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-full uppercase tracking-wider text-xs shadow-md shadow-primary/30 transition-all active:scale-98 cursor-pointer flex items-center justify-center"
                    >
                      {resetLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>{isAr ? "إرسال رابط التعافي" : "Send Reset Link"}</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setForgotPasswordMode(false);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className="text-xs text-primary hover:text-primary-hover font-semibold transition-colors text-center cursor-pointer mt-5 py-1"
                    >
                      {isAr ? "← العودة لتسجيل الدخول" : "← Back to Sign In"}
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="signin-form"
                    onSubmit={handleEmailAuth}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                    noValidate
                  >
<h2 className="text-4xl font-extrabold font-display text-on-surface mb-6 text-center">
                      {isAr ? "تسجيل الدخول" : "Sign in"}
                    </h2>

                    {/* Alerts inside Form */}
                    {!isSignUp && successMsg && (
                      <div className="w-full mb-4 p-3 bg-success-subtle border border-success-subtle rounded-xl text-success text-xs flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" />
                        <span className="leading-relaxed">{successMsg}</span>
                      </div>
                    )}
                    {!isSignUp && errorMsg && (
                      <div className="w-full mb-4 p-3 bg-error-subtle border border-error-subtle rounded-xl text-error text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                        <span className="leading-relaxed">{errorMsg}</span>
                      </div>
                    )}

                    {/* Email Input */}
                    <div className="relative w-full mb-4">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={isAr ? "البريد الإلكتروني" : "Email"}
                        className="w-full h-12 ltr:pl-12 ltr:pr-4 rtl:pr-12 rtl:pl-4 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>

                    {/* Password Input */}
                    <div className="relative w-full mb-4">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isAr ? "كلمة المرور" : "Password"}
                        className="w-full h-12 ltr:pl-12 ltr:pr-12 rtl:pr-12 rtl:pl-12 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute ltr:right-4 rtl:left-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Forgot password link */}
                    <div className="w-full flex justify-end mb-6">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotPasswordMode(true);
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                        className="text-xs text-on-surface-variant hover:text-indigo-500 transition-colors cursor-pointer py-1"
                      >
                        {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
                      </button>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading || googleLoading}
                      className="w-[150px] h-[48px] bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-full uppercase tracking-wider text-xs shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/50 transition-all hover:-translate-y-[1px] active:translate-y-0 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>{isAr ? "دخول" : "LOGIN"}</span>
                      )}
                    </button>

                    {/* Social Login */}
                    <p className="text-xs text-on-surface-variant mt-8 mb-4">
                      {isAr ? "أو سجل دخولك عبر شبكات التواصل" : "Or sign in with social platforms"}
                    </p>
                    <div className="flex justify-center gap-4">
                      <button
                        type="button"
                        onClick={() => handleSocialClick('google')}
                        className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                      >
                        <GoogleIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('Facebook')}
                        className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                      >
                        <FacebookIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('Twitter')}
                        className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                      >
                        <TwitterIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('LinkedIn')}
                        className="w-11 h-11 rounded-full bg-white/5 border border-white/10 shadow-sm hover:shadow-md hover:bg-white/10 hover:border-white/20 flex items-center justify-center transition-all hover:-translate-y-[2px] cursor-pointer"
                      >
                        <LinkedInIcon />
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

        {/* =========================================================================
            MOBILE LAYOUT (below md) — Beautiful stack layout keeping the design identity
            ========================================================================= */}
        <div className="flex md:hidden flex-col w-full min-h-[580px] bg-transparent text-on-surface">

          {/* Mobile Header Banner */}
          <div className="bg-primary text-on-primary py-8 px-6 text-center flex flex-col items-center relative overflow-hidden rounded-t-[2rem]">
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-primary-container/80 mb-2">
              {isAr ? 'إيزي بي دي إف · دخول آمن' : 'EasyPDF · Secure Access'}
            </span>
            <h2 className="text-2xl font-bold font-display tracking-tight text-on-primary">
              {forgotPasswordMode
                ? (isAr ? 'استعادة كلمة المرور' : 'Reset Password')
                : isSignUp
                ? (isAr ? 'أنشئ حساباً جديداً' : 'Create Account')
                : (isAr ? 'أهلاً بعودتك' : 'Welcome Back')}
            </h2>
            <p className="text-xs text-primary-container/80 mt-1 max-w-[280px]">
              {forgotPasswordMode
                ? (isAr ? 'أدخل بريدك الإلكتروني للحصول على رابط التعافي.' : 'Enter email to receive recovery link.')
                : isSignUp
                ? (isAr ? 'انضم إلينا اليوم للوصول لخدماتنا وميزات الذكاء الاصطناعي.' : 'Join us today to access and manage secure PDF tools.')
                : (isAr ? 'سجل دخولك للوصول إلى أدواتك وملفاتك المحفوظة.' : 'Sign in to access your workspace, saved files & settings.')}
            </p>
          </div>

          {/* Mobile Body containing the dynamic forms */}
          <div className="flex-grow flex items-center justify-center px-6 py-8">
            <div className="w-full max-w-[340px]">

              <AnimatePresence mode="wait">
                {forgotPasswordMode ? (
                  <motion.form
                    key="mobile-forgot"
                    onSubmit={handleForgotPassword}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                    noValidate
                  >
                    {/* Alerts */}
                    {successMsg && (
                      <div className="w-full mb-4 p-3 bg-success-subtle border border-success-subtle rounded-xl text-success text-xs flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" />
                        <span className="leading-relaxed">{successMsg}</span>
                      </div>
                    )}
                    {errorMsg && (
                      <div className="w-full mb-4 p-3 bg-error-subtle border border-error-subtle rounded-xl text-error text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                        <span className="leading-relaxed">{errorMsg}</span>
                      </div>
                    )}

                    {/* Email Input */}
                    <div className="relative w-full mb-6">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full h-12 ltr:pl-12 ltr:pr-4 rtl:pr-12 rtl:pl-4 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full h-12 bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-full uppercase tracking-wider text-xs shadow-md shadow-primary/30 transition-all active:scale-98 cursor-pointer flex items-center justify-center"
                    >
                      {resetLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>{isAr ? "إرسال رابط التعافي" : "Send Reset Link"}</span>
                      )}
                    </button>

                    {/* Back to Sign In */}
                    <button
                      type="button"
                      onClick={() => {
                        setForgotPasswordMode(false);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className="text-xs text-indigo-500 font-semibold transition-colors text-center cursor-pointer mt-5 py-1"
                    >
                      {isAr ? "← العودة لتسجيل الدخول" : "← Back to Sign In"}
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key={isSignUp ? "mobile-signup" : "mobile-signin"}
                    onSubmit={handleEmailAuth}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                    noValidate
                  >
                    {/* Alerts */}
                    {successMsg && (
                      <div className="w-full mb-4 p-3 bg-success-subtle border border-success-subtle rounded-xl text-success text-xs flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" />
                        <span className="leading-relaxed">{successMsg}</span>
                      </div>
                    )}
                    {errorMsg && (
                      <div className="w-full mb-4 p-3 bg-error-subtle border border-error-subtle rounded-xl text-error text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-error mt-0.5" />
                        <span className="leading-relaxed">{errorMsg}</span>
                      </div>
                    )}

                    {/* Email Input */}
                    <div className="relative w-full mb-4">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={isAr ? "البريد الإلكتروني" : "Email"}
                        className="w-full h-12 ltr:pl-12 ltr:pr-4 rtl:pr-12 rtl:pl-4 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>

                    {/* Password Input */}
                    <div className="relative w-full mb-4">
                      <span className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isAr ? "كلمة المرور" : "Password"}
                        className="w-full h-12 ltr:pl-12 ltr:pr-12 rtl:pr-12 rtl:pl-12 bg-surface-container border border-outline-variant rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute ltr:right-4 rtl:left-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Forgot Password Link (Sign in only) */}
                    {!isSignUp && (
                      <div className="w-full flex justify-end mb-6">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotPasswordMode(true);
                            setErrorMsg('');
                            setSuccessMsg('');
                          }}
                          className="text-xs text-on-surface-variant hover:text-indigo-500 transition-colors cursor-pointer py-1"
                        >
                          {isAr ? "نسيت كلمة المرور؟" : "Forgot password?"}
                        </button>
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading || googleLoading}
                      className="w-[150px] h-[48px] bg-primary hover:bg-primary-hover text-on-primary font-bold rounded-full uppercase tracking-wider text-xs shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/50 transition-all hover:-translate-y-[1px] active:translate-y-0 active:scale-98 cursor-pointer mt-2 flex items-center justify-center"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>{isSignUp ? (isAr ? "إنشاء حساب" : "SIGN UP") : (isAr ? "دخول" : "LOGIN")}</span>
                      )}
                    </button>

                    {/* Social Login */}
                    <p className="text-xs text-on-surface-variant mt-6 mb-3">
                      {isAr ? "أو المتابعة عبر شبكات التواصل" : "Or connect with social platforms"}
                    </p>
                    <div className="flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSocialClick('google')}
                        className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center transition-all hover:bg-primary/5 hover:border-primary/30 cursor-pointer"
                      >
                        <GoogleIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('Facebook')}
                        className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center transition-all hover:bg-primary/5 hover:border-primary/30 cursor-pointer"
                      >
                        <FacebookIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('Twitter')}
                        className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center transition-all hover:bg-primary/5 hover:border-primary/30 cursor-pointer"
                      >
                        <TwitterIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSocialClick('LinkedIn')}
                        className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant shadow-sm flex items-center justify-center transition-all hover:bg-primary/5 hover:border-primary/30 cursor-pointer"
                      >
                        <LinkedInIcon />
                      </button>
                    </div>

                    {/* Mobile Switch Footer Toggle */}
                    <div className="text-xs text-on-surface-variant mt-8 text-center">
                      {!isSignUp ? (
                        <span>
                          {isAr ? "جديد هنا؟ " : "New here? "}
                          <button
                            type="button"
                            onClick={() => {
                              setIsSignUp(true);
                              setErrorMsg('');
                              setSuccessMsg('');
                            }}
                            className="text-indigo-500 font-bold hover:underline py-1 cursor-pointer"
                          >
                            {isAr ? "أنشئ حسابك الآن" : "Sign up"}
                          </button>
                        </span>
                      ) : (
                        <span>
                          {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
                          <button
                            type="button"
                            onClick={() => {
                              setIsSignUp(false);
                              setErrorMsg('');
                              setSuccessMsg('');
                            }}
                            className="text-indigo-500 font-bold hover:underline py-1 cursor-pointer"
                          >
                            {isAr ? "سجل دخولك" : "Sign in"}
                          </button>
                        </span>
                      )}
                    </div>

                  </motion.form>
                )}
              </AnimatePresence>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
