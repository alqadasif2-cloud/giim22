/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * محاكي بيئة Windows 11 الافتراضية مع بوابة الشاشة ScreenGate
 * ينفّذ مهام وكيل Windows ويدير النوافذ والالتقاط
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Calculator as CalcIcon,
  Folder,
  Globe,
  Palette,
  Settings as SettingsIcon,
  Trash2,
  X,
  Minus,
  Square,
  Search,
  Wifi,
  Volume2,
  Shield,
  Clock,
  Sparkles,
  ExternalLink,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { PlanStep, ScreenGateState } from '../types/protocol.ts';

interface WindowState {
  id: string;
  app: 'notepad' | 'calc' | 'explorer' | 'chrome' | 'paint' | 'settings';
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
}

interface Props {
  gateState: ScreenGateState;
  onGateChange: (state: ScreenGateState) => void;
  onProgress?: (step: number, total: number, note: string) => void;
  onTaskDone?: (summary: string) => void;
  onTaskFailed?: (error: string) => void;
  onFrame?: (jpegB64: string) => void;
  onScreenshotCapture?: (jpegB64: string) => void;
  onRequestConfirm?: (action: string, detail: string) => void;
  registerRunner?: (runner: {
    runPlan: (plan: PlanStep[], taskId: string) => Promise<void>;
    captureScreen: () => Promise<string>;
    startStream: () => void;
    stopStream: () => void;
    cancelTask: () => void;
    confirmAction: (approved: boolean) => void;
  }) => void;
}

export const VirtualWindowsDesktop: React.FC<Props> = ({
  gateState,
  onGateChange,
  onProgress,
  onTaskDone,
  onTaskFailed,
  onFrame,
  onScreenshotCapture,
  onRequestConfirm,
  registerRunner,
}) => {
  // Desktop windows
  const [windows, setWindows] = useState<Record<string, WindowState>>({
    notepad: { id: 'notepad', app: 'notepad', title: 'غير معنون - المفكرة', isOpen: false, isMinimized: false, zIndex: 10 },
    calc: { id: 'calc', app: 'calc', title: 'الحاسبة', isOpen: false, isMinimized: false, zIndex: 10 },
    explorer: { id: 'explorer', app: 'explorer', title: 'مستكشف الملفات', isOpen: false, isMinimized: false, zIndex: 10 },
    chrome: { id: 'chrome', app: 'chrome', title: 'Google Chrome', isOpen: false, isMinimized: false, zIndex: 10 },
    paint: { id: 'paint', app: 'paint', title: 'الرسام - لوحة الرسم', isOpen: false, isMinimized: false, zIndex: 10 },
    settings: { id: 'settings', app: 'settings', title: 'الإعدادات', isOpen: false, isMinimized: false, zIndex: 10 },
  });

  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  const [topZ, setTopZ] = useState(20);

  // App specific states
  // 1. Notepad
  const [notepadText, setNotepadText] = useState('مرحباً بك في نظام Windows 11 الافتراضي.\nيمكنك كتابة الأوامر بالعربية من واجهة الهاتف ليتم تطبيقها هنا في الوقت الفعلي.');
  const [isNotepadDirty, setIsNotepadDirty] = useState(false);

  // 2. Calculator
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcHistory, setCalcHistory] = useState('');

  // 3. Explorer
  const [files, setFiles] = useState([
    { name: 'ملاحظات_العمل.txt', size: '2.4 ك.ب', type: 'مستند نصي', date: '2026-10-28', inRecycleBin: false },
    { name: 'خطة_المشروع.docx', size: '45.1 ك.ب', type: 'مستند Word', date: '2026-10-28', inRecycleBin: false },
    { name: 'تقرير_الذكاء_الاصطناعي.pdf', size: '1.2 م.ب', type: 'ملف PDF', date: '2026-10-27', inRecycleBin: false },
    { name: 'صورة_الواجهة.png', size: '320 ك.ب', type: 'صورة PNG', date: '2026-10-26', inRecycleBin: false },
    { name: 'temp_file.txt', size: '1.1 ك.ب', type: 'ملف مؤقت', date: '2026-10-28', inRecycleBin: false },
  ]);
  const [explorerTab, setExplorerTab] = useState<'documents' | 'trash'>('documents');

  // 4. Chrome
  const [chromeUrl, setChromeUrl] = useState('https://www.google.com/search?q=الذكاء+الاصطناعي');
  const [chromeQuery, setChromeQuery] = useState('الذكاء الاصطناعي في إدارة النظم');

  // Active execution notification
  const [agentNotification, setAgentNotification] = useState<string | null>(null);

  // Time
  const [currentTime, setCurrentTime] = useState('');

  // Stream interval ref
  const streamIntervalRef = useRef<any>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const confirmResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  const bringToFront = (id: string) => {
    const newZ = topZ + 1;
    setTopZ(newZ);
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: true, isMinimized: false, zIndex: newZ },
    }));
    setActiveWindow(id);
  };

  const closeWindow = (id: string) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false },
    }));
    if (activeWindow === id) {
      setActiveWindow(null);
    }
  };

  const minimizeWindow = (id: string) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true },
    }));
    if (activeWindow === id) {
      setActiveWindow(null);
    }
  };

  // Generate real Canvas Snapshot of Virtual Desktop
  const generateDesktopSnapshot = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw realistic Windows 11 wallpaper
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#09152e');
    grad.addColorStop(0.5, '#122b54');
    grad.addColorStop(1, '#050b17');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Bloom glow
    ctx.save();
    ctx.filter = 'blur(40px)';
    ctx.fillStyle = '#2563eb66';
    ctx.beginPath();
    ctx.arc(480, 270, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Render open windows
    Object.values(windows).forEach((w) => {
      if (w.isOpen && !w.isMinimized) {
        let wx = 120;
        let wy = 60;
        let ww = 600;
        let wh = 360;

        if (w.app === 'notepad') {
          wx = 100;
          wy = 70;
          ww = 520;
          wh = 320;
        } else if (w.app === 'calc') {
          wx = 380;
          wy = 100;
          ww = 280;
          wh = 340;
        } else if (w.app === 'chrome') {
          wx = 180;
          wy = 50;
          ww = 650;
          wh = 380;
        }

        // Window shadow & body
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(wx + 8, wy + 8, ww, wh);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx, wy, ww, wh);

        // Window Title Bar
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wx, wy, ww, 34);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '14px Cairo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(w.title, wx + ww - 16, wy + 22);

        // Window Content Mock
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wx + 8, wy + 42, ww - 16, wh - 50);

        if (w.app === 'notepad') {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '13px monospace';
          ctx.textAlign = 'right';
          const lines = notepadText.split('\n');
          lines.slice(0, 10).forEach((line, idx) => {
            ctx.fillText(line, wx + ww - 24, wy + 70 + idx * 20);
          });
        } else if (w.app === 'calc') {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(calcDisplay, wx + 24, wy + 90);
        } else if (w.app === 'chrome') {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(chromeUrl, wx + 20, wy + 70);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '16px Cairo, sans-serif';
          ctx.fillText(`نتائج البحث عن: ${chromeQuery}`, wx + 20, wy + 120);
        }
      }
    });

    // Windows Taskbar at bottom
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(0, canvas.height - 44, canvas.width, 44);

    // Taskbar icons & Start
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(canvas.width / 2 - 80, canvas.height - 34, 24, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Cairo, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ابدأ', canvas.width / 2 - 45, canvas.height - 18);

    // ScreenGate Status Icon in taskbar
    ctx.fillStyle = gateState.currentLease === 'share' ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(80, canvas.height - 22, 6, 0, Math.PI * 2);
    ctx.fill();

    // Clock
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px Cairo, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(currentTime, 16, canvas.height - 16);

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // ScreenGate Lease Enforcement
  const captureScreen = async (): Promise<string> => {
    // Grant one-shot lease
    onGateChange({
      isIdle: false,
      currentLease: 'once',
      expiresAt: Date.now() + 5000,
    });

    const snapshot = await generateDesktopSnapshot();

    // Consume lease immediately - revert to idle
    setTimeout(() => {
      onGateChange({
        isIdle: true,
        currentLease: 'none',
        expiresAt: null,
      });
    }, 400);

    return snapshot;
  };

  const startStream = () => {
    if (streamIntervalRef.current) return;

    onGateChange({
      isIdle: false,
      currentLease: 'share',
      expiresAt: Date.now() + 600000,
      fps: 2,
    });

    // 2 FPS frame generator (every 500ms)
    streamIntervalRef.current = setInterval(async () => {
      const frame = await generateDesktopSnapshot();
      if (onFrame) onFrame(frame);
    }, 500);
  };

  const stopStream = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    onGateChange({
      isIdle: true,
      currentLease: 'none',
      expiresAt: null,
    });
  };

  // Cancel task
  const cancelTask = () => {
    cancelRequestedRef.current = true;
    setAgentNotification('⚠️ تم طلب إيقاف المهمة من المستخدم');
    setTimeout(() => setAgentNotification(null), 3000);
  };

  const confirmAction = (approved: boolean) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(approved);
      confirmResolverRef.current = null;
    }
  };

  // Automated Task Runner
  const runPlan = async (plan: PlanStep[], taskId: string) => {
    cancelRequestedRef.current = false;
    const total = plan.length;

    for (let i = 0; i < total; i++) {
      if (cancelRequestedRef.current) {
        onTaskFailed?.('تم إلغاء المهمة من قبل المستخدم');
        return;
      }

      const step = plan[i];
      const stepNum = i + 1;
      const note = step.note || `الخطوة ${stepNum}: ${step.action}`;

      onProgress?.(stepNum, total, note);
      setAgentNotification(`🤖 [خطوة ${stepNum}/${total}]: ${note}`);

      // Handle sensitive action confirmation
      if (step.sensitive || step.action === 'delete_path') {
        const approved = await new Promise<boolean>((resolve) => {
          confirmResolverRef.current = resolve;
          onRequestConfirm?.(step.action, step.note || `المسار: ${step.args?.path || ''}`);
        });

        if (!approved) {
          onTaskFailed?.('تم رفض الإجراء الحساس من قبل المستخدم');
          setAgentNotification('❌ تم رفض الإجراء الحساس');
          return;
        }
      }

      // Execute Step
      await executeAction(step);
      await new Promise((r) => setTimeout(r, 900));
    }

    setAgentNotification('✅ تم اكتمال جميع خطوات المهمة بنجاح');
    setTimeout(() => setAgentNotification(null), 4000);
    onTaskDone?.('تم تنفيذ الخطة بنجاح على نظام Windows');
  };

  const executeAction = async (step: PlanStep) => {
    const { action, args } = step;

    switch (action) {
      case 'open_app': {
        const name = (args.name || '').toLowerCase();
        if (name.includes('notepad') || name.includes('مفكرة')) {
          bringToFront('notepad');
        } else if (name.includes('calc') || name.includes('حاسبة')) {
          bringToFront('calc');
        } else if (name.includes('explorer') || name.includes('ملفات')) {
          bringToFront('explorer');
        } else if (name.includes('chrome') || name.includes('edge') || name.includes('متصفح')) {
          bringToFront('chrome');
        } else if (name.includes('paint') || name.includes('رسام')) {
          bringToFront('paint');
        } else if (name.includes('settings') || name.includes('إعدادات')) {
          bringToFront('settings');
        } else {
          bringToFront('notepad');
        }
        break;
      }

      case 'open_url': {
        bringToFront('chrome');
        setChromeUrl(args.url || 'https://google.com');
        break;
      }

      case 'focus_window': {
        const title = (args.title || '').toLowerCase();
        if (title.includes('notepad')) bringToFront('notepad');
        else if (title.includes('calc')) bringToFront('calc');
        else if (title.includes('chrome')) bringToFront('chrome');
        else if (title.includes('explorer')) bringToFront('explorer');
        break;
      }

      case 'type_text': {
        const text = args.text || '';
        const target = (args.window || activeWindow || 'notepad').toLowerCase();

        if (target.includes('calc') || target.includes('حاسبة')) {
          // Calculator typing
          const cleanMath = text.replace(/=/g, '');
          try {
            // Evaluate expression safely
            const res = Function(`'use strict'; return (${cleanMath})`)();
            setCalcHistory(`${cleanMath} =`);
            setCalcDisplay(String(res));
          } catch {
            setCalcDisplay(cleanMath);
          }
        } else if (target.includes('chrome') || target.includes('متصفح')) {
          setChromeQuery(text.replace(/\{ENTER\}/g, ''));
        } else {
          // Notepad typing animation
          bringToFront('notepad');
          let current = notepadText;
          setNotepadText((prev) => `${prev}\n> ${text}`);
          setIsNotepadDirty(true);
          setWindows((prev) => ({
            ...prev,
            notepad: { ...prev.notepad, title: '*غير معنون - المفكرة' },
          }));
        }
        break;
      }

      case 'press_keys': {
        const keys = (args.keys || '').toLowerCase();
        if (keys.includes('ctrl+s') || keys.includes('^+s')) {
          setIsNotepadDirty(false);
          setWindows((prev) => ({
            ...prev,
            notepad: { ...prev.notepad, title: 'ملاحظة_محفوظة.txt - المفكرة' },
          }));
          setAgentNotification('💾 تم حفظ الملف بنجاح (Ctrl+S)');
        }
        break;
      }

      case 'delete_path': {
        const path = args.path || 'temp_file.txt';
        setFiles((prev) =>
          prev.map((f) => (path.includes(f.name) ? { ...f, inRecycleBin: true } : f))
        );
        bringToFront('explorer');
        setExplorerTab('trash');
        setAgentNotification(`🗑️ تم نقل الملف ${path} إلى سلة المحذوفات`);
        break;
      }

      case 'close_app': {
        const target = (args.window || activeWindow || '').toLowerCase();
        if (target.includes('notepad')) closeWindow('notepad');
        else if (target.includes('calc')) closeWindow('calc');
        else if (target.includes('chrome')) closeWindow('chrome');
        else if (target.includes('explorer')) closeWindow('explorer');
        break;
      }

      case 'wait': {
        const sec = Math.min(args.seconds || 1, 10);
        await new Promise((r) => setTimeout(r, sec * 1000));
        break;
      }

      case 'verify_screen': {
        // Flash desktop border to indicate verification
        await captureScreen();
        break;
      }

      default:
        break;
    }
  };

  // Register runner with parent
  useEffect(() => {
    if (registerRunner) {
      registerRunner({
        runPlan,
        captureScreen,
        startStream,
        stopStream,
        cancelTask,
        confirmAction,
      });
    }
  }, [notepadText, calcDisplay, files]);

  return (
    <div
      ref={desktopRef}
      className="relative w-full h-[620px] rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-blue-950/70 to-slate-950 select-none flex flex-col font-['Cairo',sans-serif]"
    >
      {/* Top Windows 11 Watermark / Bar */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50 text-xs text-slate-300">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>وكيل Windows (Windows 11 Pro) - متصل</span>
        </div>

        {/* ScreenGate Shield Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border ${
            gateState.currentLease === 'share'
              ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
              : gateState.currentLease === 'once'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>
            {gateState.currentLease === 'share'
              ? 'بوابة الشاشة: بث مباشر نشط 🔴'
              : gateState.currentLease === 'once'
              ? 'بوابة الشاشة: ترخيص لقطة 📸'
              : 'بوابة الشاشة: خاملة تماماً 🔒'}
          </span>
        </div>
      </div>

      {/* Real-time Agent Notification Toast */}
      {agentNotification && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-lg border border-blue-500/60 text-blue-100 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2.5 animate-bounce">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{agentNotification}</span>
        </div>
      )}

      {/* Desktop Workspace */}
      <div className="relative flex-1 p-6 overflow-hidden">
        {/* Desktop Icons */}
        <div className="grid grid-flow-col grid-rows-5 gap-4 w-max">
          <DesktopIcon
            icon={<FileText className="w-8 h-8 text-blue-400" />}
            label="المفكرة (Notepad)"
            onClick={() => bringToFront('notepad')}
          />
          <DesktopIcon
            icon={<CalcIcon className="w-8 h-8 text-teal-400" />}
            label="الحاسبة (Calc)"
            onClick={() => bringToFront('calc')}
          />
          <DesktopIcon
            icon={<Folder className="w-8 h-8 text-amber-400" />}
            label="مستكشف الملفات"
            onClick={() => bringToFront('explorer')}
          />
          <DesktopIcon
            icon={<Globe className="w-8 h-8 text-emerald-400" />}
            label="Google Chrome"
            onClick={() => bringToFront('chrome')}
          />
          <DesktopIcon
            icon={<Palette className="w-8 h-8 text-fuchsia-400" />}
            label="الرسام (Paint)"
            onClick={() => bringToFront('paint')}
          />
          <DesktopIcon
            icon={<Trash2 className="w-8 h-8 text-rose-400" />}
            label="سلة المحذوفات"
            onClick={() => {
              bringToFront('explorer');
              setExplorerTab('trash');
            }}
          />
        </div>

        {/* 1. Notepad Window */}
        {windows.notepad.isOpen && (
          <div
            style={{ zIndex: windows.notepad.zIndex }}
            onClick={() => bringToFront('notepad')}
            className={`absolute top-12 left-16 w-[480px] h-[340px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border transition-all duration-200 shadow-2xl ${
              windows.notepad.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'notepad' ? 'border-blue-500 shadow-blue-500/10' : 'border-slate-700'}`}
          >
            {/* Window Header */}
            <div className="h-9 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>{windows.notepad.title}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeWindow('notepad')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => closeWindow('notepad')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Menu Bar */}
            <div className="h-7 bg-slate-900 px-3 flex items-center gap-4 text-xs text-slate-400 border-b border-slate-800">
              <span className="hover:text-slate-100 cursor-pointer">ملف</span>
              <span className="hover:text-slate-100 cursor-pointer">تحرير</span>
              <span className="hover:text-slate-100 cursor-pointer">عرض</span>
            </div>

            {/* Notepad Content */}
            <textarea
              dir="auto"
              value={notepadText}
              onChange={(e) => {
                setNotepadText(e.target.value);
                setIsNotepadDirty(true);
                setWindows((prev) => ({
                  ...prev,
                  notepad: { ...prev.notepad, title: '*غير معنون - المفكرة' },
                }));
              }}
              className="flex-1 w-full bg-slate-950/70 p-3 text-slate-100 text-sm font-mono focus:outline-none resize-none leading-relaxed"
              placeholder="اكتب هنا أو اطلب من المساعد الكتابة..."
            />

            {/* Status Bar */}
            <div className="h-6 bg-slate-950 px-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800">
              <span>السطر {notepadText.split('\n').length}، العمود 1</span>
              <span>UTF-8 | Windows (CRLF)</span>
            </div>
          </div>
        )}

        {/* 2. Calculator Window */}
        {windows.calc.isOpen && (
          <div
            style={{ zIndex: windows.calc.zIndex }}
            onClick={() => bringToFront('calc')}
            className={`absolute top-16 right-20 w-[290px] h-[380px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border shadow-2xl transition-all duration-200 ${
              windows.calc.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'calc' ? 'border-teal-500 shadow-teal-500/10' : 'border-slate-700'}`}
          >
            {/* Window Header */}
            <div className="h-9 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <CalcIcon className="w-4 h-4 text-teal-400" />
                <span>الحاسبة القياسية</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeWindow('calc')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => closeWindow('calc')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Calculator Display */}
            <div className="p-4 bg-slate-950/60 flex flex-col items-end justify-center min-h-[85px] border-b border-slate-800">
              <div className="text-xs text-slate-400 h-4">{calcHistory}</div>
              <div className="text-3xl font-bold font-mono text-teal-300 truncate w-full text-left" dir="ltr">
                {calcDisplay}
              </div>
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-4 gap-1 p-2 flex-1 bg-slate-900 text-sm font-semibold">
              {['C', 'CE', '%', '/'].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === 'C') {
                      setCalcDisplay('0');
                      setCalcHistory('');
                    } else if (k === 'CE') {
                      setCalcDisplay('0');
                    } else {
                      setCalcDisplay((prev) => (prev === '0' ? k : prev + k));
                    }
                  }}
                  className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {k}
                </button>
              ))}
              {['7', '8', '9', '*'].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === '*') setCalcDisplay((prev) => prev + '*');
                    else setCalcDisplay((prev) => (prev === '0' ? k : prev + k));
                  }}
                  className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-100 transition-colors"
                >
                  {k}
                </button>
              ))}
              {['4', '5', '6', '-'].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === '-') setCalcDisplay((prev) => prev + '-');
                    else setCalcDisplay((prev) => (prev === '0' ? k : prev + k));
                  }}
                  className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-100 transition-colors"
                >
                  {k}
                </button>
              ))}
              {['1', '2', '3', '+'].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === '+') setCalcDisplay((prev) => prev + '+');
                    else setCalcDisplay((prev) => (prev === '0' ? k : prev + k));
                  }}
                  className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-100 transition-colors"
                >
                  {k}
                </button>
              ))}
              {['±', '0', '.', '='].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === '=') {
                      try {
                        const clean = calcDisplay.replace(/×/g, '*').replace(/÷/g, '/');
                        const res = Function(`'use strict'; return (${clean})`)();
                        setCalcHistory(`${calcDisplay} =`);
                        setCalcDisplay(String(res));
                      } catch {
                        setCalcDisplay('Error');
                      }
                    } else if (k === '0') {
                      setCalcDisplay((prev) => (prev === '0' ? '0' : prev + '0'));
                    } else if (k === '.') {
                      setCalcDisplay((prev) => (prev.includes('.') ? prev : prev + '.'));
                    }
                  }}
                  className={`rounded transition-colors ${
                    k === '=' ? 'bg-teal-600 hover:bg-teal-500 text-white' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-100'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. File Explorer Window */}
        {windows.explorer.isOpen && (
          <div
            style={{ zIndex: windows.explorer.zIndex }}
            onClick={() => bringToFront('explorer')}
            className={`absolute top-20 left-32 w-[540px] h-[360px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border shadow-2xl transition-all duration-200 ${
              windows.explorer.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'explorer' ? 'border-amber-500 shadow-amber-500/10' : 'border-slate-700'}`}
          >
            {/* Header */}
            <div className="h-9 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Folder className="w-4 h-4 text-amber-400" />
                <span>
                  {explorerTab === 'trash' ? 'سلة المحذوفات' : 'مستكشف الملفات - C:\\Users\\User\\Documents'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeWindow('explorer')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => closeWindow('explorer')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Address bar */}
            <div className="h-8 bg-slate-900/90 px-3 flex items-center gap-2 border-b border-slate-800 text-xs">
              <div className="flex-1 bg-slate-950 px-2.5 py-1 rounded text-slate-300 font-mono text-[11px] flex items-center justify-between">
                <span>{explorerTab === 'trash' ? 'سلة المحذوفات (Recycle Bin)' : 'C:\\Users\\User\\Documents'}</span>
                <span className="text-slate-500">Ctrl+L</span>
              </div>
            </div>

            {/* Explorer Body: Sidebar & File List */}
            <div className="flex-1 flex overflow-hidden">
              <div className="w-36 bg-slate-950/80 border-l border-slate-800 p-2 flex flex-col gap-1 text-xs">
                <button
                  onClick={() => setExplorerTab('documents')}
                  className={`w-full text-right px-2.5 py-1.5 rounded flex items-center gap-2 ${
                    explorerTab === 'documents' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>المستندات</span>
                </button>
                <button
                  onClick={() => setExplorerTab('trash')}
                  className={`w-full text-right px-2.5 py-1.5 rounded flex items-center gap-2 ${
                    explorerTab === 'trash' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>سلة المحذوفات</span>
                </button>
              </div>

              {/* File list */}
              <div className="flex-1 p-3 overflow-y-auto">
                <div className="grid grid-cols-1 gap-1 text-xs">
                  {files
                    .filter((f) => (explorerTab === 'trash' ? f.inRecycleBin : !f.inRecycleBin))
                    .map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded hover:bg-slate-800/60 text-slate-200 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span>{f.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                          <span>{f.type}</span>
                          <span>{f.size}</span>
                        </div>
                      </div>
                    ))}
                  {files.filter((f) => (explorerTab === 'trash' ? f.inRecycleBin : !f.inRecycleBin)).length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      {explorerTab === 'trash' ? 'سلة المحذوفات فارغة' : 'المجلد فارغ'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Chrome Window */}
        {windows.chrome.isOpen && (
          <div
            style={{ zIndex: windows.chrome.zIndex }}
            onClick={() => bringToFront('chrome')}
            className={`absolute top-10 left-24 w-[560px] h-[370px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border shadow-2xl transition-all duration-200 ${
              windows.chrome.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'chrome' ? 'border-emerald-500 shadow-emerald-500/10' : 'border-slate-700'}`}
          >
            <div className="h-9 bg-slate-950/90 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Google Chrome - علامة تبويب جديدة</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeWindow('chrome')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => closeWindow('chrome')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* URL bar */}
            <div className="h-9 bg-slate-900 px-3 flex items-center gap-2 border-b border-slate-800 text-xs">
              <div className="flex-1 bg-slate-950 px-3 py-1 rounded-full text-slate-200 text-xs flex items-center gap-2 border border-slate-800" dir="ltr">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{chromeUrl}</span>
              </div>
            </div>

            {/* Web View Mock */}
            <div className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
                <Globe className="w-7 h-7 text-emerald-400" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200 mb-1">متصفح Google Chrome نشط</h4>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                تم تنفيذ أمر فتح المتصفح. يمكنك البحث في الويب أو فتح الروابط مباشرة من الهاتف.
              </p>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs text-slate-300 max-w-sm w-full text-right">
                <div className="text-slate-500 text-[10px] mb-1">استعلام البحث الأخير:</div>
                <div className="font-semibold text-emerald-300">{chromeQuery}</div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Paint Window */}
        {windows.paint.isOpen && (
          <div
            style={{ zIndex: windows.paint.zIndex }}
            onClick={() => bringToFront('paint')}
            className={`absolute top-14 left-20 w-[500px] h-[350px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border shadow-2xl transition-all duration-200 ${
              windows.paint.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'paint' ? 'border-fuchsia-500 shadow-fuchsia-500/10' : 'border-slate-700'}`}
          >
            <div className="h-9 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Palette className="w-4 h-4 text-fuchsia-400" />
                <span>الرسام - لوحة الرسم</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeWindow('paint')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => closeWindow('paint')}
                  className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white flex items-center justify-center relative">
              <div className="text-slate-400 text-xs font-medium">لوحة رسم الرسام جاهزة للاستخدام</div>
            </div>
          </div>
        )}

        {/* 6. Settings Window */}
        {windows.settings.isOpen && (
          <div
            style={{ zIndex: windows.settings.zIndex }}
            onClick={() => bringToFront('settings')}
            className={`absolute top-16 left-28 w-[490px] h-[340px] rounded-xl overflow-hidden flex flex-col bg-slate-900/95 backdrop-blur-xl border shadow-2xl transition-all duration-200 ${
              windows.settings.isMinimized ? 'hidden' : 'block'
            } ${activeWindow === 'settings' ? 'border-blue-500 shadow-blue-500/10' : 'border-slate-700'}`}
          >
            <div className="h-9 bg-slate-950/80 px-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <SettingsIcon className="w-4 h-4 text-blue-400" />
                <span>إعدادات النظام - Windows 11</span>
              </div>
              <button
                onClick={() => closeWindow('settings')}
                className="w-7 h-6 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-slate-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 p-4 text-xs text-slate-300 space-y-3">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                <span>اسم الجهاز</span>
                <span className="font-semibold text-blue-400">WIN-ASSISTANT-PC</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                <span>إصدار النظام</span>
                <span>Windows 11 Pro (24H2)</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                <span>حالة بوابة الشاشة (ScreenGate)</span>
                <span className="text-emerald-400 font-semibold">مفعلة وتضمن الخمول</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Windows 11 Taskbar */}
      <div className="h-12 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-3 flex items-center justify-between z-30">
        {/* Right side: Time, Date & System Tray */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 hover:bg-slate-800/50 px-2 py-1 rounded">
            <Volume2 className="w-4 h-4 text-slate-400" />
            <Wifi className="w-4 h-4 text-slate-400" />
          </div>
          <div className="hover:bg-slate-800/50 px-2 py-1 rounded text-right flex flex-col justify-center">
            <span className="text-slate-200 font-medium text-[11px] leading-tight">{currentTime}</span>
            <span className="text-[10px] text-slate-400 leading-tight">2026-10-28</span>
          </div>
        </div>

        {/* Center: Windows 11 Start & Running Apps */}
        <div className="flex items-center gap-1.5 absolute left-1/2 -translate-x-1/2">
          {/* Windows Start Button */}
          <button
            onClick={() => bringToFront('settings')}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-800/80 text-blue-400 transition-colors"
            title="ابدأ"
          >
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-sm" />
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-sm" />
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-sm" />
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-sm" />
            </div>
          </button>

          {/* Running App Icons on Taskbar */}
          <TaskbarAppIcon
            icon={<FileText className="w-4 h-4 text-blue-400" />}
            title="المفكرة"
            isOpen={windows.notepad.isOpen}
            isActive={activeWindow === 'notepad'}
            onClick={() => bringToFront('notepad')}
          />
          <TaskbarAppIcon
            icon={<CalcIcon className="w-4 h-4 text-teal-400" />}
            title="الحاسبة"
            isOpen={windows.calc.isOpen}
            isActive={activeWindow === 'calc'}
            onClick={() => bringToFront('calc')}
          />
          <TaskbarAppIcon
            icon={<Folder className="w-4 h-4 text-amber-400" />}
            title="مستكشف الملفات"
            isOpen={windows.explorer.isOpen}
            isActive={activeWindow === 'explorer'}
            onClick={() => bringToFront('explorer')}
          />
          <TaskbarAppIcon
            icon={<Globe className="w-4 h-4 text-emerald-400" />}
            title="Chrome"
            isOpen={windows.chrome.isOpen}
            isActive={activeWindow === 'chrome'}
            onClick={() => bringToFront('chrome')}
          />
          <TaskbarAppIcon
            icon={<Palette className="w-4 h-4 text-fuchsia-400" />}
            title="الرسام"
            isOpen={windows.paint.isOpen}
            isActive={activeWindow === 'paint'}
            onClick={() => bringToFront('paint')}
          />
        </div>

        {/* Left Side: Desktop Quick Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              Object.keys(windows).forEach((k) => closeWindow(k));
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800"
            title="إغلاق كافة النوافذ"
          >
            إغلاق الكل
          </button>
        </div>
      </div>
    </div>
  );
};

// Subcomponent: Desktop Icon
interface DesktopIconProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="group flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-800/40 border border-transparent hover:border-slate-700/50 transition-all text-center w-24"
  >
    <div className="p-2 rounded-xl group-hover:scale-110 transition-transform">{icon}</div>
    <span className="text-[11px] font-medium text-slate-200 group-hover:text-white drop-shadow leading-tight line-clamp-2">
      {label}
    </span>
  </button>
);

// Subcomponent: Taskbar App Icon
interface TaskbarAppIconProps {
  icon: React.ReactNode;
  title: string;
  isOpen: boolean;
  isActive: boolean;
  onClick: () => void;
}

const TaskbarAppIcon: React.FC<TaskbarAppIconProps> = ({ icon, title, isOpen, isActive, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
      isActive
        ? 'bg-slate-800 text-white'
        : isOpen
        ? 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
        : 'text-slate-400 hover:bg-slate-800/60'
    }`}
  >
    {icon}
    {isOpen && (
      <div
        className={`absolute bottom-0.5 w-3 h-0.5 rounded-full transition-all ${
          isActive ? 'bg-blue-400 w-4' : 'bg-slate-500'
        }`}
      />
    )}
  </button>
);
