"""标注表格解析与相似度计算的单元测试（纯函数，不碰 DB / 不发网络请求）。

对真实源文件的断言是**硬断言**：数字来自对 图片匹配数据/数据标注.xlsx 的实测。
这类宽表解析最常见的错法是「行数对、列没读全」—— 30 行照样报 30 行，但每行漏
抓一两条属性，总数就从 169 掉到 150 上下。故属性总数与分布必须一起断言。

源文件不在仓库内（.gitignore 忽略了 图片匹配数据/），缺失时相关用例自动跳过。
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from app.services.annotation.matcher import cosine, similarity_matrix
from app.services.annotation.xlsx_parser import (
    GRADE_ALIASES,
    KNOWN_GRADE_WORDS,
    KNOWN_METRICS,
    collect_unknown,
    normalize_grade_word,
    parse_annotation_xlsx,
    split_attribute,
)

# 仓库根 = backend/tests/../..
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_DATA_DIR = _REPO_ROOT / "图片匹配数据"
_XLSX = _DATA_DIR / "数据标注.xlsx"
_IMAGE_DIR = _DATA_DIR / "数据标注图"

# 实测值：30 行，属性总数 169，每行条数分布如下
_EXPECTED_ROWS = 30
_EXPECTED_ATTR_TOTAL = 169
_EXPECTED_DIST = {4: 3, 5: 11, 6: 10, 7: 6}

requires_source = pytest.mark.skipif(
    not _XLSX.exists(), reason=f"源标注表格不存在：{_XLSX}"
)


# ──────────────── 属性文本拆解 ────────────────

def test_split_attribute_fullwidth_separator():
    """源数据用全角「：」。"""
    assert split_attribute("色彩控制力：繁简相宜") == ("色彩控制力", "繁简相宜")


def test_split_attribute_halfwidth_separator():
    """半角「:」同样应可拆（容错）。"""
    assert split_attribute("色彩控制力:繁简相宜") == ("色彩控制力", "繁简相宜")


def test_split_attribute_strips_whitespace():
    assert split_attribute("  绿植搭配 ： 浑然天成  ") == ("绿植搭配", "浑然天成")


def test_split_attribute_normalizes_grade_word():
    """拆解时顺带归一同音错字。"""
    assert split_attribute("铺装精致化：中规中距") == ("铺装精致化", "中规中矩")


def test_split_attribute_without_separator():
    """拆不开时返回 (None, None)，由调用方保留 raw_text 并告警。"""
    assert split_attribute("没有分隔符") == (None, None)
    assert split_attribute("") == (None, None)


def test_normalize_grade_word_alias():
    """中规中距 / 中规中矩 是同音错字，须归一为同一个词。"""
    assert normalize_grade_word("中规中距") == "中规中矩"
    assert normalize_grade_word("中规中矩") == "中规中矩"


def test_normalize_grade_word_passthrough():
    assert normalize_grade_word("繁简相宜") == "繁简相宜"
    assert normalize_grade_word("") == ""


def test_grade_aliases_targets_are_known():
    """别名映射的目标词必须在已知词表内，否则归一后反而变成未知词。"""
    for target in GRADE_ALIASES.values():
        assert target in KNOWN_GRADE_WORDS


def test_known_tables_sizes():
    """14 个指标名（SPACE 维度 15 个中除「无障碍细节」）、21 个等级成语。"""
    assert len(KNOWN_METRICS) == 14
    assert len(KNOWN_GRADE_WORDS) == 21
    assert "无障碍细节" not in KNOWN_METRICS


# ──────────────── 余弦相似度 ────────────────

def test_cosine_identical():
    assert cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)


def test_cosine_orthogonal():
    assert cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_opposite():
    assert cosine([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


def test_cosine_empty():
    assert cosine([], []) == 0.0


def test_similarity_matrix_diagonal_and_symmetry():
    """对角线为自相似度（单位向量下恒为 1），矩阵必须对称。"""
    vectors = [[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]]
    m = similarity_matrix(vectors)
    for i in range(len(vectors)):
        assert m[i][i] == pytest.approx(1.0)
        for j in range(len(vectors)):
            assert m[i][j] == pytest.approx(m[j][i])


# ──────────────── 真实源文件 ────────────────

@pytest.fixture(scope="module")
def annotations():
    return parse_annotation_xlsx(str(_XLSX))


@requires_source
def test_row_count(annotations):
    assert len(annotations) == _EXPECTED_ROWS


@requires_source
def test_attribute_total_is_169(annotations):
    """属性总数硬断言：行数对但列没读全时，这一项会先失败。"""
    total = sum(len(a.attributes) for a in annotations)
    assert total == _EXPECTED_ATTR_TOTAL


@requires_source
def test_attribute_count_distribution(annotations):
    dist: dict[int, int] = {}
    for a in annotations:
        dist[len(a.attributes)] = dist.get(len(a.attributes), 0) + 1
    assert dist == _EXPECTED_DIST


@requires_source
def test_all_metric_names_known(annotations):
    """解析出的指标名必须全部落在已知词表内（即 SPACE 维度的三级指标）。"""
    names = {
        attr.metric_name
        for a in annotations
        for attr in a.attributes
        if attr.metric_name
    }
    assert names <= KNOWN_METRICS
    assert len(names) == 14


@requires_source
def test_all_grade_words_known(annotations):
    """归一后的成语必须全部落在已知词表内。"""
    words = {
        attr.grade_word
        for a in annotations
        for attr in a.attributes
        if attr.grade_word
    }
    assert words <= KNOWN_GRADE_WORDS
    assert len(words) == 21


@requires_source
def test_no_unknown_terms(annotations):
    """导入摘要的两个告警项都应为空 —— 非空即说明归一逻辑或词表有漏。"""
    unknown_metrics, unknown_words = collect_unknown(annotations)
    assert unknown_metrics == []
    assert unknown_words == []


@requires_source
def test_every_attribute_is_splittable(annotations):
    for a in annotations:
        for attr in a.attributes:
            assert attr.metric_name, f"row {a.row_no} 属性无法拆解：{attr.raw_text}"
            assert attr.grade_word, f"row {a.row_no} 属性无法拆解：{attr.raw_text}"


@requires_source
def test_grade_alias_applied_in_real_data(annotations):
    """源数据里的错字「中规中距」归一后不应再残留。

    该错字跨两个指标出现：街巷宽高比 6 次、铺装精致化 8 次；后者另有 1 次写作
    正确的「中规中矩」。故归一后按指标计为 6 / 9，合计 15。
    """
    pairs = [
        (attr.metric_name, attr.grade_word)
        for a in annotations
        for attr in a.attributes
    ]
    assert all(w != "中规中距" for _, w in pairs)
    assert pairs.count(("街巷宽高比", "中规中矩")) == 6
    assert pairs.count(("铺装精致化", "中规中矩")) == 9
    assert sum(1 for _, w in pairs if w == "中规中矩") == 15


@requires_source
@pytest.mark.skipif(not _IMAGE_DIR.is_dir(), reason="标注图目录不存在")
def test_embedded_images_match_folder(annotations):
    """内嵌图与 数据标注图/ 目录下的 jpg 必须逐字节一致（MD5 集合相等）。

    这证明 xlsx 单文件自包含，导入无需额外提供图片目录。
    """
    parsed = {hashlib.md5(a.image_bytes).hexdigest() for a in annotations}
    folder = {
        hashlib.md5(p.read_bytes()).hexdigest()
        for p in _IMAGE_DIR.iterdir()
        if p.is_file()
    }
    assert parsed == folder
    assert len(parsed) == _EXPECTED_ROWS


@requires_source
def test_image_extensions_normalized(annotations):
    """media part 后缀为 .jpeg，应归一为 .jpg。"""
    assert {a.image_ext for a in annotations} == {".jpg"}


@requires_source
def test_row3_attributes_exact(annotations):
    """源表第 3 行是自匹配验证的目标，其 7 条属性逐项固定。"""
    row3 = next(a for a in annotations if a.row_no == 3)
    got = [(x.metric_name, x.grade_word) for x in row3.attributes]
    assert got == [
        ("建筑高低感", "错落有致"),
        ("街巷宽高比", "张弛有度"),
        ("视廊净化度", "一望无垠"),
        ("绿植搭配", "浑然天成"),
        ("花箱容器设计", "画龙点睛"),
        ("店招独创性", "千篇一律"),
        ("铺装精致化", "中规中矩"),  # 源文件写作「中规中距」，已归一
    ]


@requires_source
def test_attr_index_is_source_column_order(annotations):
    """attr_index 应为源列序号（1~7）且递增 —— 空列被跳过但不打乱顺序。"""
    for a in annotations:
        idxs = [x.attr_index for x in a.attributes]
        assert idxs == sorted(idxs)
        assert all(1 <= i <= 7 for i in idxs)
        assert len(set(idxs)) == len(idxs)
