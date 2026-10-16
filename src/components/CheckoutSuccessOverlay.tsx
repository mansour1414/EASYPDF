import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Sparkles, AlertTriangle, RefreshCcw } from 'lucide-react';
import { authenticatedFetch } from '../lib/supabaseClient';

interface CheckoutSuccessOverlayProps {
  lang: 'ar' | 'en';
  /** Called once the backend confirms the account is now on the Pro plan. */
  onActivated: (profile: { plan: 'free' | 'pro'; email: string }) => void;
  /** Called when the user dismisses the overlay (success, timeout, or close). */
  onClose: () => void;
}

// How long we keep polling /api/user/me before giving up and showing the
// "still processing" fallback message. Stripe webhooks are normally
// near-instant, but can occasionally take a few seconds.
const MAX_POLL_ATTEMPTS = 20; // ~30s total (with the backoff below)
const POLL_INTERVAL_MS = 1500;

type PollState = 'checking' | 'success' | 'pending';

/**
 * Shown automatically when the app detects it was just redirected back from
 * a Stripe Checkout session (see App.tsx). The Stripe webhook
 * (/api/stripe/webhook) already updates the user's plan in the database the
 * moment payment succeeds — this overlay is what makes that change show up
 * in the UI immediately, instead of requiring the user to log out/in or
 * manually refresh before the app "notices" they're on Pro now.
 */
export default function CheckoutSuccessOverlay({ lang, onActivated, onClose }: CheckoutSuccessOverlayProps) {
  const [state, setState] = useState<PollState>('checking');
  const attemptsRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      if (cancelledRef.current) return;
      attemptsRef.current += 1;

      try {
        const res = await authenticatedFetch('/api/user/me');
        if (res.ok) {
          const profile = await res.json();
          if (profile?.plan === 'pro') {
            if (!cancelledRef.current) {
              setState('success');
              onActivated({ plan: 'pro', email: profile.email });
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Checkout confirmation check failed, will retry:', err);
      }

      if (cancelledRef.current) return;

      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setState('pending');
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAr = lang === 'ar';

  const handleRetryNow = () => {
    attemptsRef.current = 0;
    cancelledRef.current = false;
    setState('checking');
    // Manual one-shot check, reusing the same guard the automatic loop uses
    // so a closed/unmounted overlay never triggers a state update on a
    // stale component instance.
    (async () => {
      try {
        const res = await authenticatedFetch('/api/user/me');
        if (res.ok) {
          const profile = await res.json();
          if (profile?.plan === 'pro') {
            if (!cancelledRef.current) {
              setState('success');
              onActivated({ plan: 'pro', email: profile.email });
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Manual checkout confirmation retry failed:', err);
      }
      if (!cancelledRef.current) {
        setState('pending');
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl shadow-2xl p-7 text-center animate-fadeIn">
        {state === 'checking' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-on-background mb-1.5">
              {isAr ? 'جاري تأكيد عملية الدفع...' : 'Confirming your payment...'}
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {isAr
                ? 'نتحقق الآن من تفعيل اشتراك برو الخاص بك تلقائياً. لن يستغرق هذا أكثر من لحظات.'
                : "We're verifying your Pro subscription activation. This usually only takes a few seconds."}
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-on-background mb-1.5 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              {isAr ? 'تم تفعيل خطة برو بنجاح!' : 'Pro plan activated!'}
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-5">
              {isAr
                ? 'أصبح لديك الآن وصول غير محدود لجميع أدوات المعالجة وميزات الذكاء الاصطناعي.'
                : 'You now have unlimited access to every processing tool and AI feature.'}
            </p>
            <button
              onClick={onClose}
              className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              {isAr ? 'ابدأ الاستخدام الآن' : 'Start using Pro now'}
            </button>
          </>
        )}

        {state === 'pending' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-on-background mb-1.5">
              {isAr ? 'لا يزال التفعيل قيد التأكيد' : 'Still confirming activation'}
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-5">
              {isAr
                ? 'لم نتمكن بعد من تأكيد تفعيل خطة برو على حسابك خلال المدة المتوقعة. إذا أكملتَ عملية الدفع للتو، فقد يستغرق التفعيل بضع دقائق إضافية — يمكنك إعادة المحاولة الآن أو المتابعة والعودة لاحقاً. إذا استمرت المشكلة، تحقق من بريدك الإلكتروني لتأكيد Stripe أو تواصل مع الدعم.'
                : "We haven't been able to confirm your Pro plan activation within the usual window yet. If you just completed checkout, this can occasionally take a few extra minutes — you can retry now or continue and check back shortly. If this persists, check your email for a Stripe confirmation or contact support."}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleRetryNow}
                className="btn-primary w-full py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                {isAr ? 'إعادة التحقق الآن' : 'Check again'}
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-background transition-colors cursor-pointer"
              >
                {isAr ? 'متابعة لاحقاً' : 'Continue for now'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
