"""التنفيذ الفعلي على Windows. الأولوية لـ UI Automation (pywinauto) ثم لوحة المفاتيح عند الحاجة.
كل دالة ترجع نصا يصف ما حدث فعلا، وترفع خطأ واضحا عند الفشل (لا نتائج وهمية)."""
import ctypes
import os
import re
import subprocess
import time
import webbrowser

from .runner import Cancelled, StepError

APPS = {
    "notepad": "notepad.exe", "المفكرة": "notepad.exe",
    "calc": "calc.exe", "calculator": "calc.exe", "الحاسبة": "calc.exe",
    "explorer": "explorer.exe", "مستكشف الملفات": "explorer.exe",
    "paint": "mspaint.exe", "الرسام": "mspaint.exe",
    "chrome": "chrome.exe", "edge": "msedge.exe",
    "code": "code", "vscode": "code",
    "word": "winword.exe", "excel": "excel.exe",
    "settings": "ms-settings:", "الإعدادات": "ms-settings:",
}
_SAFE_NAME = re.compile(r"^[\w .\-+()]{1,80}$", re.UNICODE)
_SPECIAL = {"+": "{+}", "^": "{^}", "%": "{%}", "~": "{~}", "(": "{(}", ")": "{)}",
            "{": "{{}", "}": "{}}", "[": "{[}", "]": "{]}"}
_KEYMAP = {"ctrl": "^", "control": "^", "alt": "%", "shift": "+", "win": "{VK_LWIN}",
           "enter": "{ENTER}", "tab": "{TAB}", "esc": "{ESC}", "escape": "{ESC}",
           "backspace": "{BACKSPACE}", "delete": "{DELETE}", "space": "{SPACE}",
           "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}", "right": "{RIGHT}",
           "home": "{HOME}", "end": "{END}", "pageup": "{PGUP}", "pagedown": "{PGDN}"}


def keys_to_pywinauto(spec: str) -> str:
    """'ctrl+shift+s' -> '^+s' ؛ 'enter' -> '{ENTER}'."""
    parts = [p.strip().lower() for p in spec.split("+") if p.strip()]
    if not parts:
        raise StepError("اختصار فارغ")
    mods, key = parts[:-1], parts[-1]
    out = ""
    for m in mods:
        if m not in ("ctrl", "control", "alt", "shift"):
            raise StepError(f"مفتاح تعديل غير معروف: {m}")
        out += _KEYMAP[m]
    if key in _KEYMAP:
        out += _KEYMAP[key]
    elif re.fullmatch(r"f([1-9]|1[0-2])", key):
        out += "{" + key.upper() + "}"
    elif len(key) == 1:
        out += _SPECIAL.get(key, key)
    else:
        raise StepError(f"مفتاح غير معروف: {key}")
    return out


def escape_text(text: str) -> str:
    return "".join(_SPECIAL.get(c, c) for c in text).replace("\n", "{ENTER}")


def _desktop():
    from pywinauto import Desktop
    return Desktop(backend="uia")


def _windows():
    return [w for w in _desktop().windows() if w.window_text().strip()]


def _find_window(title: str, timeout: float = 0, cancel=None):
    title_l = (title or "").lower()
    end = time.time() + timeout
    while True:
        for w in _windows():
            if title_l and title_l in w.window_text().lower():
                return w
        if time.time() >= end:
            return None
        if cancel is not None and cancel.is_set():
            raise Cancelled()
        time.sleep(0.4)


def _foreground_hwnd():
    return ctypes.windll.user32.GetForegroundWindow()


class WindowsBackend:
    def __init__(self):
        self.last_window_title = ""

    # ---------- مساعدات ----------
    def _target(self, title: str | None, cancel):
        title = title or self.last_window_title
        if not title:
            raise StepError("لم يتم تحديد النافذة المستهدفة")
        w = _find_window(title, timeout=3, cancel=cancel)
        if not w:
            raise StepError(f"لم أجد نافذة باسم: {title}")
        try:
            w.set_focus()
        except Exception:
            pass
        time.sleep(0.3)
        if _foreground_hwnd() != w.handle:
            raise StepError("تعذر نقل النافذة للمقدمة؛ أوقفت الإدخال حتى لا يذهب لنافذة خاطئة")
        self.last_window_title = w.window_text()
        return w

    # ---------- الإجراءات ----------
    def open_app(self, name: str, cancel=None, **_):
        key = str(name).strip().lower()
        target = APPS.get(key) or APPS.get(str(name).strip())
        if target is None:
            if not _SAFE_NAME.match(str(name)):
                raise StepError("اسم برنامج غير صالح")
            target = str(name).strip()
        before = {w.handle for w in _windows()}
        try:
            if target.endswith(":"):
                os.startfile(target)
            else:
                subprocess.Popen(["cmd", "/c", "start", "", target], shell=False)
        except Exception as e:
            raise StepError(f"تعذر تشغيل {name}: {e}")
        end = time.time() + 12
        while time.time() < end:
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            new = [w for w in _windows() if w.handle not in before]
            if new:
                self.last_window_title = new[0].window_text()
                return f"تم فتح {name} (نافذة: {self.last_window_title})"
            time.sleep(0.5)
        raise StepError(f"أُرسل أمر تشغيل {name} لكن لم تظهر نافذة جديدة خلال 12 ثانية")

    def open_url(self, url: str, cancel=None, **_):
        if not str(url).startswith(("http://", "https://")):
            raise StepError("رابط غير مسموح")
        if not webbrowser.open(url):
            raise StepError("تعذر فتح المتصفح")
        return f"تم إرسال الرابط إلى المتصفح: {url}"

    def open_path(self, path: str, cancel=None, **_):
        p = os.path.expandvars(os.path.expanduser(str(path)))
        if not os.path.exists(p):
            raise StepError(f"المسار غير موجود: {p}")
        os.startfile(p)
        return f"تم فتح {p}"

    def search_files(self, query: str, root: str | None = None, cancel=None, **_):
        root = os.path.expandvars(os.path.expanduser(root or "~"))
        q = str(query).lower()
        found, end = [], time.time() + 20
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d.lower() not in ("node_modules", "$recycle.bin", "windows")]
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            for f in files:
                if q in f.lower():
                    found.append(os.path.join(dirpath, f))
                    if len(found) >= 20:
                        break
            if len(found) >= 20 or time.time() > end:
                break
        if not found:
            raise StepError(f"لم أجد ملفات تطابق «{query}» داخل {root}")
        return "نتائج البحث: " + " | ".join(found[:10])

    def focus_window(self, title: str, cancel=None, **_):
        self._target(title, cancel)
        return f"تم التركيز على: {self.last_window_title}"

    def type_text(self, text: str, window: str | None = None, cancel=None, **_):
        from pywinauto.keyboard import send_keys
        w = self._target(window, cancel)
        send_keys(escape_text(str(text)), with_spaces=True, pause=0.01)
        time.sleep(0.3)
        # تحقق: اقرأ نص عنصر التحرير إن كان متاحا
        try:
            for ctrl_type in ("Edit", "Document"):
                els = w.descendants(control_type=ctrl_type)
                for el in els:
                    cur = el.get_value() if hasattr(el, "get_value") else el.window_text()
                    if str(text).strip() and str(text).strip() in (cur or ""):
                        return "تمت الكتابة وتم التحقق من ظهور النص"
        except Exception:
            pass
        return "أُرسلت الكتابة إلى النافذة لكن لم أستطع قراءة المحتوى للتحقق"

    def press_keys(self, keys: str, window: str | None = None, cancel=None, **_):
        from pywinauto.keyboard import send_keys
        self._target(window, cancel)
        send_keys(keys_to_pywinauto(str(keys)))
        return f"تم الضغط على {keys}"

    def click_element(self, name: str, window: str | None = None, cancel=None, **_):
        w = self._target(window, cancel)
        for el in w.descendants():
            try:
                if str(name).lower() == (el.window_text() or "").lower() or \
                   str(name).lower() == (el.element_info.automation_id or "").lower():
                    try:
                        el.invoke()
                    except Exception:
                        el.click_input()
                    return f"تم الضغط على «{name}»"
            except Exception:
                continue
        raise StepError(f"لم أجد عنصرا باسم «{name}» (قد لا يوفر البرنامج عناصر قابلة للوصول)")

    def set_field(self, name: str, text: str, window: str | None = None, cancel=None, **_):
        w = self._target(window, cancel)
        for el in w.descendants(control_type="Edit"):
            try:
                if str(name).lower() in (el.window_text() or el.element_info.name or "").lower() \
                        or str(name).lower() == (el.element_info.automation_id or "").lower():
                    if el.element_info.element.CurrentIsPassword:
                        raise StepError("حقل كلمة مرور: لا أكتب فيه حماية لحسابك، أدخلها بنفسك")
                    el.set_edit_text(str(text))
                    return f"تم إدخال النص في «{name}»"
            except StepError:
                raise
            except Exception:
                continue
        raise StepError(f"لم أجد حقلا باسم «{name}»")

    def close_app(self, window: str, cancel=None, **_):
        w = _find_window(window, timeout=2, cancel=cancel)
        if not w:
            raise StepError(f"لم أجد نافذة باسم: {window}")
        title = w.window_text()
        if title.startswith("*") or title.endswith("*") or "●" in title:
            raise StepError("توجد تغييرات غير محفوظة في النافذة؛ لم أغلقها. احفظ أولا أو اطلب الإغلاق صراحة بعد الحفظ")
        w.close()
        time.sleep(1.2)
        if _find_window(title):
            raise StepError("النافذة ما زالت مفتوحة (ربما تنتظر حوار حفظ أو تأكيد)")
        return f"تم إغلاق {title}"

    def wait(self, seconds: float = 1, cancel=None, **_):
        end = time.time() + float(seconds)
        while time.time() < end:
            if cancel is not None and cancel.is_set():
                raise Cancelled()
            time.sleep(0.2)
        return None

    def list_windows(self, cancel=None, **_):
        titles = [w.window_text() for w in _windows()][:25]
        return "النوافذ المفتوحة: " + " | ".join(titles)

    def delete_path(self, path: str, cancel=None, **_):
        from send2trash import send2trash
        p = os.path.expandvars(os.path.expanduser(str(path)))
        if not os.path.exists(p):
            raise StepError(f"المسار غير موجود: {p}")
        send2trash(p)  # إلى سلة المحذوفات وليس حذفا نهائيا
        return f"نُقل إلى سلة المحذوفات: {p}"
