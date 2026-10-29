/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, ShieldAlert, Radio, Camera, Lock } from 'lucide-react';
import { ScreenGateState } from '../types/protocol.ts';

interface Props {
  gateState: ScreenGateState;
}

export const ScreenGateBadge: React.FC<Props> = ({ gateState }) => {
  if (gateState.currentLease === 'share') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-medium shadow-sm animate-pulse">
        <Radio className="w-4 h-4 text-red-400 shrink-0" />
        <span>بث مباشر نشط (ترخيص مشاركة الشاشة سارٍ)</span>
      </div>
    );
  }

  if (gateState.currentLease === 'once' || gateState.currentLease === 'verify') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs font-medium shadow-sm">
        <Camera className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
        <span>ترخيص لقطة مفردة نشط (يُستهلك ويُقفل فوراً)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium shadow-sm">
      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
      <span>بوابة الشاشة خاملة تماماً (ScreenGate Locked) — لا بث ولا التقاط</span>
    </div>
  );
};
