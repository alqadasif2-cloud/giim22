import os
import unittest

os.environ.setdefault("JWT_SECRET", "x" * 40)
try:
    from app import auth
except ImportError:      # PyJWT غير مثبت محليا
    auth = None


@unittest.skipIf(auth is None, "PyJWT not installed")
class AuthTests(unittest.TestCase):
    def test_password_roundtrip(self):
        h = auth.hash_password("correct horse")
        self.assertTrue(auth.verify_password("correct horse", h))
        self.assertFalse(auth.verify_password("wrong", h))

    def test_token_types_are_not_interchangeable(self):
        ut = auth.make_user_token(7)
        dt = auth.make_device_token(7, "dev1", 1)
        self.assertEqual(auth.decode(ut, "user")["sub"], "7")
        self.assertIsNone(auth.decode(ut, "device"))
        self.assertIsNone(auth.decode(dt, "user"))
        self.assertEqual(auth.decode(dt, "device")["dev"], "dev1")

    def test_garbage_token(self):
        self.assertIsNone(auth.decode("not.a.token", "user"))

    def test_pair_code_shape(self):
        c = auth.new_pair_code()
        self.assertEqual(len(c), 8)
        self.assertTrue(c.isdigit())


if __name__ == "__main__":
    unittest.main()
