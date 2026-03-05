import unittest

from app.core.auth_utils import (
    hash_password,
    is_email_domain_allowed,
    is_valid_email,
    normalize_email,
    parse_allowed_domains,
    parse_iso,
    to_iso,
    utcnow,
    verify_password,
)


class AuthUtilsTests(unittest.TestCase):
    def test_parse_allowed_domains_normalizes_and_dedups(self):
        domains = parse_allowed_domains(" @ACME.com,acme.com,corp.kr ,,")
        self.assertEqual(domains, ["acme.com", "corp.kr"])

    def test_email_domain_allowed(self):
        self.assertTrue(is_email_domain_allowed("user@acme.com", ["acme.com", "corp.kr"]))
        self.assertFalse(is_email_domain_allowed("user@evil.com", ["acme.com", "corp.kr"]))

    def test_email_validation(self):
        self.assertTrue(is_valid_email("pm.team@acme.com"))
        self.assertFalse(is_valid_email("not-an-email"))
        self.assertEqual(normalize_email("  USER@ACME.COM "), "user@acme.com")

    def test_password_hash_and_verify(self):
        encoded = hash_password("StrongPass123!")
        self.assertTrue(verify_password("StrongPass123!", encoded))
        self.assertFalse(verify_password("WrongPassword", encoded))

    def test_iso_roundtrip(self):
        now = utcnow()
        parsed = parse_iso(to_iso(now))
        delta_seconds = abs((parsed - now).total_seconds())
        self.assertLess(delta_seconds, 1.0)


if __name__ == "__main__":
    unittest.main()
