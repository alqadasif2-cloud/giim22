"""التحقق المحلي من الخطة على الوكيل. الوكيل لا يثق بالخادم ثقة عمياء."""
import os

ALLOWED_ACTIONS = {
    "open_app", "open_url", "open_path", "search_files", "type_text",
    "press_keys", "click_element", "set_field", "focus_window",
    "close_app", "wait", "list_windows", "delete_path", "verify_screen",
}
SENSITIVE_ACTIONS = {"delete_path"}
MAX_STEPS = 25

import ntpath

_BLOCKED_PREFIXES = {"c:\\windows", "c:\\program files", "c:\\program files (x86)", "c:\\programdata"}
for _k in ("WINDIR", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA"):
    _v = os.environ.get(_k, "")
    if _v:
        _BLOCKED_PREFIXES.add(ntpath.normpath(_v).lower().rstrip("\\"))
_EXACT_PROTECTED = {"c:\\users"}
_home = os.environ.get("USERPROFILE", "")
if _home:
    _EXACT_PROTECTED.add(ntpath.normpath(_home).lower().rstrip("\\"))


class PolicyError(ValueError):
    pass


def is_protected_path(path: str) -> bool:
    p = ntpath.normpath(str(path)).lower().rstrip("\\/")
    _drive, rest = ntpath.splitdrive(p)
    if rest in ("", "\\", "/", "."):          # جذر قرص أو مسار فارغ
        return True
    if p in _EXACT_PROTECTED:
        return True
    return any(p == b or p.startswith(b + "\\") for b in _BLOCKED_PREFIXES)


def check_plan(plan):
    if not isinstance(plan, list) or not plan or len(plan) > MAX_STEPS:
        raise PolicyError("خطة غير صالحة")
    for step in plan:
        if not isinstance(step, dict) or step.get("action") not in ALLOWED_ACTIONS:
            raise PolicyError(f"إجراء غير مسموح: {step.get('action') if isinstance(step, dict) else step}")
        if not isinstance(step.get("args", {}), dict):
            raise PolicyError("معاملات غير صالحة")
    return plan


def needs_confirmation(step) -> bool:
    return step.get("action") in SENSITIVE_ACTIONS or bool(step.get("sensitive"))
