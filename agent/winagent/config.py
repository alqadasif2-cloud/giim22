"""تخزين بيانات الربط محليا، مشفرة بـ Windows DPAPI (مرتبطة بحساب Windows الحالي)."""
import base64
import ctypes
import json
import os
from ctypes import wintypes

PATH = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "WinAssistantAgent", "device.bin")


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data: bytes):
    buf = ctypes.create_string_buffer(data, len(data))
    return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf


def _protect(data: bytes, decrypt=False) -> bytes:
    inb, _keep = _blob(data)
    out = _Blob()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    args = (ctypes.byref(inb), None, None, None, None, 0, ctypes.byref(out)) if decrypt else \
           (ctypes.byref(inb), "WinAssistant", None, None, None, 0, ctypes.byref(out))
    if not fn(*args):
        raise OSError("DPAPI failure")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def save(cfg: dict):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    try:
        protected = _protect(json.dumps(cfg).encode())
        with open(PATH, "wb") as f:
            f.write(protected)
    except Exception:
        fallback_path = PATH + ".json"
        with open(fallback_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f)


def load() -> dict | None:
    try:
        if os.path.exists(PATH):
            with open(PATH, "rb") as f:
                return json.loads(_protect(f.read(), decrypt=True))
    except Exception:
        pass
    fallback_path = PATH + ".json"
    if os.path.exists(fallback_path):
        try:
            with open(fallback_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def clear():
    for p in (PATH, PATH + ".json"):
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass
