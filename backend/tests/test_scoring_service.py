"""评分聚合：按模板权重加权，并记下实际生效的权重；新建模板的平均权重。"""

import unittest

from app.services.metric_template_service import (
    _equal_split,
    build_equal_tree,
    validate_tree_weights,
)
from app.services.scoring_service import aggregate, build_dimension_rows


def _tree(space_weight=0.5, business_weight=0.5):
    """两个一级维度，各一个二级、一个三级。"""
    rows = []
    for dim_id, code, weight in ((1, "SPACE", space_weight), (2, "BUSINESS", business_weight)):
        rows.append({
            "metric_id": dim_id, "metric_weight": 1.0,
            "sub_id": dim_id * 10, "sub_name": f"{code}_S1", "sub_weight": 1.0, "sub_sort": 1,
            "dim_id": dim_id, "dim_code": code, "dim_name": code,
            "dim_weight": weight, "dim_sort": dim_id,
        })
    return rows


SCORES = {1: 5, 2: 1}


class AggregateWeightTests(unittest.TestCase):
    def test_equal_weights(self):
        result = aggregate(_tree(), SCORES)
        self.assertEqual(result["total_score"], 3.0)
        self.assertEqual([d["weight"] for d in result["dimension_scores"]], [0.5, 0.5])

    def test_template_weights_drive_total(self):
        # 类型模板偏重 SPACE：(5*0.8 + 1*0.2) = 4.2
        result = aggregate(_tree(0.8, 0.2), SCORES)
        self.assertEqual(result["total_score"], 4.2)
        self.assertEqual([d["weight"] for d in result["dimension_scores"]], [0.8, 0.2])

    def test_dimension_rows_carry_effective_weight(self):
        rows = build_dimension_rows(aggregate(_tree(0.8, 0.2), SCORES))
        level1 = {r["ref_id"]: r["weight"] for r in rows if r["dim_level"] == 1}
        level2 = {r["ref_id"]: r["weight"] for r in rows if r["dim_level"] == 2}
        self.assertEqual(level1, {1: 0.8, 2: 0.2})
        self.assertEqual(level2, {10: 1.0, 20: 1.0})


class WeightToleranceTests(unittest.TestCase):
    @staticmethod
    def _dims(weights):
        return [{"dim_name": f"D{i}", "dim_weight": w, "subs": []} for i, w in enumerate(weights)]

    def test_off_by_one_tenth_percent_is_rejected(self):
        # 20.2% + 19.9% + 20% × 3 = 100.1%
        errors = validate_tree_weights(self._dims([0.202, 0.199, 0.2, 0.2, 0.2]))
        self.assertEqual(len(errors), 1)
        self.assertIn("100.1%", errors[0])

    def test_equal_split_rounding_passes(self):
        # 3 × 33.33% = 99.99%，DECIMAL(6,4) 存不下 1/3，不能误杀
        self.assertEqual(validate_tree_weights(self._dims([0.3333] * 3)), [])


class EqualTreeTests(unittest.TestCase):
    def test_equal_split_sums_to_one(self):
        for n in (1, 3, 5, 7):
            with self.subTest(n=n):
                parts = _equal_split(n)
                self.assertEqual(len(parts), n)
                self.assertAlmostEqual(sum(parts), 1.0, places=9)
        self.assertEqual(_equal_split(3), [0.3333, 0.3333, 0.3334])

    def test_new_template_is_standard_and_passes_validation(self):
        tree = build_equal_tree()
        self.assertEqual(len(tree), 5)
        self.assertEqual(sum(len(subs) for *_, subs in tree), 25)
        self.assertEqual(sum(len(ms) for *_, subs in tree for *__, ms in subs), 75)
        self.assertEqual([d[0] for d in tree], ["SPACE", "BUSINESS", "CULTURE", "VITALITY", "INFLUENCE"])
        nested = [
            {
                "dim_name": dname, "dim_weight": dw,
                "subs": [
                    {"sub_name": sname, "sub_weight": sw,
                     "metrics": [{"metric_weight": mw} for *_, mw in metrics]}
                    for _, sname, sw, metrics in subs
                ],
            }
            for _, dname, dw, subs in tree
        ]
        self.assertEqual(validate_tree_weights(nested), [])


if __name__ == "__main__":
    unittest.main()
