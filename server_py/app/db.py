import os, sqlite3, threading, time

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def conn():
    global _conn
    if _conn is None:
        path = os.environ.get("DB_PATH", "assistant.db")
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        _conn = sqlite3.connect(path, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, created INTEGER);
        CREATE TABLE IF NOT EXISTS devices(
          id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT, ver INTEGER DEFAULT 1,
          revoked INTEGER DEFAULT 0, created INTEGER);
        CREATE TABLE IF NOT EXISTS pair_codes(
          code TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, device_id TEXT, kind TEXT, detail TEXT, ts INTEGER);
        """)
        _conn.commit()
    return _conn


def q(sql, args=(), one=False, commit=False):
    with _lock:
        cur = conn().execute(sql, args)
        rows = cur.fetchall()
        if commit:
            conn().commit()
    return (rows[0] if rows else None) if one else rows


def audit(user_id, device_id, kind, detail=""):
    q("INSERT INTO audit(user_id,device_id,kind,detail,ts) VALUES(?,?,?,?,?)",
      (user_id, device_id, kind, str(detail)[:500], int(time.time())), commit=True)
