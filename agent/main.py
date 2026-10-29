"""Windows Agent for WinAssistant
  مساعد التحكم بكمبيوتر Windows عبر الهاتف والشبكة المحلية
  
  الاستخدام من سطر الأوامر (CMD/PowerShell):
    WinAssistantAgent.exe pair --server http://192.168.0.169:8000 --code 12345678
    WinAssistantAgent.exe run
    WinAssistantAgent.exe unpair
    WinAssistantAgent.exe status
    WinAssistantAgent.exe --help
    WinAssistantAgent.exe --version
"""
import argparse
import asyncio
import logging
import os
import socket
import sys
import time
import traceback

VERSION = "1.0.0"
LOG_FILENAME = "agent.log"

def setup_logging():
    log_dir = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "WinAssistantAgent")
    try:
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, LOG_FILENAME)
    except Exception:
        log_path = LOG_FILENAME

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8", mode="a"),
        ],
    )
    return log_path

def pause_before_exit(code=0):
    """إبقاء نافذة CMD مفتوحة عند تشغيل البرنامج بالنقر المزدوج"""
    try:
        # إذا تم تشغيل البرنامج من مستكشف ويندوز (نافذة جديدة)
        if sys.stdin and sys.stdin.isatty():
            print("\n" + "=" * 50)
            input("اضغط مفتاح Enter لإغلاق هذه النافذة... ")
    except Exception:
        pass
    sys.exit(code)

def safe_import_dependencies():
    """التحقق من وجود جميع الحزم المطلوبة مع رسائل خطأ واضحة"""
    missing = []
    try:
        import requests
    except ImportError:
        missing.append("requests")
    try:
        import websockets
    except ImportError:
        missing.append("websockets")
    try:
        import PIL
    except ImportError:
        missing.append("Pillow")
    try:
        import mss
    except ImportError:
        missing.append("mss")
    try:
        import pywinauto
    except ImportError:
        missing.append("pywinauto")
    try:
        import send2trash
    except ImportError:
        missing.append("send2trash")

    if missing:
        print("\n" + "!" * 60)
        print("خطأ في الاعتماديات: هناك حزم برمجية ناقصة:")
        for m in missing:
            print(f"  - {m}")
        print("\nلتثبيتها، شغّل الأمر التالي في موجه الأوامر (CMD):")
        print(f"  pip install {' '.join(missing)}")
        print("!" * 60 + "\n")
        pause_before_exit(1)

def cmd_pair(a):
    import requests
    from winagent import config

    server_url = a.server.strip().rstrip("/")
    code = a.code.strip()
    name = a.name or socket.gethostname()

    print(f"\n[+] جارٍ الربط مع الخادم: {server_url}")
    print(f"[+] رمز الربط: {code}")
    print(f"[+] اسم الجهاز: {name}")

    try:
        r = requests.post(
            f"{server_url}/devices/pair",
            json={"code": code, "name": name},
            timeout=20,
        )
    except requests.exceptions.ConnectionError as e:
        print("\n[!] فشل الاتصال بالخادم:")
        print(f"    - تأكد من تشغيل الخادم على العنوان: {server_url}")
        print("    - تأكد من أن الهاتف والكمبيوتر متصلان بنفس شبكة Wi-Fi.")
        print("    - تأكد من سماح جدار الحماية (Windows Firewall) للمنفذ المستخدم.")
        logging.error("ConnectionError during pairing: %s", e)
        return False
    except Exception as e:
        print(f"\n[!] خطأ أثناء الاتصال: {e}")
        logging.error("Error during pairing: %s", e)
        return False

    if r.status_code != 200:
        err_msg = r.json().get("detail", r.text) if r.headers.get("content-type") == "application/json" else r.text
        print(f"\n[!] فشل الربط من الخادم (رمز {r.status_code}): {err_msg}")
        return False

    d = r.json()
    config.save({
        "server": server_url,
        "device_id": d["device_id"],
        "device_token": d["device_token"],
        "name": name,
    })
    print("\n[✓] تم الربط بنجاح!")
    print(f"    معرف الجهاز: {d['device_id']}")
    print("    يمكنك الآن تشغيل الوكيل عبر أمر: WinAssistantAgent.exe run")
    return True

def cmd_run(_=None):
    from winagent import config
    from winagent.app import Agent
    from winagent.backend_win import WindowsBackend

    cfg = config.load()
    if not cfg:
        print("\n[!] لم يتم ربط هذا الجهاز بأي خادم بعد.")
        print("    يرجى ربط الجهاز أولاً عبر الأمر: WinAssistantAgent.exe pair --server <URL> --code <CODE>")
        print("    أو تشغيل البرنامج بدون وسائط لإدخال بيانات الربط تفاعلياً.")
        return False

    server_url = cfg.get("server", "غير معروف")
    dev_id = cfg.get("device_id", "غير معروف")
    print("\n" + "=" * 55)
    print("      WinAssistant Windows Agent — قيد التشغيل")
    print("=" * 55)
    print(f" الخادم المستهدف: {server_url}")
    print(f" معرّف الجهاز:    {dev_id}")
    print(f" حماية الشاشة:   بوابة ScreenGate نشطة (الشاشة خاملة تماماً)")
    print("=" * 55)
    print("اضغط Ctrl+C في أي وقت لإيقاف الوكيل.\n")

    try:
        asyncio.run(Agent(cfg, WindowsBackend()).run())
    except KeyboardInterrupt:
        print("\n[✓] تم إيقاف الوكيل من قبل المستخدم.")
    except Exception as e:
        print(f"\n[!] حدث خطأ أثناء تشغيل الوكيل: {e}")
        logging.error("Exception in Agent runner:\n%s", traceback.format_exc())
        return False
    return True

def cmd_status(_=None):
    from winagent import config
    cfg = config.load()
    print("\n" + "-" * 40)
    print("حالة الوكيل المحلي (Agent Status):")
    print("-" * 40)
    if not cfg:
        print("الحالة: غير مربوط (Unpaired)")
        print("ملف الإعدادات: غير موجود")
    else:
        print("الحالة: مربوط وجاهز (Paired)")
        print(f"الخادم: {cfg.get('server')}")
        print(f"معرف الجهاز: {cfg.get('device_id')}")
        print(f"اسم الجهاز: {cfg.get('name', 'Windows PC')}")
    print("-" * 40 + "\n")

def interactive_menu():
    """واجهة تفاعلية تظهر عند النقر المزدوج على البرنامج بدون وسائط"""
    from winagent import config
    cfg = config.load()

    print("\n" + "=" * 55)
    print(f"   WinAssistant Agent v{VERSION} — مساعد Windows الذكي")
    print("=" * 55)

    if cfg:
        print(f"الجهاز مربوط حالياً بالخادم:")
        print(f"  - الخادم: {cfg.get('server')}")
        print(f"  - الجهاز: {cfg.get('name', 'Windows PC')} ({cfg.get('device_id')[:8]}...)")
        print("\nاختر العملية المطلوبة:")
        print("  [1] تشغيل الوكيل الآن (Run Agent) [الافتراضي]")
        print("  [2] التحقق من حالة الاتصال (Status)")
        print("  [3] إعادة ربط الجهاز برمز جديد (Re-pair)")
        print("  [4] فك الربط محلياً (Unpair)")
        print("  [5] خروج")

        try:
            choice = input("\nأدخل رقم الخيار (1-5) [1]: ").strip()
        except EOFError:
            choice = "1"

        if choice in ("", "1"):
            cmd_run()
        elif choice == "2":
            cmd_status()
        elif choice == "3":
            prompt_and_pair()
        elif choice == "4":
            config.clear()
            print("[✓] تم فك الربط محلياً بنجاح.")
        elif choice == "5":
            return
        else:
            print("خيار غير صحيح.")
    else:
        print("لم يتم ربط هذا الكمبيوتر بالخادم بعد.")
        print("لبدء الاستخدام، اتبع الخطوات:")
        print("  1. افتح تطبيق الهاتف وأنشئ رمز ربط (Pair Code).")
        print("  2. أدخل عنوان الخادم والرمز أدناه.\n")
        prompt_and_pair()

def prompt_and_pair():
    default_server = "http://192.168.0.169:8000"
    try:
        server_input = input(f"أدخل عنوان الخادم [{default_server}]: ").strip()
        server = server_input if server_input else default_server
        code = input("أدخل رمز الربط المكون من 8 أرقام: ").strip()
        if not code:
            print("[!] رمز الربط مطلوب.")
            return

        class DummyArgs:
            pass
        a = DummyArgs()
        a.server = server
        a.code = code
        a.name = socket.gethostname()

        if cmd_pair(a):
            run_now = input("\nهل تريد تشغيل الوكيل الآن؟ (Y/n) [Y]: ").strip().lower()
            if run_now in ("", "y", "yes", "نعم"):
                cmd_run()
    except (KeyboardInterrupt, EOFError):
        print("\nتم الإلغاء.")

def main():
    log_path = setup_logging()

    # إذا تم النقر المزدوج على البرنامج أو تشغيله بدون وسائط
    if len(sys.argv) == 1:
        safe_import_dependencies()
        try:
            interactive_menu()
        except Exception as e:
            print(f"\n[!] حدث خطأ غير متوقع: {e}")
            logging.error("Unexpected error in interactive menu:\n%s", traceback.format_exc())
        pause_before_exit(0)

    p = argparse.ArgumentParser(
        prog="WinAssistantAgent",
        description="وكيل Windows للتحكم عن بعد عبر الأوامر الصوتية والنصية باللغة العربية",
        epilog="مثال: WinAssistantAgent.exe pair --server http://192.168.0.169:8000 --code 12345678",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION} (Windows 10/11 64-bit)")

    sub = p.add_subparsers(dest="cmd", help="الأوامر المتاحة")

    # أمر pair
    sp_pair = sub.add_parser("pair", help="ربط هذا الكمبيوتر بالخادم عبر رمز لمرة واحدة")
    sp_pair.add_argument("--server", required=True, help="عنوان الخادم (مثال: http://192.168.0.169:8000)")
    sp_pair.add_argument("--code", required=True, help="رمز الربط المكون من 8 أرقام المستخرج من الهاتف")
    sp_pair.add_argument("--name", help="اسم مخصص للجهاز (افتراضياً اسم الكمبيوتر)")
    sp_pair.set_defaults(fn=cmd_pair)

    # أمر run
    sp_run = sub.add_parser("run", help="تشغيل الوكيل والاستماع لأوامر الهاتف")
    sp_run.set_defaults(fn=cmd_run)

    # أمر unpair
    sp_unpair = sub.add_parser("unpair", help="فك ربط هذا الجهاز محلياً وحذف مفاتيح التوثيق")
    from winagent import config
    sp_unpair.set_defaults(fn=lambda _: (config.clear(), print("[✓] تم فك الربط محلياً")))

    # أمر status
    sp_status = sub.add_parser("status", help="عرض حالة الربط الحالية للجهاز")
    sp_status.set_defaults(fn=cmd_status)

    try:
        a = p.parse_args()
        if not a.cmd:
            interactive_menu()
            pause_before_exit(0)
        safe_import_dependencies()
        success = a.fn(a)
        if success is False:
            pause_before_exit(1)
    except KeyboardInterrupt:
        print("\nتم الإيقاف.")
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"\n[!] حدث خطأ: {e}")
        logging.error("Unhandled exception in main:\n%s", traceback.format_exc())
        pause_before_exit(1)

if __name__ == "__main__":
    main()
