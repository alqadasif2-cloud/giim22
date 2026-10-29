/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * دليل تشغيل وربط وكيل Windows الحقيقي والخادم المحلي وتطبيق Android
 */

import React, { useState } from 'react';
import {
  Terminal,
  Download,
  Copy,
  Check,
  Shield,
  Smartphone,
  Monitor,
  Server,
  Wifi,
  AlertTriangle,
  Play,
  FileCode,
  ShieldCheck,
} from 'lucide-react';

export const RealAgentInstructions: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const localIp = '192.168.0.169';
  const localPort = '8000';
  const localServerUrl = `http://${localIp}:${localPort}`;

  const firewallCmd = `netsh advfirewall firewall add rule name="WinAssistant Server" dir=in action=allow protocol=TCP localport=${localPort}`;
  const pairingCmd = `WinAssistantAgent.exe pair --server ${localServerUrl} --code 12345678`;
  const runCmd = `WinAssistantAgent.exe run`;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 font-['Cairo',sans-serif] text-slate-200">
      {/* Intro Header */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              دليل الربط المحلي عبر Wi-Fi (192.168.0.169) وحل مشكلة اختفاء نافذة الوكيل
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              كل ما تحتاجه لتشغيل الخادم والوكيل محلياً على Windows 10 وربط الهاتف دون الحاجة لشراء استضافة خارجية.
            </p>
          </div>
        </div>
      </div>

      {/* Root Cause Card: Why CMD window was disappearing */}
      <div className="p-5 rounded-3xl bg-amber-950/30 border border-amber-500/30 space-y-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span>سبب اختفاء نافذة CMD فور النقر على WinAssistantAgent.exe:</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          السبب الرئيسي هو أن الكود الأصلي كان يطلب وسيطة فرعية إلزامية (مثل <code className="text-amber-300 font-mono">pair</code> أو <code className="text-amber-300 font-mono">run</code>).
          عند النقر المزدوج على ملف EXE من مستكشف Windows، يتم تشغيله بدون وسائط، مما كان يجعل مكتبة <code className="text-amber-300 font-mono">argparse</code> تظهر رسالة المساعدة وتنهي البرنامج فوراً (<code className="text-amber-300 font-mono">exit(2)</code>)، فتغلق Windows نافذة CMD في جزء من الثانية!
        </p>
        <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 pt-1">
          <Check className="w-4 h-4" />
          <span>تم إصلاح ذلك جذرياً: أصبح البرنامج يعرض واجهة تفاعلية عند النقر المزدوج، ويسجل الأخطاء في ملف agent.log، وينتظر ضغط Enter قبل الإغلاق.</span>
        </div>
      </div>

      {/* 3 Step Workflow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Server */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Server className="w-5 h-5" />
              <span>الخطوة 1: الخادم المحلي</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              شغّل الخادم على الكمبيوتر ليستمع على <code className="text-emerald-300">0.0.0.0:8000</code> ليتمكن الهاتف من الاتصال عبر شبكة Wi-Fi.
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300">
            start_local_server.bat
          </div>
        </div>

        {/* Step 2: Agent */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <Monitor className="w-5 h-5" />
              <span>الخطوة 2: وكيل Windows</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              اربط الوكيل بالخادم عبر رمز الربط، ثم شغّل الوكيل داخل جلسة المستخدم المفتوحة.
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-blue-300">
            start_agent.bat
          </div>
        </div>

        {/* Step 3: Android App */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-fuchsia-400 font-bold text-sm">
              <Smartphone className="w-5 h-5" />
              <span>الخطوة 3: هاتف Android</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              افتح التطبيق، وافحص الاتصال بعنوان <code className="text-fuchsia-300">{localServerUrl}</code>، ثم سجّل الدخول واستخرج رمز الربط.
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-fuchsia-300">
            فحص الاتصال ➔ دخول ➔ ربط
          </div>
        </div>
      </div>

      {/* Terminal Commands Guide */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span>الأوامر الجاهزة لتشغيل المنظومة محلياً (CMD / PowerShell):</span>
        </h3>

        {/* 1. Firewall */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>أ) فتح المنفذ 8000 في جدار حماية Windows (مهم جداً للـ Wi-Fi):</span>
            <span className="text-[10px] text-slate-500">تشغيل CMD كمسؤول (Run as Admin)</span>
          </div>
          <div className="relative">
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto" dir="ltr">
              {firewallCmd}
            </pre>
            <button
              onClick={() => copyToClipboard(firewallCmd, 'fw-cmd')}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="نسخ"
            >
              {copiedSection === 'fw-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 2. Pairing command */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            ب) أمر ربط الوكيل (استبدل 12345678 بالرمز الظاهر في تطبيق الهاتف):
          </div>
          <div className="relative">
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-blue-300 overflow-x-auto" dir="ltr">
              {pairingCmd}
            </pre>
            <button
              onClick={() => copyToClipboard(pairingCmd, 'pair-cmd')}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="نسخ"
            >
              {copiedSection === 'pair-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 3. Run command */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            ج) أمر تشغيل الوكيل بعد الربط:
          </div>
          <div className="relative">
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto" dir="ltr">
              {runCmd}
            </pre>
            <button
              onClick={() => copyToClipboard(runCmd, 'run-cmd')}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="نسخ"
            >
              {copiedSection === 'run-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ScreenGate Guarantee Card */}
      <div className="p-5 rounded-3xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>ضمانات خصوصية الشاشة (ScreenGate):</span>
        </div>
        <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
          <li><strong>لا تصوير عند الخمول:</strong> الوكيل يكون في وضع الخمول تماماً ولا يلتقط أي إطار ولا يراقب الشاشة إطلاقاً عند بدء التشغيل.</li>
          <li><strong>تراخيص محددة وصريحة:</strong> لا يمكن للمكتبة التقاط أي صورة ما لم تمنح بوابة ScreenGate ترخيصاً سارياً (Lease).</li>
          <li><strong>إلغاء فوري وسحب التراخيص:</strong> عند انتهاء المهمة أو ضغط "إيقاف المهمة" أو انقطاع الهاتف تُسحب كل التراخيص فوراً.</li>
          <li><strong>الذكاء الاصطناعي لا يرى الشاشة للتخطيط:</strong> أوامر التحكم تُخطط بناءً على النص العربي فقط دون إرسال الشاشة للذكاء الاصطناعي، وتحليل الشاشة لا يحدث إلا بطلبك الصريح عبر زر "تحليل الشاشة".</li>
        </ul>
      </div>
    </div>
  );
};
