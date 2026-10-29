import threading
import unittest

from winagent.gate import ScreenGate, ScreenLocked
from winagent import policy
from winagent.runner import run_plan, Cancelled, StepError
from winagent.backend_win import keys_to_pywinauto, escape_text


class FakeClock:
    def __init__(self): self.t = 0
    def __call__(self): return self.t


class GateTests(unittest.TestCase):
    def test_idle_by_default_blocks_capture(self):
        g = ScreenGate()
        self.assertTrue(g.is_idle())
        with self.assertRaises(ScreenLocked):
            g.require("any")

    def test_once_lease_single_use(self):
        g = ScreenGate()
        g.grant("t1", "once", 10)
        self.assertFalse(g.is_idle())
        g.require("t1")
        self.assertTrue(g.is_idle())
        with self.assertRaises(ScreenLocked):
            g.require("t1")

    def test_share_lease_until_revoked(self):
        g = ScreenGate()
        g.grant("s", "share", 600)
        for _ in range(5):
            g.require("s")
        self.assertTrue(g.valid("s"))
        g.revoke("s")
        self.assertTrue(g.is_idle())
        with self.assertRaises(ScreenLocked):
            g.require("s")

    def test_share_expires(self):
        c = FakeClock()
        g = ScreenGate(clock=c)
        g.grant("s", "share", 5)
        c.t = 6
        self.assertTrue(g.is_idle())
        with self.assertRaises(ScreenLocked):
            g.require("s")

    def test_revoke_all(self):
        g = ScreenGate()
        g.grant("a", "share", 100)
        g.grant("b", "verify", 100)
        g.revoke()
        self.assertTrue(g.is_idle())

    def test_lease_is_per_task(self):
        g = ScreenGate()
        g.grant("a", "share", 100)
        with self.assertRaises(ScreenLocked):
            g.require("b")


class FakeBackend:
    def __init__(self): self.calls = []
    def open_app(self, name, cancel=None, **_): self.calls.append(("open_app", name)); return f"opened {name}"
    def type_text(self, text, cancel=None, **_): self.calls.append(("type_text", text)); return "typed"
    def delete_path(self, path, cancel=None, **_): self.calls.append(("delete_path", path)); return "deleted"
    def boom(self, cancel=None, **_): raise RuntimeError("x")


def run(plan, backend=None, cancel=None, confirm=lambda s: True, verify=lambda: None):
    prog = []
    out = run_plan(plan, backend or FakeBackend(), cancel=cancel or threading.Event(), confirm=confirm,
                   progress=lambda *a: prog.append(a), capture_verify=verify)
    return out, prog


class RunnerTests(unittest.TestCase):
    def test_runs_steps_in_order_and_reports_progress(self):
        b = FakeBackend()
        out, prog = run([{"action": "open_app", "args": {"name": "notepad"}},
                         {"action": "type_text", "args": {"text": "hi"}}], b)
        self.assertEqual(b.calls, [("open_app", "notepad"), ("type_text", "hi")])
        self.assertEqual([p[0] for p in prog], [1, 2])
        self.assertIn("opened notepad", out)

    def test_unknown_action_rejected(self):
        with self.assertRaises(policy.PolicyError):
            run([{"action": "format_disk", "args": {}}])

    def test_cancel_stops_before_next_step(self):
        ev = threading.Event()
        b = FakeBackend()
        orig = b.open_app
        def open_and_cancel(name, cancel=None, **k):
            r = orig(name, cancel=cancel, **k); ev.set(); return r
        b.open_app = open_and_cancel
        with self.assertRaises(Cancelled):
            run([{"action": "open_app", "args": {"name": "a"}},
                 {"action": "type_text", "args": {"text": "never"}}], b, cancel=ev)
        self.assertEqual(b.calls, [("open_app", "a")])

    def test_sensitive_requires_confirmation(self):
        b = FakeBackend()
        with self.assertRaises(StepError):
            run([{"action": "delete_path", "args": {"path": "C:\\Users\\me\\x.txt"}}], b, confirm=lambda s: False)
        self.assertEqual(b.calls, [])
        run([{"action": "delete_path", "args": {"path": "C:\\Users\\me\\x.txt"}}], b, confirm=lambda s: True)
        self.assertEqual(b.calls, [("delete_path", "C:\\Users\\me\\x.txt")])

    def test_protected_path_refused_even_if_confirmed(self):
        with self.assertRaises(StepError):
            run([{"action": "delete_path", "args": {"path": "C:\\"}}])

    def test_verify_screen_calls_capture(self):
        called = []
        run([{"action": "verify_screen", "args": {}}], verify=lambda: called.append(1))
        self.assertEqual(called, [1])

    def test_backend_error_becomes_steperror(self):
        b = FakeBackend()
        with self.assertRaises(StepError):
            run([{"action": "open_app", "args": {"wrong": 1}}], b)


class KeysTests(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(keys_to_pywinauto("ctrl+s"), "^s")
        self.assertEqual(keys_to_pywinauto("ctrl+shift+s"), "^+s")
        self.assertEqual(keys_to_pywinauto("enter"), "{ENTER}")
        self.assertEqual(keys_to_pywinauto("alt+f4"), "%{F4}")
        with self.assertRaises(StepError):
            keys_to_pywinauto("foo+bar")

    def test_escape(self):
        self.assertEqual(escape_text("a+b"), "a{+}b")
        self.assertEqual(escape_text("x\ny"), "x{ENTER}y")
        self.assertEqual(escape_text("مرحبا"), "مرحبا")



class PathTests(unittest.TestCase):
    def test_protected(self):
        for p in ("C:\\", "c:", "C:\\Windows", "C:\\Windows\\System32\\x.dll", "C:\\Program Files\\App", "C:\\Users"):
            self.assertTrue(policy.is_protected_path(p), p)

    def test_not_protected(self):
        for p in ("C:\\Users\\me\\Documents\\x.txt", "D:\\projects\\old"):
            self.assertFalse(policy.is_protected_path(p), p)


if __name__ == "__main__":
    unittest.main()
