"""مشغل خادم WinAssistant المحلي لنظام Windows 10/11
يتحقق من الشبكة المحلية، يكتشف عنوان IP تلقائياً، ويهيئ المنفذ وجدار الحماية.
"""
import os
import secrets
import socket
import sys
import time

def get_local_ips():
    """اكتشاف عناوين IP المحلية للكمبيوتر على شبكة Wi-Fi أو Ethernet"""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass

    # محاولة إضافية عبر الاتصال بمقبس وهمي
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        if primary not in ips and not primary.startswith("127."):
            ips.insert(0, primary)
    except Exception:
        pass

    return ips or ["127.0.0.1"]

def is_port_in_use(port: int, host: str = "0.0.0.0") -> bool:
    """التحقق مما إذا كان المنفذ مستخدماً بالفعل"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0

def ensure_env_file():
    """التأكد من وجود ملف .env بمفتاح سري صالح"""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        secret = secrets.token_hex(32)
        content = f"""# إعدادات تم إنشاؤها تلقائياً للخادم المحلي
JWT_SECRET={secret}
ALLOW_REGISTRATION=true
DB_PATH=assistant.db
HOST=0.0.0.0
PORT=8000
# أدخل مفتاح Gemini أدناه لتفعيل التخطيط الذكي والرؤية (اختياري في الاختبار المحلي):
GEMINI_API_KEY=
"""
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("[✓] تم إنشاء ملف .env تلقائياً بمفتاح أمان عشوائي آمن.")

    # تحميل المتغيرات
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip()
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        print(f"[!] تحذير أثناء قراءة ملف .env: {e}")

    # التأكد من وجود JWT_SECRET
    if len(os.environ.get("JWT_SECRET", "")) < 32:
        os.environ["JWT_SECRET"] = secrets.token_hex(32)

def main():
    print("=" * 60)
    print("        تشغيل خادم WinAssistant المحلي (Local Server)")
    print("=" * 60)

    # 1. إعداد البيئة
    ensure_env_file()

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))

    # 2. فحص المنفذ
    if is_port_in_use(port, host):
        print(f"\n[!] خطأ: المنفذ {port} مشغول بالفعل بواسطة تطبيق آخر!")
        print("    - للتحقق من البرنامج المشغل له في Windows، نفّذ:")
        print(f"      netstat -ano | findstr :{port}")
        print("    - أو يمكنك تغيير المنفذ في ملف server/.env (مثلاً إلى PORT=8080).\n")
        sys.exit(1)

    # 3. عرض معلومات الشبكة
    local_ips = get_local_ips()
    print("\n[+] الخادم سيستمع على جميع واجهات الشبكة (0.0.0.0):")
    print(f"    - من هذا الكمبيوتر (محلياً):  http://localhost:{port}")
    print(f"    - من هاتف Android (عبر Wi-Fi):")
    for ip in local_ips:
        print(f"      http://{ip}:{port}")
    print(f"    - رابط فحص الصحة (Health):    http://{local_ips[0]}:{port}/health")

    print("\n[i] جدار الحماية (Windows Firewall):")
    print("    إذا تعذر وصول الهاتف إلى الخادم، افتح CMD كمسؤول ونفّذ الأمر التالي لفتح المنفذ:")
    print(f'    netsh advfirewall firewall add rule name="WinAssistant Server" dir=in action=allow protocol=TCP localport={port}')

    print("\n[i] الذكاء الاصطناعي (Gemini):")
    if os.environ.get("GEMINI_API_KEY"):
        print("    [✓] مفتاح GEMINI_API_KEY مضبوط.")
    else:
        print("    [!] مفتاح GEMINI_API_KEY غير مضبوط. سيعتمد الخادم على القواعد المحلية للتخطيط.")
        print("        لإضافته: افتح server/.env وألصق مفتاحك من Google AI Studio.")

    print("\n" + "=" * 60)
    print(f"بدء تشغيل Uvicorn على {host}:{port}... اضغط Ctrl+C للإيقاف.\n")

    try:
        import uvicorn
        # تشغيل uvicorn
        uvicorn.run("app.main:app", host=host, port=port, reload=False, log_level="info")
    except ImportError:
        print("\n[!] خطأ: حزمة uvicorn أو fastapi غير مثبتة.")
        print("    نفّذ: pip install -r requirements.txt")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[✓] تم إيقاف الخادم.")
    except Exception as e:
        print(f"\n[!] حدث خطأ أثناء تشغيل الخادم: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
