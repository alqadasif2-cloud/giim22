"""منفّذ الخطة: خطوة خطوة مع الإلغاء والتأكيد والتحقق. لا يعتمد على Windows مباشرة
(يستقبل backend) ليمكن اختباره."""
import threading

from . import policy
from .gate import ScreenLocked


class Cancelled(Exception):
    pass


class StepError(Exception):
    pass


def run_plan(plan, backend, *, cancel: threading.Event, confirm, progress, capture_verify):
    """confirm(step)->bool ; progress(i,total,note) ; capture_verify()->None (يرسل لقطة، قد يرفع ScreenLocked)
    يرجع ملخصا نصيا. يرفع Cancelled أو StepError."""
    policy.check_plan(plan)
    total = len(plan)
    results = []
    for i, step in enumerate(plan, 1):
        if cancel.is_set():
            raise Cancelled()
        action, args = step["action"], step.get("args", {})
        note = step.get("note") or action
        progress(i, total, note)

        if policy.needs_confirmation(step):
            if not confirm(step):
                raise StepError(f"لم يتم التأكيد على: {note}")
            if cancel.is_set():
                raise Cancelled()

        if action == "verify_screen":
            capture_verify()
            results.append("تم التقاط لقطة تحقق")
            continue
        if action == "delete_path" and policy.is_protected_path(str(args.get("path", ""))):
            raise StepError("مسار محمي لا يمكن حذفه")

        fn = getattr(backend, action, None)
        if fn is None:
            raise StepError(f"الإجراء غير مدعوم: {action}")
        try:
            out = fn(cancel=cancel, **args)
        except (Cancelled, ScreenLocked):
            raise
        except StepError:
            raise
        except TypeError as e:
            raise StepError(f"معاملات غير صحيحة للإجراء {action}") from e
        except Exception as e:  # أخطاء البرنامج الهدف
            raise StepError(f"{note}: {e}") from e
        if out:
            results.append(str(out))
    return "؛ ".join(results) if results else "تم التنفيذ"
