import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Mic, Send, X, Bot, User, Layers } from 'lucide-react';
import { authenticatedFetch } from '../lib/supabaseClient';

interface AICopilotProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'en' | 'ar';
  textLayers: any[];
  setTextLayers: (layers: any[]) => void;
  imageFilters: {
    brightness: number;
    contrast: number;
    grayscale: boolean;
    rotate: number;
  };
  setImageFilters: (filters: any) => void;
  fileName: string;
  userId?: string;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export default function AICopilot({
  isOpen,
  onClose,
  lang,
  textLayers,
  setTextLayers,
  imageFilters,
  setImageFilters,
  fileName,
  userId = 'demo-user-id'
}: AICopilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: lang === 'ar' 
        ? `أهلاً بك! أنا مساعدك الذكي جيميناي. يمكنني تعديل وترجمة المستند فوراً. جرب أن تكتب لي: "ترجم المستند للعربية" أو "اجعل العنوان: الفاتورة النهائية" أو "قم بزيادة إضاءة الصورة".`
        : `Greetings! I am your Gemini AI Copilot. I can edit, translate, and enhance your document in real-time. Try commanding me: "Translate to Arabic", "Change the title to Invoice", or "Make the image brighter"!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // NOTE (honesty fix): the previous "voice directive" flow here was a
  // simulation — it never accessed the microphone; it counted down a fake
  // timer and then sent a hardcoded "Translate this invoice to Arabic"
  // message labeled as transcribed speech. Real speech-to-text is not
  // implemented in this codebase, so the microphone control is now disabled
  // and clearly marked as coming soon instead of pretending to listen.

  const isRTL = lang === 'ar';

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAiTyping]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputValue;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputValue('');
    setIsAiTyping(true);

    try {
      const response = await authenticatedFetch('/api/copilot/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          textLayers,
          imageFilters,
          lang
        })
      });

      if (response.ok) {
        const data = await response.json();
        setIsAiTyping(false);
        
        // Push AI Response
        setMessages((prev) => [
          ...prev,
          {
            id: 'ai-' + Date.now(),
            sender: 'ai',
            text: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

        // Dynamically update workspace state
        if (data.textLayers && data.textLayers.length > 0) {
          setTextLayers(data.textLayers);
        }
        if (data.imageFilters) {
          setImageFilters(data.imageFilters);
        }
      } else {
        // Surface the backend's actual error message (e.g. "run OCR first",
        // "AI translation failed") instead of a generic one — the server
        // now returns specific, actionable messages for these cases and
        // they were previously being discarded here.
        let serverMessage: string | null = null;
        try {
          const errBody = await response.json();
          if (errBody?.error) serverMessage = errBody.error;
        } catch {
          // response body wasn't JSON; fall through to generic message below
        }
        throw new Error(serverMessage || 'Failed to reach AI Copilot API');
      }
    } catch (e: any) {
      console.error(e);
      setIsAiTyping(false);
      const isKnownServerMessage = !!e?.message && e.message !== 'Failed to reach AI Copilot API';
      setMessages((prev) => [
        ...prev,
        {
          id: 'ai-err-' + Date.now(),
          sender: 'ai',
          text: isKnownServerMessage
            ? e.message
            : (lang === 'ar'
                ? 'عذراً، حدث خطأ أثناء الاتصال بمحرك جيميناي. يرجى التحقق من الشبكة وإعادة المحاولة.'
                : 'Apologies, a communication error occurred with the Gemini model. Please check connectivity and try again.'),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  const suggestions = lang === 'ar' ? [
    { text: 'ترجم المستند للعربية', label: '🇸🇦 ترجم للعربية' },
    { text: 'ترجم للغة الإنجليزية', label: '🇬🇧 Translate English' },
    { text: 'قم بزيادة إضاءة الصورة', label: '☀️ زيادة الإضاءة' },
    { text: 'اجعل المستند غامقاً', label: '🌙 الوضع الغامق' },
    { text: 'قم بتعديل العنوان إلى "عقد رسمي"', label: '📝 تعديل العنوان الرئيسي' },
    { text: 'تفعيل فلتر أبيض وأسود', label: '🎨 أبيض وأسود' },
    { text: 'قم بتدوير المستند بمقدار 90 درجة', label: '🔄 تدوير 90°' }
  ] : [
    { text: 'Translate this invoice to Arabic', label: '🇸🇦 Translate to Arabic' },
    { text: 'Translate this document to English', label: '🇬🇧 Translate to English' },
    { text: 'Make the image brighter', label: '☀️ Boost Brightness' },
    { text: 'Apply dark image adjustments', label: '🌙 Cinematic Dark' },
    { text: 'Change title to "Authorized Contract"', label: '📝 Edit Main Header' },
    { text: 'Toggle monochrome grayscale filter', label: '🎨 Grayscale Mode' },
    { text: 'Rotate the document page', label: '🔄 Rotate 90°' }
  ];

  if (!isOpen) return null;

  return (
    <div 
      className={`ai-copilot-panel fixed top-0 bottom-0 z-50 w-full sm:w-[420px] bg-neutral-900/95 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-all animate-slideInRight ${
        isRTL ? 'left-0 border-r border-l-0' : 'right-0 border-l'
      }`}
      style={{ direction: isRTL ? 'rtl' : 'ltr' }}
      id="ai-copilot-drawer"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-on-primary shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-display font-extrabold text-slate-100 tracking-wide uppercase">
              {lang === 'ar' ? 'جيميناي كوبايلوت' : 'Gemini Copilot'}
            </h3>
            <span className="text-xs font-mono text-secondary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              {lang === 'ar' ? 'مساعد التعديل النشط' : 'Contextual Edit Assistant'}
            </span>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg text-neutral-400 hover:text-white transition-all cursor-pointer"
          id="btn-close-copilot"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Target Document Specs */}
      <div className="bg-white/3 px-4 py-2 border-b border-white/5 flex items-center justify-between text-xs text-neutral-400 font-mono">
        <span className="flex items-center gap-1.5 truncate max-w-[200px]">
          <Layers className="w-3.5 h-3.5 text-secondary" />
          {fileName || 'Document.pdf'}
        </span>
        <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full border border-secondary/20 flex items-center gap-1">
          <Bot className="w-3 h-3" />
          {textLayers.length > 0 ? `${textLayers.length} text blocks` : 'Image Canvas'}
        </span>
      </div>

      {/* Suggestion Quick Prompts */}
      <div className="p-3 bg-neutral-950/30 border-b border-white/5 overflow-x-auto whitespace-nowrap flex gap-2 scrollbar-thin scrollbar-thumb-white/10">
        {suggestions.map((sug, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(sug.text)}
            className="inline-block px-3 py-1.5 bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 rounded-full text-[11px] font-semibold text-neutral-200 hover:text-white transition-all cursor-pointer shadow-sm"
          >
            {sug.label}
          </button>
        ))}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-black/10">
        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={`flex flex-col max-w-[85%] ${
              msg.sender === 'user' 
                ? (isRTL ? 'mr-auto items-start' : 'ml-auto items-end') 
                : (isRTL ? 'ml-auto items-end' : 'mr-auto items-start')
            }`}
          >
            <div className={`flex items-center gap-1.5 mb-1 text-xs text-neutral-500 font-mono`}>
              {msg.sender === 'user' ? (
                <>
                  <span>{msg.timestamp}</span>
                  <User className="w-3 h-3 text-primary" />
                </>
              ) : (
                <>
                  <Bot className="w-3 h-3 text-secondary" />
                  <span>{msg.timestamp}</span>
                </>
              )}
            </div>

            <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
              msg.sender === 'user'
                ? 'bg-primary text-on-primary rounded-br-none font-medium'
                : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-white/5'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {isAiTyping && (
          <div className={`flex flex-col items-start max-w-[85%] ${isRTL ? 'ml-auto' : 'mr-auto'}`}>
            <div className="flex items-center gap-1.5 mb-1 text-xs text-neutral-500 font-mono">
              <Bot className="w-3 h-3 text-secondary animate-spin" />
              <span>{lang === 'ar' ? 'جيميناي يفكر...' : 'Gemini is processing...'}</span>
            </div>
            <div className="p-4 bg-neutral-800 text-neutral-400 rounded-2xl rounded-bl-none border border-white/5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input controls */}
      <div className="p-4 border-t border-white/10 bg-neutral-950 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* Microphone button — voice input is NOT implemented yet. The
              previous version simulated listening and injected a hardcoded
              "transcribed" command, which was misleading. It is disabled
              until real speech-to-text is wired up. */}
          <button
            disabled
            aria-disabled={true}
            className="p-3 rounded-xl flex items-center justify-center bg-white/5 text-neutral-500 opacity-40 cursor-not-allowed"
            title={lang === 'ar' ? 'الإدخال الصوتي غير متاح بعد — قريباً' : 'Voice input is not available yet — coming soon'}
            id="btn-voice-copilot"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Main Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder={lang === 'ar' ? 'أعط جيميناي أمر تعديل...' : 'Command Gemini to edit...'}
              className="w-full bg-neutral-800 text-slate-100 text-xs px-4 py-3.5 pr-10 rounded-xl border border-white/5 focus:border-primary focus:outline-none transition-all placeholder:text-neutral-500"
            />
            <button
              onClick={() => handleSendMessage()}
              className="absolute right-2 top-2 p-1.5 text-primary hover:text-white transition-all cursor-pointer"
              id="btn-send-copilot"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footnote */}
        <p className="text-[9px] text-center text-neutral-500 font-mono mt-1">
          {lang === 'ar' 
            ? 'مساعد الذكاء الاصطناعي مدعوم بنموذج Gemini 2.5 Flash. الإدخال الصوتي قريباً.'
            : 'AI assistant is powered securely by Gemini 2.5 Flash. Voice input coming soon.'}
        </p>
      </div>
    </div>
  );
}
