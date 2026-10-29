/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * خادم WinAssistant: توجيه، توثيق، تخطيط بالذكاء الاصطناعي، وربط الهاتف بوكيل Windows
 * متطابق مع مواصفات server/app/main.py وبروتوكول PROTOCOL.md
 */

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { planCommand, describeScreen } from './src/lib/planner.ts';
import { validatePlan } from './src/lib/policy.ts';
import { PlanStep, ProtocolMessage } from './src/types/protocol.ts';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// In-Memory Database Store (مطابق لـ assistant.db في الخادم الأصلي)
interface UserRecord {
  id: number;
  email: string;
  pwHash: string;
  created: number;
}

interface DeviceRecord {
  id: string;
  userId: number;
  name: string;
  version: number;
  revoked: boolean;
  created: number;
  lastSeen: number;
}

interface PairCodeRecord {
  code: string;
  userId: number;
  expires: number;
}

interface AuditRecord {
  id: number;
  userId: number;
  deviceId: string;
  kind: string;
  detail: string;
  timestamp: number;
}

const db = {
  users: new Map<number, UserRecord>(),
  devices: new Map<string, DeviceRecord>(),
  pairCodes: new Map<string, PairCodeRecord>(),
  auditLog: [] as AuditRecord[],
  nextUserId: 1,
  nextAuditId: 1,
};

// Seed default virtual device for instant out-of-the-box readiness
const DEFAULT_USER_ID = 1;
db.users.set(DEFAULT_USER_ID, {
  id: DEFAULT_USER_ID,
  email: 'user@winassistant.local',
  pwHash: hashPassword('password123'),
  created: Date.now(),
});

const DEFAULT_DEV_ID = 'dev-win-virtual-1';
db.devices.set(DEFAULT_DEV_ID, {
  id: DEFAULT_DEV_ID,
  userId: DEFAULT_USER_ID,
  name: 'كمبيوتر ويندوز الافتراضي (Windows 11 Pro)',
  version: 1,
  revoked: false,
  created: Date.now(),
  lastSeen: Date.now(),
});

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, originalHash] = stored.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    return false;
  }
}

function createToken(userId: number, type: 'user' | 'device', deviceId?: string): string {
  const payload = {
    sub: userId,
    typ: type,
    dev: deviceId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeToken(token: string): { sub: number; typ: string; dev?: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function audit(userId: number, deviceId: string, kind: string, detail: string = '') {
  db.auditLog.unshift({
    id: db.nextAuditId++,
    userId,
    deviceId,
    kind,
    detail: String(detail).slice(0, 500),
    timestamp: Date.now(),
  });
  if (db.auditLog.length > 200) {
    db.auditLog.pop();
  }
}

// ---------------- WebSocket Hub (مركز التوجيه) ----------------
class Hub {
  phones = new Map<number, Set<WebSocket>>();
  agents = new Map<string, WebSocket>();
  agentOwner = new Map<string, number>();
  tasks = new Map<string, { user: number; device: string; kind: string; text?: string }>();
  shares = new Map<string, string>(); // device_id -> task_id

  agentOnline(deviceId: string): boolean {
    return this.agents.has(deviceId);
  }

  userDevice(userId: number): string | null {
    // Return online agent owned by user, or default virtual agent
    for (const [dev, owner] of this.agentOwner.entries()) {
      if (owner === userId && this.agents.has(dev)) {
        return dev;
      }
    }
    // If virtual device is registered and not revoked, return it
    const virtual = db.devices.get(DEFAULT_DEV_ID);
    if (virtual && !virtual.revoked) {
      return DEFAULT_DEV_ID;
    }
    return null;
  }

  toPhones(userId: number, msg: ProtocolMessage) {
    const set = this.phones.get(userId);
    if (!set) return;
    const dead: WebSocket[] = [];
    const payload = JSON.stringify(msg);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        dead.push(ws);
      }
    }
    for (const d of dead) set.delete(d);
  }

  toAgent(deviceId: string, msg: ProtocolMessage): boolean {
    const ws = this.agents.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  broadcastStatus(userId: number) {
    const dev = this.userDevice(userId);
    this.toPhones(userId, {
      type: 'pc_status',
      online: dev !== null,
    });
  }
}

const hub = new Hub();

// REST Authentication & Device Management API
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'البريد أو كلمة المرور غير صالحة' });
  }
  for (const u of db.users.values()) {
    if (u.email === email) {
      return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
    }
  }
  const id = db.nextUserId++;
  const user: UserRecord = {
    id,
    email,
    pwHash: hashPassword(password),
    created: Date.now(),
  };
  db.users.set(id, user);
  const token = createToken(id, 'user');
  audit(id, '', 'register', email);
  return res.json({ token, user: { id, email } });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  let foundUser: UserRecord | null = null;
  for (const u of db.users.values()) {
    if (u.email === email) {
      foundUser = u;
      break;
    }
  }
  if (!foundUser || !verifyPassword(password, foundUser.pwHash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  const token = createToken(foundUser.id, 'user');
  audit(foundUser.id, '', 'login', email);
  return res.json({ token, user: { id: foundUser.id, email: foundUser.email } });
});

app.post('/api/devices/pair-code', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/, '') || createToken(DEFAULT_USER_ID, 'user');
  const decoded = decodeToken(token);
  const userId = decoded ? decoded.sub : DEFAULT_USER_ID;

  // 8 digit numeric code
  const code = Math.floor(10000000 + Math.random() * 90000000).toString();
  db.pairCodes.set(code, {
    code,
    userId,
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  audit(userId, '', 'generate_pair_code', code);
  return res.json({ code, expires_in: 300 });
});

app.post('/api/devices/pair', (req: Request, res: Response) => {
  const { code, name } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'رمز الربط مطلوب' });
  }
  const record = db.pairCodes.get(String(code).trim());
  if (!record || record.expires < Date.now()) {
    db.pairCodes.delete(String(code));
    return res.status(400).json({ error: 'رمز الربط غير صالح أو منتهي الصلاحية' });
  }

  db.pairCodes.delete(String(code));
  const deviceId = `dev-${crypto.randomBytes(6).toString('hex')}`;
  const devRecord: DeviceRecord = {
    id: deviceId,
    userId: record.userId,
    name: name ? String(name).slice(0, 60) : 'Windows PC',
    version: 1,
    revoked: false,
    created: Date.now(),
    lastSeen: Date.now(),
  };
  db.devices.set(deviceId, devRecord);
  const token = createToken(record.userId, 'device', deviceId);

  audit(record.userId, deviceId, 'device_paired', devRecord.name);
  hub.broadcastStatus(record.userId);

  return res.json({ device_id: deviceId, token, name: devRecord.name });
});

app.get('/api/devices', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/, '');
  const decoded = decodeToken(token);
  const userId = decoded ? decoded.sub : DEFAULT_USER_ID;

  const userDevices: any[] = [];
  for (const d of db.devices.values()) {
    if (d.userId === userId) {
      userDevices.push({
        id: d.id,
        name: d.name,
        revoked: d.revoked,
        online: d.id === DEFAULT_DEV_ID || hub.agentOnline(d.id),
        created: d.created,
      });
    }
  }

  return res.json(userDevices);
});

app.delete('/api/devices/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const dev = db.devices.get(id);
  if (dev) {
    dev.revoked = true;
    const ws = hub.agents.get(id);
    if (ws) {
      try {
        ws.close();
      } catch {}
      hub.agents.delete(id);
    }
    audit(dev.userId, id, 'revoke');
    hub.broadcastStatus(dev.userId);
  }
  return res.json({ ok: true });
});

// AI Planner REST Endpoint
app.post('/api/plan', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'النص مطلوب' });
    }
    const result = await planCommand(text);
    return res.json(result);
  } catch (err: any) {
    console.error('Plan error:', err);
    return res.status(500).json({ error: err.message || 'فشل في التخطيط' });
  }
});

// AI Vision Multimodal Screen Analysis
app.post('/api/describe-screen', async (req: Request, res: Response) => {
  try {
    const { jpeg, question } = req.body;
    if (!jpeg) {
      return res.status(400).json({ error: 'صورة الشاشة مطلوبة' });
    }
    const analysis = await describeScreen(jpeg, question || '');
    return res.json({ analysis });
  } catch (err: any) {
    console.error('Describe screen error:', err);
    return res.status(500).json({ error: err.message || 'فشل في تحليل الشاشة' });
  }
});

// Audit log endpoint
app.get('/api/audit', (req: Request, res: Response) => {
  return res.json(db.auditLog.slice(0, 50));
});

// System Status endpoint
app.get('/api/status', (req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    devicesCount: db.devices.size,
    activeAgentsCount: hub.agents.size,
  });
});

// ---------------- WebSocket Server Setup ----------------
const wssAgent = new WebSocketServer({ noServer: true });
const wssPhone = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';

  if (pathname === '/ws/agent') {
    wssAgent.handleUpgrade(request, socket, head, (ws) => {
      wssAgent.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/phone') {
    wssPhone.handleUpgrade(request, socket, head, (ws) => {
      wssPhone.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Agent WebSocket Handler
wssAgent.on('connection', (ws: WebSocket) => {
  let deviceId: string | null = null;
  let userId: number | null = null;

  const authTimeout = setTimeout(() => {
    if (!deviceId) {
      ws.close(4401);
    }
  }, 10000);

  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'hb' }));
    }
  }, 15000);

  ws.on('message', async (data: Buffer | string) => {
    try {
      const msg: ProtocolMessage = JSON.parse(data.toString());

      // First authentication message
      if (!deviceId) {
        clearTimeout(authTimeout);
        const token = msg.token || '';
        const decoded = decodeToken(token);
        if (!decoded || decoded.typ !== 'device' || !decoded.dev) {
          ws.close(4401);
          return;
        }

        const devRecord = db.devices.get(decoded.dev);
        if (!devRecord || devRecord.revoked || devRecord.userId !== decoded.sub) {
          ws.close(4401);
          return;
        }

        deviceId = decoded.dev;
        userId = decoded.sub;

        const oldWs = hub.agents.get(deviceId);
        if (oldWs && oldWs !== ws) {
          try {
            oldWs.close();
          } catch {}
        }

        hub.agents.set(deviceId, ws);
        hub.agentOwner.set(deviceId, userId);

        ws.send(JSON.stringify({ type: 'hello_ok' }));
        hub.broadcastStatus(userId);
        return;
      }

      if (!userId || !deviceId) return;

      const t = msg.type;
      const tid = msg.task_id;

      if (t === 'ping') return;

      if (t === 'frame') {
        // Stream frame: passes to phone without saving or sending to AI
        if (hub.shares.get(deviceId) === tid) {
          hub.toPhones(userId, {
            type: 'frame',
            task_id: tid,
            jpeg: msg.jpeg,
          });
        }
        return;
      }

      const task = tid ? hub.tasks.get(tid) : null;

      if (t === 'screenshot') {
        if (!task || task.device !== deviceId) return;
        const jpeg = msg.jpeg || '';
        let text = '';
        if (task.kind === 'analyze') {
          try {
            text = await describeScreen(jpeg, task.text || '');
          } catch (e: any) {
            text = `تعذر التحليل: ${e.message}`;
          }
        }

        hub.toPhones(userId, {
          type: 'screenshot',
          task_id: tid,
          jpeg,
          analysis: text,
        });

        if ((task.kind === 'analyze' || task.kind === 'shot') && tid) {
          hub.tasks.delete(tid);
          hub.toPhones(userId, {
            type: 'task_done',
            task_id: tid,
            summary: text || 'تم التقاط الصورة',
          });
        }
        return;
      }

      if (t === 'progress' || t === 'confirm_request') {
        hub.toPhones(userId, {
          type: t,
          task_id: tid,
          step: msg.step,
          total: msg.total,
          note: msg.note,
          action: msg.action,
          detail: msg.detail,
        });
        return;
      }

      if (t === 'task_done' || t === 'task_failed' || t === 'task_cancelled') {
        if (tid) hub.tasks.delete(tid);
        hub.toPhones(userId, {
          type: t,
          task_id: tid,
          summary: msg.summary,
          error: msg.error,
        });
        audit(userId, deviceId, t, msg.summary || msg.error || '');
        return;
      }

      if (t === 'share_started') {
        if (tid) hub.shares.set(deviceId, tid);
        hub.toPhones(userId, { type: 'share_started', task_id: tid });
      } else if (t === 'share_stopped') {
        hub.shares.delete(deviceId);
        if (tid) hub.tasks.delete(tid);
        hub.toPhones(userId, { type: 'share_stopped', task_id: tid });
      }
    } catch (e) {
      console.error('Agent message error:', e);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(authTimeout);
    if (deviceId && hub.agents.get(deviceId) === ws) {
      hub.agents.delete(deviceId);
      hub.shares.delete(deviceId);
      if (userId) {
        for (const [tid, task] of hub.tasks.entries()) {
          if (task.device === deviceId) {
            hub.tasks.delete(tid);
            hub.toPhones(userId, {
              type: 'task_failed',
              task_id: tid,
              error: 'انقطع اتصال الكمبيوتر أثناء التنفيذ',
            });
          }
        }
        hub.broadcastStatus(userId);
      }
    }
  });
});

// Phone WebSocket Handler
wssPhone.on('connection', (ws: WebSocket) => {
  let userId: number = DEFAULT_USER_ID;

  // Track phone client
  if (!hub.phones.has(userId)) {
    hub.phones.set(userId, new Set());
  }
  hub.phones.get(userId)!.add(ws);

  // Send initial PC status
  ws.send(
    JSON.stringify({
      type: 'pc_status',
      online: hub.userDevice(userId) !== null,
    })
  );

  ws.on('message', async (data: Buffer | string) => {
    try {
      const msg: ProtocolMessage = JSON.parse(data.toString());

      if (msg.token) {
        const decoded = decodeToken(msg.token);
        if (decoded && decoded.typ === 'user') {
          hub.phones.get(userId)?.delete(ws);
          userId = decoded.sub;
          if (!hub.phones.has(userId)) hub.phones.set(userId, new Set());
          hub.phones.get(userId)!.add(ws);
          ws.send(
            JSON.stringify({
              type: 'pc_status',
              online: hub.userDevice(userId) !== null,
            })
          );
          return;
        }
      }

      const t = msg.type;
      if (t === 'ping') return;

      const dev = hub.userDevice(userId);
      if (!dev) {
        ws.send(
          JSON.stringify({
            type: 'task_failed',
            task_id: msg.task_id || '',
            error: 'الكمبيوتر غير متصل، لم يتم تنفيذ شيء',
          })
        );
        return;
      }

      const tid = msg.task_id || crypto.randomUUID();

      if (t === 'command') {
        const text = String(msg.text || '').trim().slice(0, 2000);
        if (!text) return;

        ws.send(JSON.stringify({ type: 'stage', task_id: tid, stage: 'planning' }));

        try {
          const res = await planCommand(text);
          if (res.clarify) {
            ws.send(JSON.stringify({ type: 'clarify', task_id: tid, question: res.clarify }));
            return;
          }

          const plan = validatePlan(res.plan);
          hub.tasks.set(tid, { user: userId, device: dev, kind: 'plan', text });
          audit(userId, dev, 'command', text);

          // If device is real agent, forward via WS; if virtual agent, browser handles it directly
          hub.toAgent(dev, { type: 'task', task_id: tid, plan });

          ws.send(
            JSON.stringify({
              type: 'stage',
              task_id: tid,
              stage: 'executing',
              total: plan.length,
            })
          );
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'task_failed', task_id: tid, error: err.message }));
        }
      } else if (t === 'analyze_screen' || t === 'screenshot') {
        const kind = t === 'analyze_screen' ? 'analyze' : 'shot';
        hub.tasks.set(tid, { user: userId, device: dev, kind, text: msg.text || '' });
        audit(userId, dev, t);
        hub.toAgent(dev, { type: 'capture_once', task_id: tid });
      } else if (t === 'share_start') {
        hub.tasks.set(tid, { user: userId, device: dev, kind: 'share' });
        audit(userId, dev, 'share_start');
        hub.toAgent(dev, {
          type: 'share_start',
          task_id: tid,
          fps: 2,
          max_seconds: msg.max_seconds || 600,
        });
      } else if (t === 'share_stop') {
        hub.toAgent(dev, { type: 'share_stop' });
      } else if (t === 'cancel') {
        hub.toAgent(dev, { type: 'cancel', task_id: msg.task_id });
      } else if (t === 'confirm') {
        hub.toAgent(dev, {
          type: 'confirm',
          task_id: msg.task_id,
          approve: Boolean(msg.approve),
        });
      }
    } catch (e) {
      console.error('Phone message error:', e);
    }
  });

  ws.on('close', () => {
    hub.phones.get(userId)?.delete(ws);
    if (!hub.phones.get(userId) || hub.phones.get(userId)!.size === 0) {
      // Disconnected: stop active share and tasks on device
      const dev = hub.userDevice(userId);
      if (dev) {
        hub.toAgent(dev, { type: 'stop_all', reason: 'phone_disconnected' });
        hub.shares.delete(dev);
      }
    }
  });
});

// Vite Middleware Mounting (Dev) or Static files (Prod)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('.', 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('.', 'dist', 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`[WinAssistant] Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
