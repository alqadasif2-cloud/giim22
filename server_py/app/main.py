import asyncio, os, re, time, uuid
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Header
from pydantic import BaseModel

from . import auth, db
from .hub import hub
from .planner import plan_command, describe_screen, PlannerError
from .policy import validate_plan, PolicyError

app = FastAPI(title="Windows AI Assistant Server")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")


# ---------------- REST: حسابات وربط الأجهزة ----------------
class Cred(BaseModel):
    email: str
    password: str


def _user_from_header(authorization: str | None) -> int:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "غير مصرح")
    data = auth.decode(authorization[7:], "user")
    if not data:
        raise HTTPException(401, "جلسة غير صالحة")
    return int(data["sub"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register")
def register(c: Cred):
    if os.environ.get("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(403, "التسجيل مغلق")
    if not EMAIL_RE.match(c.email) or len(c.password) < 8:
        raise HTTPException(400, "بريد غير صالح أو كلمة مرور أقل من 8 أحرف")
    try:
        db.q("INSERT INTO users(email,pw,created) VALUES(?,?,?)",
             (c.email.lower(), auth.hash_password(c.password), int(time.time())), commit=True)
    except Exception:
        raise HTTPException(409, "البريد مسجل مسبقا")
    row = db.q("SELECT id FROM users WHERE email=?", (c.email.lower(),), one=True)
    return {"token": auth.make_user_token(row["id"])}


@app.post("/auth/login")
def login(c: Cred):
    row = db.q("SELECT id,pw FROM users WHERE email=?", (c.email.lower(),), one=True)
    if not row or not auth.verify_password(c.password, row["pw"]):
        raise HTTPException(401, "بيانات الدخول غير صحيحة")
    return {"token": auth.make_user_token(row["id"])}


@app.post("/devices/pair-code")
def pair_code(authorization: str | None = Header(None)):
    uid = _user_from_header(authorization)
    db.q("DELETE FROM pair_codes WHERE expires<?", (int(time.time()),), commit=True)
    code = auth.new_pair_code()
    db.q("INSERT INTO pair_codes(code,user_id,expires) VALUES(?,?,?)",
         (code, uid, int(time.time()) + 300), commit=True)
    return {"code": code, "expires_in": 300}


class PairReq(BaseModel):
    code: str
    name: str = "Windows PC"


@app.post("/devices/pair")
def pair(req: PairReq):
    row = db.q("SELECT user_id,expires FROM pair_codes WHERE code=?", (req.code,), one=True)
    if not row or row["expires"] < time.time():
        raise HTTPException(400, "رمز الربط غير صالح أو منتهي")
    db.q("DELETE FROM pair_codes WHERE code=?", (req.code,), commit=True)  # استخدام لمرة واحدة
    dev = uuid.uuid4().hex
    db.q("INSERT INTO devices(id,user_id,name,created) VALUES(?,?,?,?)",
         (dev, row["user_id"], req.name[:60], int(time.time())), commit=True)
    db.audit(row["user_id"], dev, "pair", req.name)
    return {"device_id": dev, "device_token": auth.make_device_token(row["user_id"], dev, 1)}


@app.get("/devices")
def list_devices(authorization: str | None = Header(None)):
    uid = _user_from_header(authorization)
    rows = db.q("SELECT id,name,revoked FROM devices WHERE user_id=?", (uid,))
    return [{"id": r["id"], "name": r["name"], "revoked": bool(r["revoked"]),
             "online": hub.agent_online(r["id"])} for r in rows]


@app.delete("/devices/{device_id}")
async def revoke(device_id: str, authorization: str | None = Header(None)):
    uid = _user_from_header(authorization)
    db.q("UPDATE devices SET revoked=1 WHERE id=? AND user_id=?", (device_id, uid), commit=True)
    ws = hub.agents.pop(device_id, None)
    if ws:
        try:
            await ws.close()
        except Exception:
            pass
    db.audit(uid, device_id, "revoke")
    await hub.broadcast_status(uid)
    return {"ok": True}


# ---------------- WebSocket: الوكيل ----------------
@app.websocket("/ws/agent")
async def ws_agent(ws: WebSocket):
    # التوكن يُرسل في أول رسالة وليس في الرابط (حتى لا يظهر في السجلات)
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        data = auth.decode(str(first.get("token", "")), "device")
        row = db.q("SELECT user_id,revoked FROM devices WHERE id=?",
                   (data["dev"],), one=True) if data else None
        if not row or row["revoked"] or row["user_id"] != int(data["sub"]):
            await ws.close(code=4401)
            return
    except Exception:
        await ws.close(code=4401)
        return

    uid, dev = int(data["sub"]), data["dev"]
    old = hub.agents.get(dev)
    if old:
        try:
            await old.close()
        except Exception:
            pass
    hub.agents[dev] = ws
    hub.agent_owner[dev] = uid
    await ws.send_json({"type": "hello_ok"})
    await hub.broadcast_status(uid)

    async def _hb():
        while True:
            await asyncio.sleep(15)
            await ws.send_json({"type": "hb"})
    hb_task = asyncio.create_task(_hb())
    try:
        while True:
            msg = await ws.receive_json()
            await _from_agent(uid, dev, msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hb_task.cancel()
        if hub.agents.get(dev) is ws:
            hub.agents.pop(dev, None)
            hub.shares.pop(dev, None)
            for tid, t in list(hub.tasks.items()):
                if t["device"] == dev:
                    hub.tasks.pop(tid, None)
                    await hub.to_phones(uid, {"type": "task_failed", "task_id": tid,
                                              "error": "انقطع اتصال الكمبيوتر أثناء التنفيذ"})
            await hub.broadcast_status(uid)


async def _from_agent(uid: int, dev: str, msg: dict):
    t = msg.get("type")
    tid = msg.get("task_id")
    if t == "ping":
        return
    if t == "frame":  # بث مباشر: يمرر للهاتف فقط، لا يخزن ولا يرسل للذكاء الاصطناعي
        if hub.shares.get(dev) == tid:
            await hub.to_phones(uid, {"type": "frame", "task_id": tid, "jpeg": msg.get("jpeg", "")})
        return
    task = hub.tasks.get(tid)
    if t == "screenshot":
        if not task or task["device"] != dev:
            return
        jpeg = msg.get("jpeg", "")
        text = ""
        if task["kind"] == "analyze":
            try:
                text = await describe_screen(jpeg, task.get("text", ""))
            except PlannerError as e:
                text = f"تعذر التحليل: {e}"
        await hub.to_phones(uid, {"type": "screenshot", "task_id": tid, "jpeg": jpeg, "analysis": text})
        if task["kind"] in ("analyze", "shot"):
            hub.tasks.pop(tid, None)
            await hub.to_phones(uid, {"type": "task_done", "task_id": tid, "summary": text or "تم التقاط الصورة"})
        return
    if t in ("progress", "confirm_request"):
        await hub.to_phones(uid, {**{k: msg.get(k) for k in
                                     ("step", "total", "note", "action", "detail")},
                                  "type": t, "task_id": tid})
        return
    if t in ("task_done", "task_failed", "task_cancelled"):
        hub.tasks.pop(tid, None)
        await hub.to_phones(uid, {"type": t, "task_id": tid,
                                  "summary": msg.get("summary", ""), "error": msg.get("error", "")})
        db.audit(uid, dev, t, msg.get("summary") or msg.get("error", ""))
        return
    if t == "share_started":
        hub.shares[dev] = tid
        await hub.to_phones(uid, {"type": "share_started", "task_id": tid})
    elif t == "share_stopped":
        hub.shares.pop(dev, None)
        hub.tasks.pop(tid, None)
        await hub.to_phones(uid, {"type": "share_stopped", "task_id": tid})


# ---------------- WebSocket: الهاتف ----------------
@app.websocket("/ws/phone")
async def ws_phone(ws: WebSocket):
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        data = auth.decode(str(first.get("token", "")), "user")
        if not data:
            await ws.close(code=4401)
            return
    except Exception:
        await ws.close(code=4401)
        return
    uid = int(data["sub"])
    hub.phones[uid].add(ws)
    await ws.send_json({"type": "pc_status", "online": hub.user_device(uid) is not None})
    try:
        while True:
            msg = await ws.receive_json()
            await _from_phone(uid, ws, msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.phones[uid].discard(ws)
        if not hub.phones[uid]:
            # انقطع الهاتف: أوقف أي بث وأي مهمة بصرية فورا
            dev = hub.user_device(uid)
            if dev:
                await hub.to_agent(dev, {"type": "stop_all", "reason": "phone_disconnected"})
                hub.shares.pop(dev, None)


async def _from_phone(uid: int, ws: WebSocket, msg: dict):
    t = msg.get("type")
    if t == "ping":
        return
    dev = hub.user_device(uid)
    if not dev:
        await ws.send_json({"type": "task_failed", "task_id": msg.get("task_id", ""),
                            "error": "الكمبيوتر غير متصل، لم يتم تنفيذ شيء"})
        return
    tid = str(msg.get("task_id") or uuid.uuid4().hex)

    if t == "command":
        text = str(msg.get("text", "")).strip()[:2000]
        if not text:
            return
        await ws.send_json({"type": "stage", "task_id": tid, "stage": "planning"})
        try:
            res = await plan_command(text)
            if res["clarify"]:
                await ws.send_json({"type": "clarify", "task_id": tid, "question": res["clarify"]})
                return
            plan = validate_plan(res["plan"])
        except (PlannerError, PolicyError) as e:
            await ws.send_json({"type": "task_failed", "task_id": tid, "error": str(e)})
            return
        hub.tasks[tid] = {"user": uid, "device": dev, "kind": "plan", "text": text}
        db.audit(uid, dev, "command", text)
        await hub.to_agent(dev, {"type": "task", "task_id": tid, "plan": plan})
        await ws.send_json({"type": "stage", "task_id": tid, "stage": "executing", "total": len(plan)})

    elif t in ("analyze_screen", "screenshot"):
        kind = "analyze" if t == "analyze_screen" else "shot"
        hub.tasks[tid] = {"user": uid, "device": dev, "kind": kind, "text": str(msg.get("text", ""))}
        db.audit(uid, dev, t)
        await hub.to_agent(dev, {"type": "capture_once", "task_id": tid})

    elif t == "share_start":
        hub.tasks[tid] = {"user": uid, "device": dev, "kind": "share"}
        db.audit(uid, dev, "share_start")
        await hub.to_agent(dev, {"type": "share_start", "task_id": tid,
                                 "fps": 2, "max_seconds": int(msg.get("max_seconds", 600))})

    elif t == "share_stop":
        await hub.to_agent(dev, {"type": "share_stop"})

    elif t == "cancel":
        await hub.to_agent(dev, {"type": "cancel", "task_id": msg.get("task_id")})

    elif t == "confirm":
        await hub.to_agent(dev, {"type": "confirm", "task_id": msg.get("task_id"),
                                 "approve": bool(msg.get("approve"))})
