/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * دليل تشغيل وربط وكيل Windows الحقيقي وتطبيق Android
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
  ExternalLink,
  Key,
} from 'lucide-react';

export const RealAgentInstructions: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const agentRequirements = `fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
PyJWT==2.9.0
pywinauto==0.6.9
pillow==11.0.0
websockets==13.1`;

  const pairingCommand = `python main.py pair --server ${window.location.origin} --code 12345678
python main.py run`;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 font-['Cairo',sans-serif] text-slate-200">
      {/* Intro Header */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">ربط كمبيوتر Windows حقيقي (Physical Agent)</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              يمكنك تشغيل وكيل بايثون على كمبيوترك الفعلي وربطه بهذا الخادم للتحكم الحقيقي بنوافذ Windows.
            </p>
          </div>
        </div>
      </div>

      {/* 3 Components Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
            <Smartphone className="w-5 h-5" />
            <span>1. تطبيق Android (أو الويب)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            واجهة المستخدم المبنية بـ Jetpack Compose. ترسل الأوامر الصوتية والنصية بالعربية وتستقبل اللقطات والبث المباشر.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Server className="w-5 h-5" />
            <span>2. الخادم + Gemini AI</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            الوسيط الموجه. يترجم الأوامر العربية عبر Gemini إلى خطة آمنة، ويفحص سياسة الأمان (قائمة بيضاء)، ويحلل الشاشة.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <Monitor className="w-5 h-5" />
            <span>3. وكيل Windows (EXE / Python)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            يعمل داخل جلسة المستخدم في Windows، ينفّذ الخطوات بـ UI Automation، ومزود ببوابة ScreenGate تضمن خمول الشاشة.
          </p>
        </div>
      </div>

      {/* Step by Step Execution on Windows */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span>خطوات تشغيل الوكيل على جهازك:</span>
        </h3>

        {/* Step 1 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            أولاً: إنشاء رمز ربط (Pair Code)
          </div>
          <p className="text-xs text-slate-400">
            من واجهة الهاتف (أو زر الإعدادات)، اضغط على "إنشاء رمز ربط". ستحصل على رمز مكون من 8 أرقام صالح لمدة 5 دقائق لمرة واحدة.
          </p>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            ثانياً: ربط الوكيل عبر موجه الأوامر (CMD أو PowerShell)
          </div>
          <div className="relative">
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto" dir="ltr">
              {pairingCommand}
            </pre>
            <button
              onClick={() => copyToClipboard(pairingCommand, 'pair-cmd')}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="نسخ الأمر"
            >
              {copiedSection === 'pair-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">
            ثالثاً: تشغيل الوكيل تلقائياً مع بدء تشغيل Windows
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            من Task Scheduler في Windows، أنشئ مهمة عند تسجيل الدخول (At Log on) لتشغيل الوكيل داخل جلسة المستخدم، لأن التحكم بالواجهات يتطلب سطح مكتب مرئي.
          </p>
        </div>
      </div>

      {/* ScreenGate Guarantee Card */}
      <div className="p-5 rounded-3xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Shield className="w-5 h-5" />
          <span>كيف تضمن بوابة الشاشة (ScreenGate) الخمول والخصوصية؟</span>
        </div>
        <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
          <li><strong>الأصل الخامل:</strong> لا يمكن لأي عملية التقاط أي إطار ما لم يوجد ترخيص ساري المفعول (Lease). بدون ترخيص ترفع الدالة استثناء <code className="text-emerald-300">ScreenLocked</code>.</li>
          <li><strong>تراخيص محددة فقط:</strong> لقطة مفردة صريحة بطلبك، أو لقطة تحقق محصورة داخل مهمة، أو بث مباشر يُلغى فور طلب الإيقاف أو انقطاع الاتصال.</li>
          <li><strong>حماية ضد حقن التعليمات:</strong> محرك Gemini لا يرى شاشة المستخدم أثناء التخطيط للأوامر إطلاقاً؛ التخطيط يعتمد فقط على نص الأمر العربي وليس على بيانات النوافذ.</li>
        </ul>
      </div>
    </div>
  );
};
