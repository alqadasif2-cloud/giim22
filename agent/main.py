"""Windows Agent
  الربط:   python main.py pair --server https://your-server --code 12345678
  التشغيل: python main.py run
  فك الربط: python main.py unpair
"""
import argparse
import asyncio
import logging
import socket
import sys

import requests

from winagent import config
from winagent.app import Agent
from winagent.backend_win import WindowsBackend


def cmd_pair(a):
    r = requests.post(a.server.rstrip("/") + "/devices/pair",
                      json={"code": a.code, "name": a.name or socket.gethostname()}, timeout=20)
    if r.status_code != 200:
        print("فشل الربط:", r.json().get("detail", r.text))
        sys.exit(1)
    d = r.json()
    config.save({"server": a.server.rstrip("/"), "device_id": d["device_id"], "device_token": d["device_token"]})
    print("تم الربط بنجاح. شغّل: main.py run")


def cmd_run(_):
    cfg = config.load()
    if not cfg:
        print("لم يتم الربط بعد. استخدم الأمر pair أولا.")
        sys.exit(1)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    asyncio.run(Agent(cfg, WindowsBackend()).run())


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("pair")
    sp.add_argument("--server", required=True)
    sp.add_argument("--code", required=True)
    sp.add_argument("--name")
    sp.set_defaults(fn=cmd_pair)
    sub.add_parser("run").set_defaults(fn=cmd_run)
    sub.add_parser("unpair").set_defaults(fn=lambda _: (config.clear(), print("تم فك الربط محليا")))
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
