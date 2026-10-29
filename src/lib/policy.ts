/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * سياسة الأمان: قائمة بيضاء للإجراءات والتحقق من الخطة قبل إرسالها للوكيل
 * مستوحى مباشرة من server/app/policy.py
 */

import { AllowedAction, PlanStep } from '../types/protocol.ts';

export const ALLOWED_ACTIONS: Set<AllowedAction> = new Set([
  'open_app',
  'open_url',
  'open_path',
  'search_files',
  'type_text',
  'press_keys',
  'click_element',
  'set_field',
  'focus_window',
  'close_app',
  'wait',
  'list_windows',
  'delete_path',
  'verify_screen',
]);

export const SENSITIVE_ACTIONS: Set<AllowedAction> = new Set(['delete_path']);

export const MAX_STEPS = 25;
export const MAX_WAIT = 30;

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export function validatePlan(rawPlan: unknown): PlanStep[] {
  if (!Array.isArray(rawPlan) || rawPlan.length === 0) {
    throw new PolicyError('الخطة فارغة');
  }

  if (rawPlan.length > MAX_STEPS) {
    throw new PolicyError(`عدد الخطوات كبير جداً (الحد الأقصى ${MAX_STEPS})`);
  }

  const clean: PlanStep[] = [];

  for (let i = 0; i < rawPlan.length; i++) {
    const step = rawPlan[i];
    if (!step || typeof step !== 'object') {
      throw new PolicyError(`الخطوة ${i + 1} غير صالحة`);
    }

    const action = step.action as AllowedAction;
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new PolicyError(`إجراء غير مسموح: ${action}`);
    }

    const args = (step.args && typeof step.args === 'object' ? { ...step.args } : {}) as Record<string, any>;

    if (action === 'wait') {
      const sec = parseFloat(args.seconds ?? 1);
      if (isNaN(sec)) {
        throw new PolicyError('قيمة الانتظار غير صالحة');
      }
      args.seconds = Math.max(0, Math.min(sec, MAX_WAIT));
    }

    if (action === 'open_url') {
      const url = String(args.url || '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new PolicyError('يسمح فقط بروابط http:// أو https://');
      }
    }

    clean.push({
      action,
      args,
      sensitive: SENSITIVE_ACTIONS.has(action),
      note: String(step.note || '').slice(0, 200),
    });
  }

  return clean;
}

export function getActionArabicName(action: string): string {
  switch (action) {
    case 'open_app':
      return 'فتح تطبيق';
    case 'open_url':
      return 'فتح موقع ويب';
    case 'open_path':
      return 'فتح مسار ملفات';
    case 'search_files':
      return 'البحث عن ملفات';
    case 'type_text':
      return 'كتابة نص';
    case 'press_keys':
      return 'الضغط على مفاتيح';
    case 'click_element':
      return 'النقر على عنصر';
    case 'set_field':
      return 'ملء حقل إدخال';
    case 'focus_window':
      return 'التركيز على نافذة';
    case 'close_app':
      return 'إغلاق التطبيق';
    case 'wait':
      return 'انتظار';
    case 'list_windows':
      return 'عرض النوافذ المفتوحة';
    case 'delete_path':
      return 'حذف ملف/مجلد (إلى سلة المحذوفات)';
    case 'verify_screen':
      return 'فحص حالة الشاشة';
    default:
      return action;
  }
}
