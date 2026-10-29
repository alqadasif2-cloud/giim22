import asyncio
import json
import logging
import threading
import time

import websockets

from . import policy
from .capture import grab_jpeg_b64
from .gate import ScreenGate, ScreenLocked
from .runner import Cancelled, StepError, run_plan

log = logging.getLogger("agent")
SERVER_SILENCE_LIMIT = 45   # ثانية: إن صمت الخادم أثناء بث، أوقف كل ما هو بصري


class Agent:
    def __init__(self, cfg: dict, backend):
        self.cfg = cfg
        self.backend = backend
        self.gate = ScreenGate()
        self.ws = None
        self.loop = None
        self.cancel_ev = threading.Event()
        self.task_id = None            # مهمة تنفيذ نشطة (واحدة فقط)
        self.share_task = None
        self.share_stop = asyncio.Event()
        self.confirm_future = None
        self.last_server_msg = time.monotonic()

    # ---------- اتصال ----------
    def ws_url(self):
        u = self.cfg["server"].rstrip("/")
        u = u.replace("https://", "wss://").replace("http://", "ws://")
        return u + "/ws/agent"

    async def run(self):
        delay = 1
        while True:
            try:
                async with websockets.connect(self.ws_url(), max_size=8 * 2**20, ping_interval=None) as ws:
                    self.ws, self.loop = ws, asyncio.get_running_loop()
                    await ws.send(json.dumps({"token": self.cfg["device_token"]}))
                    first = json.loads(await asyncio.wait_for(ws.recv(), 10))
                    if first.get("type") != "hello_ok":
                        raise ConnectionError("رفض الخادم الاتصال")
                    log.info("متصل — خامل بانتظار أمر")
                    delay = 1
                    self.last_server_msg = time.monotonic()
                    pinger = asyncio.create_task(self._pinger())
                    try:
                        async for raw in ws:
                            self.last_server_msg = time.monotonic()
                            await self._handle(json.loads(raw))
                    finally:
                        pinger.cancel()
            except Exception as e:
                log.warning("انقطع الاتصال: %s", e)
            finally:
                await self._stop_everything("disconnect")
                self.ws = None
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)   # إعادة اتصال متدرجة

    async def _pinger(self):
        while True:
            await asyncio.sleep(20)
            await self.send({"type": "ping"})

    async def send(self, msg):
        if self.ws:
            await self.ws.send(json.dumps(msg))

    def send_threadsafe(self, msg):
        if self.ws and self.loop:
            asyncio.run_coroutine_threadsafe(self.send(msg), self.loop)

    # ---------- إيقاف كل شيء بصري/تنفيذي ----------
    async def _stop_everything(self, reason):
        self.cancel_ev.set()
        self.share_stop.set()
        self.gate.revoke()
        if self.confirm_future and not self.confirm_future.done():
            self.confirm_future.set_result(False)

    # ---------- معالجة الرسائل ----------
    async def _handle(self, m):
        t = m.get("type")
        if t == "hb":
            return
        if t == "task":
            await self._start_task(m)
        elif t == "cancel":
            if m.get("task_id") == self.task_id:
                self.cancel_ev.set()
                if self.confirm_future and not self.confirm_future.done():
                    self.confirm_future.set_result(False)
            await self._stop_visual()
        elif t == "confirm":
            if self.confirm_future and not self.confirm_future.done():
                self.confirm_future.set_result(bool(m.get("approve")))
        elif t == "capture_once":
            await self._capture_once(m["task_id"])
        elif t == "share_start":
            await self._share_start(m["task_id"], float(m.get("fps", 2)), int(m.get("max_seconds", 600)))
        elif t == "share_stop":
            await self._stop_visual()
        elif t == "stop_all":
            await self._stop_everything(m.get("reason", ""))

    # ---------- لقطة واحدة بطلب المستخدم ----------
    async def _capture_once(self, tid):
        try:
            self.gate.grant(tid, "once", ttl=10)
            jpeg = await asyncio.to_thread(grab_jpeg_b64, self.gate, tid)
            await self.send({"type": "screenshot", "task_id": tid, "jpeg": jpeg})
        except Exception as e:
            await self.send({"type": "task_failed", "task_id": tid, "error": f"تعذر التقاط الشاشة: {e}"})
        finally:
            self.gate.revoke(tid)       # لا يبقى أي ترخيص بعد الانتهاء

    # ---------- بث مباشر ----------
    async def _share_start(self, tid, fps, max_seconds):
        await self._stop_visual()
        self.share_stop = asyncio.Event()
        self.gate.grant(tid, "share", ttl=max_seconds)
        self.share_task = asyncio.create_task(self._share_loop(tid, max(0.2, min(fps, 5)), max_seconds))

    async def _share_loop(self, tid, fps, max_seconds):
        await self.send({"type": "share_started", "task_id": tid})
        end = time.monotonic() + max_seconds
        try:
            while not self.share_stop.is_set() and time.monotonic() < end:
                if time.monotonic() - self.last_server_msg > SERVER_SILENCE_LIMIT:
                    break
                jpeg = await asyncio.to_thread(grab_jpeg_b64, self.gate, tid, 960, 45)
                await self.send({"type": "frame", "task_id": tid, "jpeg": jpeg})
                await asyncio.sleep(1 / fps)
        except ScreenLocked:
            pass
        except Exception as e:
            log.warning("خطأ في البث: %s", e)
        finally:
            self.gate.revoke(tid)
            try:
                await self.send({"type": "share_stopped", "task_id": tid})
            except Exception:
                pass

    async def _stop_visual(self):
        self.share_stop.set()
        if self.share_task:
            try:
                await asyncio.wait_for(self.share_task, 5)
            except Exception:
                pass
            self.share_task = None

    # ---------- تنفيذ خطة ----------
    async def _start_task(self, m):
        tid = m["task_id"]
        if self.task_id:
            await self.send({"type": "task_failed", "task_id": tid, "error": "الكمبيوتر مشغول بمهمة أخرى"})
            return
        try:
            policy.check_plan(m["plan"])
        except policy.PolicyError as e:
            await self.send({"type": "task_failed", "task_id": tid, "error": f"رفض الوكيل الخطة: {e}"})
            return
        self.task_id = tid
        self.cancel_ev = threading.Event()
        asyncio.create_task(self._run_task(tid, m["plan"], self.cancel_ev))

    async def _run_task(self, tid, plan, cancel_ev):
        def progress(i, total, note):
            self.send_threadsafe({"type": "progress", "task_id": tid, "step": i, "total": total, "note": note})

        def confirm(step):
            fut = asyncio.run_coroutine_threadsafe(self._ask_confirm(tid, step), self.loop)
            try:
                return fut.result(timeout=130)
            except Exception:
                return False

        def capture_verify():
            self.gate.grant(tid, "verify", ttl=10)
            jpeg = grab_jpeg_b64(self.gate, tid)
            self.send_threadsafe({"type": "screenshot", "task_id": tid, "jpeg": jpeg})

        try:
            summary = await asyncio.to_thread(
                run_plan, plan, self.backend, cancel=cancel_ev, confirm=confirm,
                progress=progress, capture_verify=capture_verify)
            await self.send({"type": "task_done", "task_id": tid, "summary": summary})
        except Cancelled:
            await self.send({"type": "task_cancelled", "task_id": tid, "summary": "تم إيقاف المهمة"})
        except (StepError, ScreenLocked) as e:
            await self.send({"type": "task_failed", "task_id": tid, "error": str(e)})
        except Exception as e:
            await self.send({"type": "task_failed", "task_id": tid, "error": f"خطأ غير متوقع: {e}"})
        finally:
            self.gate.revoke(tid)        # انتهت المهمة: لا ترخيص بصري باقٍ
            self.task_id = None

    async def _ask_confirm(self, tid, step):
        self.confirm_future = asyncio.get_running_loop().create_future()
        await self.send({"type": "confirm_request", "task_id": tid, "action": step["action"],
                         "detail": json.dumps(step.get("args", {}), ensure_ascii=False)})
        try:
            return await asyncio.wait_for(self.confirm_future, 120)
        except asyncio.TimeoutError:
            return False
