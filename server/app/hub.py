"""مركز التوجيه: يربط جلسات الهاتف بوكيل Windows. لا يخزن صور الشاشة إطلاقا."""
import asyncio
from collections import defaultdict


class Hub:
    def __init__(self):
        self.phones: dict[int, set] = defaultdict(set)   # user_id -> websockets
        self.agents: dict[str, object] = {}              # device_id -> websocket
        self.agent_owner: dict[str, int] = {}            # device_id -> user_id
        self.tasks: dict[str, dict] = {}                 # task_id -> {user, device, kind}
        self.shares: dict[str, str] = {}                 # device_id -> task_id (بث نشط)

    def agent_online(self, device_id: str) -> bool:
        return device_id in self.agents

    def user_device(self, user_id: int) -> str | None:
        for dev, owner in self.agent_owner.items():
            if owner == user_id and dev in self.agents:
                return dev
        return None

    async def to_phones(self, user_id: int, msg: dict):
        dead = []
        for ws in list(self.phones[user_id]):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.phones[user_id].discard(ws)

    async def to_agent(self, device_id: str, msg: dict) -> bool:
        ws = self.agents.get(device_id)
        if not ws:
            return False
        try:
            await ws.send_json(msg)
            return True
        except Exception:
            return False

    async def broadcast_status(self, user_id: int):
        dev = self.user_device(user_id)
        await self.to_phones(user_id, {"type": "pc_status", "online": dev is not None})


hub = Hub()
