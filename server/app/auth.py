import hashlib, hmac, os, secrets, time
import jwt

USER_TTL = 60 * 60 * 24 * 30


def _secret() -> str:
    s = os.environ.get("JWT_SECRET", "")
    if len(s) < 32:
        raise RuntimeError("JWT_SECRET must be set (>=32 chars)")
    return s


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + ":" + h.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, h_hex = stored.split(":")
        h = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(h.hex(), h_hex)
    except Exception:
        return False


def make_user_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id), "typ": "user", "exp": int(time.time()) + USER_TTL},
                      _secret(), algorithm="HS256")


def make_device_token(user_id: int, device_id: str, version: int) -> str:
    # بلا انتهاء صلاحية؛ الإبطال عبر رقم النسخة/revoked في قاعدة البيانات
    return jwt.encode({"sub": str(user_id), "dev": device_id, "ver": version, "typ": "device"},
                      _secret(), algorithm="HS256")


def decode(token: str, typ: str) -> dict | None:
    try:
        data = jwt.decode(token, _secret(), algorithms=["HS256"])
        return data if data.get("typ") == typ else None
    except Exception:
        return None


def new_pair_code() -> str:
    return f"{secrets.randbelow(10**8):08d}"
