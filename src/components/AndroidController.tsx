/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * تطبيق Android الأصلي المعاد بناؤه للويب بنفس بنية Ui.kt و Vm.kt
 * Material 3 + RTL + دعم الأوامر الصوتية والنصية بالعربية وبوابة الشاشة
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Square,
  Camera,
  Eye,
  Radio,
  Settings,
  ShieldCheck,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Sparkles,
  Smartphone,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { ChatMessage, PlanStep } from '../types/protocol.ts';
import { getActionArabicName } from '../lib/policy.ts';

interface Props {
  isPcOnline: boolean;
  activeTask: string | null;
  taskProgress: { step: number; total: number; note: string } | null;
  isSharing: boolean;
  liveFrame: string | null;
  messages: ChatMessage[];
  rxBytes: number;
  onSendCommand: (text: string) => void;
  onAnalyzeScreen: () => void;
  onScreenshotOnly: () => void;
  onStartShare: () => void;
  onStopShare: () => void;
  onCancelTask: () => void;
  confirmRequest: { action: string; detail: string } | null;
  onAnswerConfirm: (approved: boolean) => void;
  onRequestPairCode: () => Promise<string>;
}

export const AndroidController: React.FC<Props> = ({
  isPcOnline,
  activeTask,
  taskProgress,
  isSharing,
  liveFrame,
  messages,
  rxBytes,
  onSendCommand,
  onAnalyzeScreen,
  onScreenshotOnly,
  onStartShare,
  onStopShare,
  onCancelTask,
  confirmRequest,
  onAnswerConfirm,
  onRequestPairCode,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, taskProgress]);

  // Web Speech API for Arabic voice input
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInputText(transcript);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const toggleVoice = () => {
    if (!speechRecognitionRef.current) {
      alert('المتصفح لا يدعم التعرف على الصوت. يمكنك كتابة الأمر في الحقل النصي.');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognitionRef.current.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || activeTask || !isPcOnline) return;
    onSendCommand(inputText.trim());
    setInputText('');
  };

  const handleDownloadImage = (b64: string) => {
    const link = document.createElement('a');
    link.href = b64;
    link.download = `pc_screen_${Date.now()}.jpg`;
    link.click();
  };

  const handleGeneratePairCode = async () => {
    const code = await onRequestPairCode();
    setPairCode(code);
  };

  const isReady = isPcOnline;
  const isBusy = activeTask !== null;

  return (
    <div className="w-full max-w-md mx-auto h-[620px] bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col font-['Cairo',sans-serif] relative">
      {/* Android Device Status Header */}
      <div className="bg-slate-900/90 backdrop-blur-md px-4 py-3 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 leading-tight">مساعد ويندوز</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isReady ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="text-[11px] text-slate-400">
                {isReady ? 'الكمبيوتر متصل وجاهز' : 'الكمبيوتر غير متصل'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="الإعدادات والخصوصية"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Live Screen Sharing Card (Only shows when active!) */}
      {isSharing && (
        <div className="p-3 bg-red-950/40 border-b border-red-500/30 animate-fadeIn">
          <div className="bg-slate-900/90 rounded-2xl border border-red-500/40 p-3 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-red-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>مشاركة الشاشة نشطة (بث مباشر 2 إطار/ثانية)</span>
              </div>
              <span className="text-[10px] text-slate-500">مشفر ومباشر</span>
            </div>

            {/* Stream Canvas / Frame */}
            <div className="w-full h-44 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
              {liveFrame ? (
                <img
                  src={liveFrame}
                  alt="بث شاشة الكمبيوتر"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-xs text-slate-500 animate-pulse flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-400" />
                  <span>بانتظار أول إطار من شاشة الكمبيوتر…</span>
                </div>
              )}
            </div>

            <button
              onClick={onStopShare}
              className="w-full py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              <span>إيقاف مشاركة الشاشة</span>
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed shadow-md ${
              m.kind === 'user'
                ? 'mr-auto bg-blue-600 text-white rounded-br-none'
                : m.kind === 'error'
                ? 'ml-auto bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-bl-none'
                : 'ml-auto bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
            }`}
          >
            {/* Image Bubble */}
            {m.kind === 'image' && m.imageB64 && (
              <div className="space-y-2 mb-1">
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black">
                  <img
                    src={m.imageB64}
                    alt="لقطة الشاشة"
                    className="w-full h-auto max-h-48 object-contain"
                  />
                </div>
                {m.text && (
                  <div className="p-2 bg-slate-950/70 rounded-lg text-slate-300 text-xs border border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-blue-400 text-[11px] font-semibold mb-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تحليل الشاشة عبر Gemini:</span>
                    </div>
                    <p className="whitespace-pre-line">{m.text}</p>
                  </div>
                )}
                <button
                  onClick={() => handleDownloadImage(m.imageB64!)}
                  className="w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>حفظ الصورة على الهاتف</span>
                </button>
              </div>
            )}

            {/* Text Content */}
            {m.kind !== 'image' && (
              <div className="whitespace-pre-line">{m.text}</div>
            )}

            {/* Timestamp */}
            <span
              className={`text-[9px] mt-1 self-end ${
                m.kind === 'user' ? 'text-blue-200' : 'text-slate-500'
              }`}
            >
              {new Date(m.timestamp).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}

        {/* Task Progress Indicator */}
        {taskProgress && (
          <div className="p-3 bg-slate-900/90 border border-blue-500/40 rounded-2xl shadow-lg space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-blue-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                <span>{taskProgress.note}</span>
              </span>
              <span>
                {taskProgress.step} / {taskProgress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                style={{
                  width: `${(taskProgress.step / taskProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Control Buttons (All Manual) */}
      <div className="p-2.5 bg-slate-900/80 border-t border-slate-800/80 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onCancelTask}
            disabled={!isBusy}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isBusy
                ? 'bg-rose-950/80 border border-rose-500/50 text-rose-300 hover:bg-rose-900 shadow-sm'
                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>إيقاف المهمة</span>
          </button>

          <button
            onClick={onAnalyzeScreen}
            disabled={!isReady || isBusy}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isReady && !isBusy
                ? 'bg-blue-950/60 border border-blue-500/40 text-blue-300 hover:bg-blue-900/80 shadow-sm'
                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>تحليل الشاشة</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onScreenshotOnly}
            disabled={!isReady || isBusy}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isReady && !isBusy
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm'
                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>لقطة شاشة</span>
          </button>

          <button
            onClick={onStartShare}
            disabled={!isReady || isSharing}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              isReady && !isSharing
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm'
                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-red-400" />
            <span>بدء مشاركة الشاشة</span>
          </button>
        </div>
      </div>

      {/* Input Row: Mic + Text input + Send */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <button
          onClick={toggleVoice}
          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
            isListening
              ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
          title={isListening ? 'إيقاف الاستماع' : 'تحدث بالصوت'}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isListening ? 'جارٍ الاستماع إليك…' : 'اكتب أمرك بالعربية…'}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim() || !isReady || isBusy}
          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
            inputText.trim() && isReady && !isBusy
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
          title="إرسال الأمر"
        >
          <Send className="w-4 h-4 -scale-x-100" />
        </button>
      </div>

      {/* Sensitive Action Confirmation Dialog */}
      {confirmRequest && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">يلزم تأكيدك الصريح</h3>
              <p className="text-xs text-slate-400 mt-1">
                الإجراء المطلوب مصنف كإجراء حساس:
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-right space-y-1">
              <div className="text-[11px] text-amber-400 font-semibold">
                الإجراء: {getActionArabicName(confirmRequest.action)}
              </div>
              <div className="text-xs text-slate-300 font-mono break-all">
                {confirmRequest.detail}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => onAnswerConfirm(true)}
                className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
              >
                نعم، نفّذ الإجراء
              </button>
              <button
                onClick={() => onAnswerConfirm(false)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                إلغاء الأمر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog (Matching SettingsDialog in Ui.kt) */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>الإعدادات والخصوصية</span>
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                إغلاق
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-500 text-[11px]">الخادم المتصل:</div>
                <div className="font-mono text-slate-300 break-all text-[11px]">
                  {window.location.origin}
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-500 text-[11px]">البيانات المستلمة في الجلسة:</div>
                <div className="font-semibold text-blue-400">
                  {(rxBytes / 1024).toFixed(1)} كيلوبايت
                </div>
              </div>

              <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/30 text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ضمان خمول الشاشة (ScreenGate)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  الصور والبث لا تُرسل ولا تُلتقط إطلاقاً إلا عند ضغطك على أزرارها الصريحة.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] text-slate-400">
                  لربط كمبيوتر Windows حقيقي جديد: اضغط الزر وشغّل في موجه الأوامر أمر pair بالرمز:
                </div>

                {pairCode ? (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-950/60 border border-blue-500/40">
                    <span className="text-lg font-mono font-bold tracking-widest text-blue-300">
                      {pairCode}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(pairCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="p-1.5 rounded hover:bg-blue-900 text-blue-300"
                      title="نسخ الرمز"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGeneratePairCode}
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors"
                  >
                    إنشاء رمز ربط (صالح 5 دقائق)
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
