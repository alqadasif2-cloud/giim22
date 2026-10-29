"""سياسة الأمان على الخادم: قائمة بيضاء للإجراءات والتحقق من الخطة قبل إرسالها للوكيل.
الوكيل على Windows يعيد التحقق بنفسه (دفاع متعدد الطبقات)."""

ALLOWED_ACTIONS = {
    "open_app", "open_url", "open_path", "search_files", "type_text",
    "press_keys", "click_element", "set_field", "focus_window",
    "close_app", "wait", "list_windows", "delete_path", "verify_screen",
}
SENSITIVE_ACTIONS = {"delete_path"}
MAX_STEPS = 25
MAX_WAIT = 30


class PolicyError(ValueError):
    pass


def validate_plan(plan):
    """يرجع خطة منظفة أو يرفع PolicyError."""
    if not isinstance(plan, list) or not plan:
        raise PolicyError("الخطة فارغة")
    if len(plan) > MAX_STEPS:
        raise PolicyError("عدد الخطوات كبير جدا")
    clean = []
    for i, step in enumerate(plan):
        if not isinstance(step, dict):
            raise PolicyError(f"الخطوة {i + 1} غير صالحة")
        action = step.get("action")
        if action not in ALLOWED_ACTIONS:
            raise PolicyError(f"إجراء غير مسموح: {action}")
        args = step.get("args") or {}
        if not isinstance(args, dict):
            raise PolicyError(f"معاملات الخطوة {i + 1} غير صالحة")
        if action == "wait":
            try:
                args["seconds"] = max(0.0, min(float(args.get("seconds", 1)), MAX_WAIT))
            except (TypeError, ValueError):
                raise PolicyError("قيمة الانتظار غير صالحة")
        if action == "open_url":
            url = str(args.get("url", ""))
            if not url.startswith(("http://", "https://")):
                raise PolicyError("يسمح فقط بروابط http/https")
        clean.append({
            "action": action,
            "args": args,
            "sensitive": action in SENSITIVE_ACTIONS,
            "note": str(step.get("note", ""))[:200],
        })
    return clean
