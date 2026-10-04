"""指标体系权重校验的单元测试（纯函数，不碰 DB）。

核心约束：每一组同级兄弟的权重之和须为 100%。容差只为放过等分除不尽的情形
（3 个 0.3333 和为 0.9999），对不等权没有任何放松 —— 不等权且和为 1 是通例，
必须通过；和为 0.9 / 1.1 这类真错填必须拦住。
"""

from __future__ import annotations

import pytest

from app.services.metric_template_service import (
    WEIGHT_SUM_TOLERANCE,
    WeightSumError,
    validate_tree_weights,
)


def _tree(
    dim_weights: list[float],
    sub_weights: list[float],
    metric_weights: list[float],
) -> list[dict]:
    """按给定的三级权重列表构造一棵维度树（每层兄弟权重相同模式）。"""
    return [
        {
            "dim_id": i,
            "dim_name": f"D{i}",
            "dim_weight": dw,
            "subs": [
                {
                    "sub_id": i * 100 + j,
                    "sub_name": f"S{j}",
                    "sub_weight": sw,
                    "metrics": [
                        {
                            "metric_id": i * 10000 + j * 100 + k,
                            "metric_name": f"M{k}",
                            "metric_weight": mw,
                        }
                        for k, mw in enumerate(metric_weights)
                    ],
                }
                for j, sw in enumerate(sub_weights)
            ],
        }
        for i, dw in enumerate(dim_weights)
    ]


# ──────────────── 合规：和为 1 ────────────────

def test_seed_shape_passes():
    """种子结构：5×0.2 / 5×0.2 / 3×0.3333（末层和为 0.9999）。"""
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [0.3333] * 3)) == []


def test_exact_one_third_passes():
    """精确 1/3 的浮点和为 0.9999999…，同样应通过。"""
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [1 / 3] * 3)) == []


@pytest.mark.parametrize(
    "metric_weights",
    [
        [0.5, 0.3, 0.2],
        [0.6, 0.25, 0.15],
        [0.45, 0.35, 0.2],
        [0.7, 0.2, 0.1],
        [0.8, 0.1, 0.1],
    ],
)
def test_unequal_metric_weights_summing_to_one_pass(metric_weights):
    """不等权是通例：只要和为 1 就必须通过，容差不应把它们误伤。"""
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, metric_weights)) == []


def test_unequal_dim_weights_pass():
    """一级不等权（对应库里「模板一 v2」的 0.3/0.3/0.2/0.1/0.1）。"""
    assert validate_tree_weights(
        _tree([0.3, 0.3, 0.2, 0.1, 0.1], [0.2] * 5, [0.3333] * 3)
    ) == []


def test_unequal_sub_weights_pass():
    assert validate_tree_weights(
        _tree([0.2] * 5, [0.4, 0.3, 0.15, 0.1, 0.05], [0.3333] * 3)
    ) == []


def test_all_levels_unequal_pass():
    assert validate_tree_weights(
        _tree([0.3, 0.25, 0.2, 0.15, 0.1], [0.4, 0.3, 0.15, 0.1, 0.05], [0.5, 0.3, 0.2])
    ) == []


def test_two_metrics_half_each_pass():
    """分组内项数不限于 3：两项各 0.5 也合规。"""
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [0.5, 0.5])) == []


# ──────────────── 不合规 ────────────────

def test_dim_sum_over_one_rejected():
    errs = validate_tree_weights(_tree([0.3] + [0.2] * 4, [0.2] * 5, [0.3333] * 3))
    assert len(errs) == 1
    assert "一级维度" in errs[0]
    assert "110.0%" in errs[0]


def test_dim_sum_under_one_rejected():
    errs = validate_tree_weights(_tree([0.1] + [0.2] * 4, [0.2] * 5, [0.3333] * 3))
    assert len(errs) == 1
    assert "90.0%" in errs[0]


def test_metric_sum_unequal_but_wrong_total_rejected():
    """不等权但和不为 1（0.5+0.3+0.3=1.1）—— 这正是校验要抓的。"""
    errs = validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [0.5, 0.3, 0.3]))
    assert len(errs) == 25  # 5 维 × 5 二级，每组都不合规
    assert "110.0%" in errs[0]


def test_sub_sum_rejected_names_parent_dimension():
    """报错文案须带上父级名，否则用户不知道是哪一组。"""
    errs = validate_tree_weights(_tree([0.2] * 5, [0.3] + [0.2] * 4, [0.3333] * 3))
    assert len(errs) == 5
    assert all("「D" in e and "下的二级维度" in e for e in errs)


def test_all_three_levels_wrong_reports_every_group():
    """一次返回全部问题，而不是遇到第一个就停。"""
    errs = validate_tree_weights(_tree([0.3] * 5, [0.3] * 5, [0.4] * 3))
    # 1 组一级 + 5 组二级 + 25 组三级
    assert len(errs) == 1 + 5 + 25


def test_all_zero_weights_rejected():
    """有条目却全填 0 必须拦住。

    保存后 scoring_service._weighted_average 会在权重和为 0 时退化成等权平均，
    界面却显示 0% —— 正是这个校验要防的静默失真。不能因为「看起来像未配置」
    就放行。（组内无条目是另一回事，由 _check_weight_group 的空列表分支跳过。）
    """
    errs = validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [0.0, 0.0, 0.0]))
    assert len(errs) == 25
    assert "0.0%" in errs[0]


def test_empty_metric_group_skipped():
    """组内无条目则跳过，不报错（结构未填满时不刷无意义的告警）。"""
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [])) == []


# ──────────────── 容差边界 ────────────────

def test_tolerance_boundary_inside():
    """刚好在容差内应通过。"""
    inside = 1.0 - WEIGHT_SUM_TOLERANCE * 0.9
    assert validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [inside])) == []


def test_tolerance_boundary_outside():
    """超出容差应拦住。"""
    outside = 1.0 - WEIGHT_SUM_TOLERANCE * 2
    errs = validate_tree_weights(_tree([0.2] * 5, [0.2] * 5, [outside]))
    assert len(errs) == 25


def test_tolerance_is_far_smaller_than_real_mistakes():
    """容差（0.001）须远小于真错填的量级（0.1），否则会放过错误。"""
    assert WEIGHT_SUM_TOLERANCE < 0.01


# ──────────────── 异常类型 ────────────────

def test_weight_sum_error_carries_all_errors():
    errs = ["错误一", "错误二"]
    exc = WeightSumError(errs)
    assert exc.errors == errs
    assert "错误一" in str(exc) and "错误二" in str(exc)


def test_weight_sum_error_is_value_error():
    """继承 ValueError，便于调用方按需粗粒度捕获。"""
    assert issubclass(WeightSumError, ValueError)


def test_empty_tree_passes():
    """空树不报错（新建空骨架模板时不应刷告警）。"""
    assert validate_tree_weights([]) == []
