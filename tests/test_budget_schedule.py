import unittest

from app.api.budget import (
    _SCHEDULE_ROOT_GROUP_IDS,
    _build_default_schedule_wbs_payload,
    _normalize_schedule_wbs_payload,
    _parse_schedule_wbs_payload,
)


class BudgetScheduleTests(unittest.TestCase):
    def test_default_schedule_template_contains_three_system_groups(self):
        payload = _build_default_schedule_wbs_payload(anchor_date="2026-02-13")
        self.assertEqual(payload["schema_version"], "wbs.v1")
        self.assertEqual(payload["anchor_date"], "2026-02-13")
        self.assertEqual(payload["rows"], [])

        group_ids = {item["id"] for item in payload["groups"]}
        self.assertEqual(
            group_ids,
            {
                _SCHEDULE_ROOT_GROUP_IDS["design"],
                _SCHEDULE_ROOT_GROUP_IDS["fabrication"],
                _SCHEDULE_ROOT_GROUP_IDS["installation"],
            },
        )
        for group in payload["groups"]:
            self.assertTrue(group["is_system"])
            self.assertIsNone(group["parent_group_id"])

    def test_parse_invalid_schedule_payload_returns_default_template(self):
        parsed = _parse_schedule_wbs_payload("not-json")
        self.assertEqual(parsed["schema_version"], "wbs.v1")
        self.assertEqual(len(parsed["groups"]), 3)
        self.assertEqual(parsed["rows"], [])

    def test_normalize_aligns_stage_and_parent_group(self):
        payload = {
            "schema_version": "wbs.v1",
            "weekend_mode": "exclude",
            "anchor_date": "2026-02-13",
            "groups": [
                {
                    "id": "fab-sub",
                    "name": "제작 하위",
                    "stage": "fabrication",
                    "parent_group_id": "stage-design",
                    "sort_order": 9,
                    "is_system": False,
                }
            ],
            "rows": [
                {
                    "id": "row-1",
                    "kind": "task",
                    "name": "작업 1",
                    "stage": "design",
                    "parent_group_id": "fab-sub",
                    "sort_order": 3,
                    "duration_days": 2,
                    "start_date": "2026-02-13",
                    "end_date": "2026-02-16",
                    "note": "",
                }
            ],
        }
        normalized = _normalize_schedule_wbs_payload(payload, strict_anchor=True)

        group_map = {item["id"]: item for item in normalized["groups"]}
        self.assertEqual(group_map["fab-sub"]["stage"], "fabrication")
        self.assertEqual(group_map["fab-sub"]["parent_group_id"], _SCHEDULE_ROOT_GROUP_IDS["fabrication"])
        row = normalized["rows"][0]
        self.assertEqual(row["stage"], "fabrication")
        self.assertEqual(row["parent_group_id"], "fab-sub")

    def test_event_row_forces_zero_duration_and_single_day(self):
        payload = {
            "schema_version": "wbs.v1",
            "weekend_mode": "exclude",
            "anchor_date": "2026-02-13",
            "groups": [],
            "rows": [
                {
                    "id": "event-1",
                    "kind": "event",
                    "name": "중요 이벤트",
                    "stage": "design",
                    "parent_group_id": "stage-design",
                    "sort_order": 0,
                    "duration_days": 5,
                    "start_date": "2026-02-20",
                    "end_date": "2026-02-28",
                }
            ],
        }
        normalized = _normalize_schedule_wbs_payload(payload, strict_anchor=True)
        row = normalized["rows"][0]
        self.assertEqual(row["kind"], "event")
        self.assertEqual(row["duration_days"], 0)
        self.assertEqual(row["start_date"], row["end_date"])
        self.assertEqual(row["start_date"], "2026-02-20")

    def test_anchor_date_is_required_in_strict_mode(self):
        payload = {
            "schema_version": "wbs.v1",
            "weekend_mode": "exclude",
            "groups": [],
            "rows": [],
        }
        with self.assertRaises(ValueError):
            _normalize_schedule_wbs_payload(payload, strict_anchor=True)

    def test_normalize_does_not_duplicate_root_groups(self):
        payload = {
            "schema_version": "wbs.v1",
            "weekend_mode": "exclude",
            "anchor_date": "2026-02-13",
            "groups": [
                {
                    "id": _SCHEDULE_ROOT_GROUP_IDS["design"],
                    "name": "설계",
                    "stage": "design",
                    "parent_group_id": None,
                    "sort_order": 0,
                    "is_system": True,
                },
                {
                    "id": _SCHEDULE_ROOT_GROUP_IDS["fabrication"],
                    "name": "제작",
                    "stage": "fabrication",
                    "parent_group_id": None,
                    "sort_order": 1,
                    "is_system": True,
                },
                {
                    "id": _SCHEDULE_ROOT_GROUP_IDS["installation"],
                    "name": "설치",
                    "stage": "installation",
                    "parent_group_id": None,
                    "sort_order": 2,
                    "is_system": True,
                },
            ],
            "rows": [],
        }
        normalized = _normalize_schedule_wbs_payload(payload, strict_anchor=True)
        group_ids = [item["id"] for item in normalized["groups"]]
        self.assertEqual(
            group_ids,
            [
                _SCHEDULE_ROOT_GROUP_IDS["design"],
                _SCHEDULE_ROOT_GROUP_IDS["fabrication"],
                _SCHEDULE_ROOT_GROUP_IDS["installation"],
            ],
        )

    def test_row_name_keeps_empty_string_when_provided(self):
        payload = {
            "schema_version": "wbs.v1",
            "weekend_mode": "exclude",
            "anchor_date": "2026-02-13",
            "groups": [],
            "rows": [
                {
                    "id": "row-1",
                    "kind": "task",
                    "name": "",
                    "stage": "design",
                    "parent_group_id": _SCHEDULE_ROOT_GROUP_IDS["design"],
                    "sort_order": 0,
                    "duration_days": 2,
                    "start_date": "2026-02-13",
                    "end_date": "2026-02-14",
                    "note": "",
                }
            ],
        }
        normalized = _normalize_schedule_wbs_payload(payload, strict_anchor=True)
        self.assertEqual(normalized["rows"][0]["name"], "")


if __name__ == "__main__":
    unittest.main()
