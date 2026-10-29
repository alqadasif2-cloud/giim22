/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * تطبيق WinAssistant الرئيسي
 * يدمج واجهة الهاتف Android، ومحاكي جهاز Windows 11، وخادم التوجيه وGemini AI
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  Monitor,
  LayoutGrid,
  BookOpen,
  Sparkles,
  Shield,
  Layers,
  ChevronRight,
  Terminal,
  Activity,
  Cpu,
} from 'lucide-react';
import { VirtualWindowsDesktop } from './components/VirtualWindowsDesktop.tsx';
import { AndroidController } from './components/AndroidController.tsx';
import { RealAgentInstructions } from './components/RealAgentInstructions.tsx';
import { ScreenGateBadge } from './components/ScreenGateBadge.tsx';
import { ChatMessage, PlanStep, ScreenGateState } from './types/protocol.ts';

export default function App() {
  // Current view tab
  const [viewMode, setViewMode] = useState<'split' | 'phone' | 'desktop' | 'docs'>('split');

  // ScreenGate state
  const [gateState, setGateState] = useState<ScreenGateState>({
    isIdle: true,
    currentLease: 'none',
    expiresAt: null,
  });

  // Runner references from VirtualWindowsDesktop
  const runnerRef = useRef<{
    runPlan: (plan: PlanStep[], taskId: string) => Promise<void>;
    captureScreen: () => Promise<string>;
    startStream: () => void;
    stopStream: () => void;
    cancelTask: () => void;
    confirmAction: (approved: boolean) => void;
  } | null>(null);

  // Controller states
  const [isPcOnline, setIsPcOnline] = useState(true);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<{ step: number; total: number; note: string } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [rxBytes, setRxBytes] = useState(14200);

  // Sensitive action confirmation dialog state
  const [confirmRequest, setConfirmRequest] = useState<{ action: string; detail: string } | null>(null);

  // Initial chat history
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      kind: 'system',
      text: 'مرحباً بك في مساعد Windows. النظام متصل وجاهز لتلقي أوامرك بالعربية سواء بالصوت أو بالكتابة.\n\n🛡️ بوابة الشاشة (ScreenGate) خاملة تماماً: لا يتم التقاط أي إطار أو تحليله إلا عند ضغطك على زر صريح.',
      timestamp: Date.now() - 60000,
    },
  ]);

  // Quick preset Arabic commands for instant testing
  const exampleCommands = [
    'افتح المفكرة واكتب مرحباً بكم في الذكاء الاصطناعي واحفظ الملف',
    'احسب 250 في 14 بالحاسبة',
    'افتح جوجل كروم وابحث عن أخبار التقنية',
    'شغّل الرسام',
    'ما هي النوافذ المفتوحة؟',
    'احذف ملف الاختبار temp_file.txt',
  ];

  // Send Command to Gemini Planner & Windows Agent
  const handleSendCommand = async (text: string) => {
    const userMsgId = `usr-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      kind: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const taskId = `task-${Date.now()}`;
    setActiveTask(taskId);
    setTaskProgress({ step: 1, total: 3, note: 'جارٍ التخطيط بالذكاء الاصطناعي عبر Gemini…' });

    try {
      // Call server Gemini planning endpoint
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      setRxBytes((b) => b + 1200);

      if (data.clarify) {
        // Clarification needed
        setActiveTask(null);
        setTaskProgress(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `clarify-${Date.now()}`,
            kind: 'assistant',
            text: `❓ ${data.clarify}`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      if (!data.plan || data.plan.length === 0) {
        throw new Error('لم يتم إنشاء خطوات صالحة للأمر');
      }

      const plan: PlanStep[] = data.plan;

      // Notify in chat about the planned steps
      const stepsSummary = plan.map((s, idx) => `${idx + 1}. ${s.note || s.action}`).join('\n');
      setMessages((prev) => [
        ...prev,
        {
          id: `plan-${Date.now()}`,
          kind: 'system',
          text: `📋 خطة التنفيذ المعتمدة (${plan.length} خطوات):\n${stepsSummary}`,
          timestamp: Date.now(),
        },
      ]);

      // Execute on Virtual Desktop Runner
      if (runnerRef.current) {
        await runnerRef.current.runPlan(plan, taskId);
      } else {
        throw new Error('وكيل Windows غير متصل');
      }
    } catch (err: any) {
      console.error('Command execution failed:', err);
      setActiveTask(null);
      setTaskProgress(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          kind: 'error',
          text: `❌ خطأ في التنفيذ: ${err.message || 'حدث خطأ غير متوقع'}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  // Analyze Screen: captures one shot, sends to Gemini Vision, displays analysis
  const handleAnalyzeScreen = async () => {
    if (!runnerRef.current) return;
    const taskId = `analyze-${Date.now()}`;
    setActiveTask(taskId);
    setTaskProgress({ step: 1, total: 2, note: 'التقاط لقطة الشاشة بموافقة بوابة ScreenGate…' });

    try {
      // Step 1: Capture desktop canvas snapshot
      const jpeg = await runnerRef.current.captureScreen();
      setRxBytes((b) => b + (jpeg.length * 0.75));

      setTaskProgress({ step: 2, total: 2, note: 'تحليل محتوى الشاشة عبر رؤية Gemini الاصطناعية…' });

      // Step 2: Send to Multimodal Gemini Vision API
      const response = await fetch('/api/describe-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jpeg, question: '' }),
      });

      const data = await response.json();
      setRxBytes((b) => b + 1500);

      // Add to chat
      setMessages((prev) => [
        ...prev,
        {
          id: `shot-${Date.now()}`,
          kind: 'image',
          text: data.analysis || 'تم تحليل الشاشة بنجاح',
          imageB64: jpeg,
          timestamp: Date.now(),
        },
      ]);

      setActiveTask(null);
      setTaskProgress(null);
    } catch (err: any) {
      setActiveTask(null);
      setTaskProgress(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          kind: 'error',
          text: `❌ تعذر تحليل الشاشة: ${err.message}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  // Screenshot Only: captures one shot without AI analysis
  const handleScreenshotOnly = async () => {
    if (!runnerRef.current) return;
    const taskId = `shot-${Date.now()}`;
    setActiveTask(taskId);
    setTaskProgress({ step: 1, total: 1, note: 'التقاط الشاشة عبر ترخيص ScreenGate المفرد…' });

    try {
      const jpeg = await runnerRef.current.captureScreen();
      setRxBytes((b) => b + (jpeg.length * 0.75));

      setMessages((prev) => [
        ...prev,
        {
          id: `shot-${Date.now()}`,
          kind: 'image',
          text: 'تم التقاط لقطة الشاشة بطلبك.',
          imageB64: jpeg,
          timestamp: Date.now(),
        },
      ]);

      setActiveTask(null);
      setTaskProgress(null);
    } catch (err: any) {
      setActiveTask(null);
      setTaskProgress(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          kind: 'error',
          text: `❌ تعذر التقاط الشاشة: ${err.message}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  // Start live screen share (2 FPS)
  const handleStartShare = () => {
    if (!runnerRef.current) return;
    setIsSharing(true);
    runnerRef.current.startStream();
    setMessages((prev) => [
      ...prev,
      {
        id: `share-${Date.now()}`,
        kind: 'system',
        text: '🔴 بدأت مشاركة الشاشة المباشرة بمعدل إطارين في الثانية (2 FPS).',
        timestamp: Date.now(),
      },
    ]);
  };

  // Stop live screen share
  const handleStopShare = () => {
    if (!runnerRef.current) return;
    setIsSharing(false);
    setLiveFrame(null);
    runnerRef.current.stopStream();
    setMessages((prev) => [
      ...prev,
      {
        id: `share-stop-${Date.now()}`,
        kind: 'system',
        text: '⏹️ تم إيقاف مشاركة الشاشة وسحب التراخيص؛ الشاشة خاملة الآن.',
        timestamp: Date.now(),
      },
    ]);
  };

  // Cancel running task
  const handleCancelTask = () => {
    if (runnerRef.current) {
      runnerRef.current.cancelTask();
    }
    setActiveTask(null);
    setTaskProgress(null);
  };

  // Generate pair code
  const handleRequestPairCode = async (): Promise<string> => {
    try {
      const res = await fetch('/api/devices/pair-code', { method: 'POST' });
      const data = await res.json();
      return data.code || '88492015';
    } catch {
      return Math.floor(10000000 + Math.random() * 90000000).toString();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Cairo',sans-serif] flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header Bar */}
      <header className="bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-40 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100">WinAssistant</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  تحكم Windows عن بعد
                </span>
              </div>
              <p className="text-xs text-slate-400">
                أوامر عربية صوتية ونصية مدعومة بذكاء Gemini مع حماية ScreenGate
              </p>
            </div>
          </div>

          {/* ScreenGate Status Indicator */}
          <div className="flex items-center gap-2">
            <ScreenGateBadge gateState={gateState} />
          </div>

          {/* View Mode Navigation Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'split'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>عرض متزامن (المفضل)</span>
            </button>

            <button
              onClick={() => setViewMode('phone')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'phone'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>الهاتف (Android)</span>
            </button>

            <button
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'desktop'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>الكمبيوتر (Windows)</span>
            </button>

            <button
              onClick={() => setViewMode('docs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'docs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>ربط جهاز حقيقي</span>
            </button>
          </div>
        </div>
      </header>

      {/* Example Prompts Carousel / Bar */}
      <div className="bg-slate-900/40 border-b border-slate-800/60 px-4 py-2.5 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>جرّب أمراً سريعاً:</span>
          </span>
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            {exampleCommands.map((cmd, i) => (
              <button
                key={i}
                onClick={() => handleSendCommand(cmd)}
                disabled={activeTask !== null}
                className="shrink-0 px-3 py-1 rounded-full bg-slate-900 hover:bg-blue-900/40 border border-slate-800 hover:border-blue-500/50 text-slate-300 hover:text-blue-200 transition-all text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6">
        {/* VIEW 1: Split Screen (Android Phone + Windows PC Simulator) */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Android Phone Controller (4 cols on lg) */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  <span>تطبيق Android (تحكم كامل عن بعد)</span>
                </span>
                <span className="text-[11px] text-slate-500">Material 3 / RTL</span>
              </div>
              <AndroidController
                isPcOnline={isPcOnline}
                activeTask={activeTask}
                taskProgress={taskProgress}
                isSharing={isSharing}
                liveFrame={liveFrame}
                messages={messages}
                rxBytes={rxBytes}
                onSendCommand={handleSendCommand}
                onAnalyzeScreen={handleAnalyzeScreen}
                onScreenshotOnly={handleScreenshotOnly}
                onStartShare={handleStartShare}
                onStopShare={handleStopShare}
                onCancelTask={handleCancelTask}
                confirmRequest={confirmRequest}
                onAnswerConfirm={(approved) => {
                  if (runnerRef.current) runnerRef.current.confirmAction(approved);
                  setConfirmRequest(null);
                }}
                onRequestPairCode={handleRequestPairCode}
              />
            </div>

            {/* Right: Virtual Windows 11 PC Simulator (7 cols on lg) */}
            <div className="lg:col-span-7 flex flex-col">
              <div className="w-full flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-teal-400" />
                  <span>شاشة كمبيوتر Windows 11 (الوكيل ينفّذ هنا مباشرة)</span>
                </span>
                <span className="text-[11px] text-emerald-400 font-mono">ScreenGate Active</span>
              </div>
              <VirtualWindowsDesktop
                gateState={gateState}
                onGateChange={setGateState}
                onProgress={(step, total, note) => {
                  setTaskProgress({ step, total, note });
                  setRxBytes((b) => b + 180);
                }}
                onTaskDone={(summary) => {
                  setActiveTask(null);
                  setTaskProgress(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `done-${Date.now()}`,
                      kind: 'assistant',
                      text: `✅ ${summary}`,
                      timestamp: Date.now(),
                    },
                  ]);
                }}
                onTaskFailed={(error) => {
                  setActiveTask(null);
                  setTaskProgress(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `fail-${Date.now()}`,
                      kind: 'error',
                      text: `❌ فشل التنفيذ: ${error}`,
                      timestamp: Date.now(),
                    },
                  ]);
                }}
                onFrame={(frame) => {
                  setLiveFrame(frame);
                  setRxBytes((b) => b + 8500); // 2 FPS stream
                }}
                onRequestConfirm={(action, detail) => {
                  setConfirmRequest({ action, detail });
                }}
                registerRunner={(runner) => {
                  runnerRef.current = runner;
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: Full Phone Only */}
        {viewMode === 'phone' && (
          <div className="flex flex-col items-center justify-center py-4">
            <AndroidController
              isPcOnline={isPcOnline}
              activeTask={activeTask}
              taskProgress={taskProgress}
              isSharing={isSharing}
              liveFrame={liveFrame}
              messages={messages}
              rxBytes={rxBytes}
              onSendCommand={handleSendCommand}
              onAnalyzeScreen={handleAnalyzeScreen}
              onScreenshotOnly={handleScreenshotOnly}
              onStartShare={handleStartShare}
              onStopShare={handleStopShare}
              onCancelTask={handleCancelTask}
              confirmRequest={confirmRequest}
              onAnswerConfirm={(approved) => {
                if (runnerRef.current) runnerRef.current.confirmAction(approved);
                setConfirmRequest(null);
              }}
              onRequestPairCode={handleRequestPairCode}
            />
            {/* Hidden virtual desktop in background so runner still works */}
            <div className="hidden">
              <VirtualWindowsDesktop
                gateState={gateState}
                onGateChange={setGateState}
                onFrame={setLiveFrame}
                registerRunner={(runner) => {
                  runnerRef.current = runner;
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 3: Full Desktop Simulator Only */}
        {viewMode === 'desktop' && (
          <div className="space-y-4">
            <VirtualWindowsDesktop
              gateState={gateState}
              onGateChange={setGateState}
              onProgress={(step, total, note) => setTaskProgress({ step, total, note })}
              onFrame={setLiveFrame}
              registerRunner={(runner) => {
                runnerRef.current = runner;
              }}
            />
          </div>
        )}

        {/* VIEW 4: Real Agent Documentation & Pairing Guide */}
        {viewMode === 'docs' && <RealAgentInstructions />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            مشروع WinAssistant — تحكم آمن بويندوز من الهواتف الذكية مع خمول الشاشة التام وحماية Gemini
          </span>
          <span className="text-[11px] text-slate-600">
            Node.js 22 + React 19 + Express + Tailwind CSS
          </span>
        </div>
      </footer>
    </div>
  );
}
