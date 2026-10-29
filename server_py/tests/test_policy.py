import unittest
from app.policy import validate_plan, PolicyError


class PolicyTests(unittest.TestCase):
    def test_valid(self):
        p = validate_plan([{"action": "open_app", "args": {"name": "notepad"}, "note": "x"}])
        self.assertFalse(p[0]["sensitive"])

    def test_delete_flagged_sensitive(self):
        p = validate_plan([{"action": "delete_path", "args": {"path": "a"}}])
        self.assertTrue(p[0]["sensitive"])

    def test_rejects_unknown_and_empty(self):
        for bad in ([], [{"action": "run_shell", "args": {"cmd": "dir"}}], "x", [1]):
            with self.assertRaises(PolicyError):
                validate_plan(bad)

    def test_rejects_non_http_urls(self):
        with self.assertRaises(PolicyError):
            validate_plan([{"action": "open_url", "args": {"url": "file:///c:/x"}}])
        with self.assertRaises(PolicyError):
            validate_plan([{"action": "open_url", "args": {"url": "javascript:alert(1)"}}])

    def test_too_many_steps(self):
        with self.assertRaises(PolicyError):
            validate_plan([{"action": "wait", "args": {}}] * 26)

    def test_wait_clamped(self):
        p = validate_plan([{"action": "wait", "args": {"seconds": 9999}}])
        self.assertEqual(p[0]["args"]["seconds"], 30)


if __name__ == "__main__":
    unittest.main()
