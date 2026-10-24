"""确认地点 / 确认街区类型的原子状态转移，以及匹配度解析。"""

from contextlib import contextmanager
import json
import unittest
from unittest.mock import MagicMock, patch

from app.services import evaluation_service as svc

TYPES = [
    {"id": 1, "code": "WATER_TOWN", "name": "水乡古巷型"},
    {"id": 2, "code": "REPUBLICAN", "name": "民国风情型"},
    {"id": 3, "code": "SPECIALTY", "name": "特色专业型"},
]


@contextmanager
def _fake_scope():
    yield MagicMock()


class ConfirmTypeTests(unittest.TestCase):
    def setUp(self):
        self.repo = MagicMock()
        self.repo.get_street_type.return_value = {
            "id": 2, "code": "REPUBLICAN", "name": "民国风情型", "weights": {},
        }
        self.repo.get_ai_result_by_task.return_value = {
            "recognized_street": "颐和路",
            "recognized_city": "南京",
            "raw_response": json.dumps({"district": "鼓楼区"}),
        }
        self.repo.get_ai_task.return_value = {"status": "analyzing", "image_url": None}
        self.executor = MagicMock()
        for target, value in (
            ("repo", self.repo),
            ("connection_scope", _fake_scope),
            ("_task_executor", self.executor),
            ("progress", MagicMock()),
        ):
            p = patch.object(svc, target, value)
            p.start()
            self.addCleanup(p.stop)

    def test_successful_transition_submits_scoring_once(self):
        self.repo.transition_task_status.return_value = True
        result = svc.confirm_type(7, 2)
        self.repo.transition_task_status.assert_called_once_with(
            unittest.mock.ANY, 7, "awaiting_type", "analyzing"
        )
        self.executor.submit.assert_called_once()
        args, kwargs = self.executor.submit.call_args
        self.assertIs(args[0], svc._run_scoring_phase)
        self.assertEqual(args[1:6], (7, "颐和路", "南京", "鼓楼区", None))
        self.assertEqual(kwargs, {"street_type_id": 2})
        self.assertEqual(result["status"], "analyzing")

    def test_lost_transition_raises_conflict_without_scoring(self):
        # 已被另一次请求确认，或已取消：条件 UPDATE 影响 0 行
        for status in ("analyzing", "cancelled"):
            with self.subTest(status=status):
                self.executor.reset_mock()
                self.repo.transition_task_status.return_value = False
                self.repo.get_ai_task.return_value = {"status": status}
                with self.assertRaisesRegex(
                    svc.TaskStateConflict, f"任务当前状态为 {status}"
                ):
                    svc.confirm_type(7, 2)
                self.executor.submit.assert_not_called()

    def test_missing_task_reports_not_found(self):
        self.repo.transition_task_status.return_value = False
        self.repo.get_ai_task.return_value = None
        with self.assertRaisesRegex(ValueError, "^任务不存在$"):
            svc.confirm_type(7, 2)
        self.executor.submit.assert_not_called()

    def test_unknown_type_does_not_touch_status(self):
        self.repo.get_street_type.return_value = None
        with self.assertRaises(svc.StreetTypeNotFound):
            svc.confirm_type(7, 99)
        self.repo.transition_task_status.assert_not_called()
        self.executor.submit.assert_not_called()


class ConfirmLocationTests(unittest.TestCase):
    def setUp(self):
        self.repo = MagicMock()
        self.repo.get_ai_result_by_task.return_value = {
            "recognized_street": "山塘街",
            "recognized_city": "苏州",
            "raw_response": json.dumps({"district": "姑苏区"}),
        }
        self.repo.get_ai_task.return_value = {"status": "analyzing", "image_url": None}
        self.executor = MagicMock()
        for target, value in (
            ("repo", self.repo),
            ("connection_scope", _fake_scope),
            ("_task_executor", self.executor),
            ("progress", MagicMock()),
        ):
            p = patch.object(svc, target, value)
            p.start()
            self.addCleanup(p.stop)

    def test_accepting_recognition_submits_once(self):
        self.repo.transition_task_status.return_value = True
        result = svc.confirm_location(7)
        self.repo.transition_task_status.assert_called_once_with(
            unittest.mock.ANY, 7, "awaiting_confirm", "analyzing"
        )
        self.executor.submit.assert_called_once()
        args, _ = self.executor.submit.call_args
        self.assertIs(args[0], svc._after_location)
        self.assertEqual(args[1:6], (7, "山塘街", "苏州", "姑苏区", None))
        self.assertEqual(result["street"], "山塘街")
        # 状态已由条件 UPDATE 改好，不能再无条件写一次
        self.repo.update_ai_task.assert_not_called()

    def test_override_submits_normalization_once(self):
        self.repo.transition_task_status.return_value = True
        svc.confirm_location(7, "  平江路 ")
        self.executor.submit.assert_called_once()
        args, _ = self.executor.submit.call_args
        self.assertIs(args[0], svc._run_confirm_override_phase)
        self.assertEqual(args[1:3], (7, "平江路"))
        self.repo.update_ai_task.assert_not_called()

    def test_lost_transition_raises_conflict_without_submitting(self):
        for status in ("analyzing", "cancelled"):
            with self.subTest(status=status):
                self.executor.reset_mock()
                self.repo.transition_task_status.return_value = False
                self.repo.get_ai_task.return_value = {"status": status}
                with self.assertRaises(svc.TaskStateConflict):
                    svc.confirm_location(7)
                self.executor.submit.assert_not_called()

    def test_missing_task_is_not_a_conflict(self):
        self.repo.transition_task_status.return_value = False
        self.repo.get_ai_task.return_value = None
        with self.assertRaisesRegex(ValueError, "^任务不存在$") as ctx:
            svc.confirm_location(7)
        self.assertNotIsInstance(ctx.exception, svc.TaskStateConflict)

    def test_unrecognized_location_is_input_error(self):
        self.repo.transition_task_status.return_value = True
        self.repo.get_ai_result_by_task.return_value = {}
        with self.assertRaisesRegex(ValueError, "未能识别出地点") as ctx:
            svc.confirm_location(7)
        self.assertNotIsInstance(ctx.exception, svc.TaskStateConflict)
        self.executor.submit.assert_not_called()


class NormalizeCandidatesTests(unittest.TestCase):
    def test_clamps_drops_unknown_and_fills_missing(self):
        data = {"types": [
            {"code": "WATER_TOWN", "match_score": 1.7, "reason": " 有河道 "},
            {"code": "REPUBLICAN", "match_score": -0.2},
            {"code": "UNKNOWN", "match_score": 0.9},
            {"code": "WATER_TOWN", "match_score": 0.1},
        ]}
        result = svc.normalize_type_candidates(data, TYPES)
        self.assertEqual(result, [
            {"code": "WATER_TOWN", "match_score": 1.0, "reason": "有河道"},
            {"code": "REPUBLICAN", "match_score": 0.0, "reason": ""},
            {"code": "SPECIALTY", "match_score": 0.0, "reason": ""},
        ])

    def test_non_numeric_score_becomes_zero(self):
        data = {"types": [{"code": "SPECIALTY", "match_score": "高"}]}
        result = svc.normalize_type_candidates(data, TYPES)
        self.assertEqual(result[2]["match_score"], 0.0)

    def test_no_valid_items_returns_empty(self):
        for data in ({}, {"types": "x"}, {"types": [{"code": "NOPE"}]}, None):
            with self.subTest(data=data):
                self.assertEqual(svc.normalize_type_candidates(data, TYPES), [])


if __name__ == "__main__":
    unittest.main()
