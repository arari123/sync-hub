import unittest
from types import SimpleNamespace

from app.api.budget import _is_admin_user, _is_project_visible_to_user


class BudgetVisibilityTests(unittest.TestCase):
    def _user(self, user_id=1, email='user@example.com'):
        return SimpleNamespace(id=user_id, email=email)

    def _project(self, manager_user_id=2, current_stage='review'):
        return SimpleNamespace(manager_user_id=manager_user_id, created_by_user_id=manager_user_id, current_stage=current_stage)

    def _version(self, status='draft'):
        return SimpleNamespace(status=status)

    def test_admin_user_by_local_part(self):
        self.assertTrue(_is_admin_user(self._user(email='admin@corp.local')))

    def test_admin_user_by_exact_email(self):
        self.assertTrue(_is_admin_user(self._user(email='admin@example.com')))

    def test_non_admin_user(self):
        self.assertFalse(_is_admin_user(self._user(email='pm@example.com')))

    def test_admin_can_view_review_draft_even_if_not_manager(self):
        project = self._project(manager_user_id=999, current_stage='review')
        visible = _is_project_visible_to_user(
            project,
            current_version=self._version(status='draft'),
            user=self._user(user_id=2, email='admin@example.com'),
        )
        self.assertTrue(visible)

    def test_non_admin_cannot_view_review_draft_if_not_manager(self):
        project = self._project(manager_user_id=999, current_stage='review')
        visible = _is_project_visible_to_user(
            project,
            current_version=self._version(status='draft'),
            user=self._user(user_id=2, email='pm@example.com'),
        )
        self.assertFalse(visible)


if __name__ == '__main__':
    unittest.main()
