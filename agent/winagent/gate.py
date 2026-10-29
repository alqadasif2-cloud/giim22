"""بوابة الشاشة: لا يمكن التقاط أي صورة بدون «ترخيص» ساري.
الأصل في الحالة الخاملة: لا تراخيص = لا التقاط. هذا هو الضمان البرمجي لشرط الخمول."""
import threading
import time


class ScreenLocked(RuntimeError):
    pass


class ScreenGate:
    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._lock = threading.Lock()
        self._leases: dict[str, dict] = {}   # task_id -> {kind, expires, uses}

    def grant(self, task_id: str, kind: str, ttl: float):
        """kind: once (لقطة واحدة بطلب المستخدم) | verify (لقطة واحدة أثناء مهمة) | share (بث حتى الإيقاف/المهلة)."""
        if kind not in ("once", "verify", "share"):
            raise ValueError(kind)
        with self._lock:
            self._leases[task_id] = {"kind": kind, "expires": self._clock() + ttl}

    def require(self, task_id: str):
        """تُستدعى قبل أي التقاط؛ تستهلك ترخيص اللقطة الواحدة."""
        with self._lock:
            lease = self._leases.get(task_id)
            if not lease or lease["expires"] < self._clock():
                self._leases.pop(task_id, None)
                raise ScreenLocked("التقاط الشاشة غير مصرح به الآن")
            if lease["kind"] in ("once", "verify"):
                self._leases.pop(task_id, None)

    def valid(self, task_id: str) -> bool:
        with self._lock:
            lease = self._leases.get(task_id)
            return bool(lease and lease["expires"] >= self._clock())

    def revoke(self, task_id: str | None = None):
        with self._lock:
            if task_id is None:
                self._leases.clear()
            else:
                self._leases.pop(task_id, None)

    def is_idle(self) -> bool:
        with self._lock:
            now = self._clock()
            return not any(l["expires"] >= now for l in self._leases.values())
