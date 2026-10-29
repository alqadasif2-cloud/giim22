/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * بروتوكول WinAssistant بين هاتف Android وخادم التوجيه ووكيل Windows
 */

// الإجراءات المسموح بها في سياسة الأمان
export type AllowedAction =
  | 'open_app'
  | 'open_url'
  | 'open_path'
  | 'search_files'
  | 'type_text'
  | 'press_keys'
  | 'click_element'
  | 'set_field'
  | 'focus_window'
  | 'close_app'
  | 'wait'
  | 'list_windows'
  | 'delete_path'
  | 'verify_screen';

export interface PlanStep {
  action: AllowedAction;
  args: Record<string, any>;
  note: string;
  sensitive?: boolean;
}

export interface PlanResponse {
  clarify: string | null;
  plan: PlanStep[];
}

export type MessageType =
  // الهاتف -> الخادم
  | 'command'
  | 'analyze_screen'
  | 'screenshot'
  | 'share_start'
  | 'share_stop'
  | 'cancel'
  | 'confirm'
  | 'ping'
  // الخادم -> الهاتف
  | 'pc_status'
  | 'stage'
  | 'progress'
  | 'clarify'
  | 'confirm_request'
  | 'frame'
  | 'share_started'
  | 'share_stopped'
  | 'task_done'
  | 'task_failed'
  | 'task_cancelled'
  // الخادم -> الوكيل
  | 'task'
  | 'capture_once'
  | 'stop_all'
  | 'hb'
  | 'hello_ok';

export interface ProtocolMessage {
  type: MessageType;
  token?: string;
  task_id?: string;
  text?: string;
  online?: boolean;
  stage?: 'planning' | 'executing';
  step?: number;
  total?: number;
  note?: string;
  action?: string;
  detail?: string;
  approve?: boolean;
  question?: string;
  jpeg?: string;
  analysis?: string;
  summary?: string;
  error?: string;
  plan?: PlanStep[];
  fps?: number;
  max_seconds?: number;
  reason?: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  revoked: boolean;
  online: boolean;
  lastSeen?: string;
}

export interface ChatMessage {
  id: string;
  kind: 'user' | 'assistant' | 'image' | 'error' | 'system';
  text: string;
  imageB64?: string;
  timestamp: number;
  progress?: {
    step: number;
    total: number;
    note: string;
  };
}

export interface ScreenGateState {
  isIdle: boolean;
  currentLease: 'none' | 'once' | 'verify' | 'share';
  expiresAt: number | null;
  fps?: number;
}
