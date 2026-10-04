"""标定脚本：标注库两两相似度矩阵。

    python -m app.services.annotation.calibrate

这是本版的**准入检查**，不是附属工具。它回答一个问题：这个向量空间到底能不能
区分街景？答案决定了整条技术路线是否成立，必须在接入点评链路**之前**拿到 ——
否则后面所有匹配结果都无从判断对错。

判据（看 report.txt）：
  - 对角线必须恒为 1.0。不是则向量归一化或 JSON 存取有 bug，先修这里。
  - 非对角元素分布有明显跨度（如 P5~P95 铺开在 0.3~0.85）→ 有区分力，可继续。
  - 全挤在窄高位区间（如都在 0.85~0.95）→ 区分度不足，Top-1 近乎随机，
    应换模型（tongyi-embedding-vision-plus）或改用图文融合向量。

统计量不能替代人眼：还要核对「最相似 / 最不相似的 15 对」是否符合直觉，
以及每张图的最近邻是否同类（古镇↔古镇、工业风↔工业风）。

输出到 static/annotations/_calibration/：
  matrix.csv  N×N 全矩阵，可直接丢进 Excel 看热力图
  report.txt  统计摘要 + 极值对 + 最近邻清单 + 阈值参考表
  pairs.csv   全部无序对，按相似度降序
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

from app.core.config import get_settings
from app.db import repository as repo
from app.db.session import connection_scope
from app.services.annotation.matcher import similarity_matrix

_TOP_PAIRS = 15


def _percentile(sorted_values: list[float], pct: float) -> float:
    """线性插值分位数；sorted_values 必须已升序且非空。"""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * pct
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = pos - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def run() -> int:
    """执行标定，返回退出码（0 正常，非 0 表示无数据或对角线异常）。"""
    settings = get_settings()
    model = settings.annotation_embedding_model
    dim = settings.annotation_embedding_dim

    with connection_scope() as conn:
        rows = repo.list_annotation_embeddings(conn, model=model, dim=dim)

    if len(rows) < 2:
        print(
            f"标注库可比向量不足（{len(rows)} 条，model={model} dim={dim}）。\n"
            "请先在资源中心导入标注表格并生成向量。"
        )
        return 1

    names = [r["file_name"] for r in rows]
    vectors = [r["embedding"] for r in rows]
    n = len(rows)
    matrix = similarity_matrix(vectors)

    out_dir = Path(settings.annotation_dir) / "_calibration"
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── matrix.csv ──
    with io.open(out_dir / "matrix.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([""] + names)
        for i, name in enumerate(names):
            w.writerow([name] + [f"{matrix[i][j]:.5f}" for j in range(n)])

    # ── 非对角元素（无序对，每对只取一次） ──
    pairs: list[tuple[float, str, str]] = []
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append((matrix[i][j], names[i], names[j]))
    pairs.sort(key=lambda x: x[0], reverse=True)

    with io.open(out_dir / "pairs.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["similarity", "file_a", "file_b"])
        for s, a, b in pairs:
            w.writerow([f"{s:.5f}", a, b])

    values = sorted(s for s, _, _ in pairs)
    diag = [matrix[i][i] for i in range(n)]
    diag_ok = all(abs(d - 1.0) < 1e-6 for d in diag)

    # ── 每张图的最近邻 ──
    nearest: list[tuple[str, str, float]] = []
    for i in range(n):
        best_j, best_s = -1, -2.0
        for j in range(n):
            if i == j:
                continue
            if matrix[i][j] > best_s:
                best_s, best_j = matrix[i][j], j
        nearest.append((names[i], names[best_j], best_s))

    # ── report.txt ──
    lines: list[str] = []
    lines.append("标注库相似度标定报告")
    lines.append("=" * 60)
    lines.append(f"样本数：{n}    无序对数：{len(pairs)}")
    lines.append(f"向量模型：{model}    维度：{dim}")
    lines.append("")
    lines.append("【对角线自检】")
    if diag_ok:
        lines.append("  通过：全部为 1.0（向量已正确归一化）")
    else:
        lines.append(
            f"  ✗ 异常：min={min(diag):.6f} max={max(diag):.6f}，应恒为 1.0。\n"
            "    向量归一化或 JSON 存取有 bug，请先修此处，其余统计不可信。"
        )
    lines.append("")
    lines.append("【非对角相似度分布】—— 判断向量空间有无区分力")
    lines.append(f"  min    {values[0]:.5f}")
    lines.append(f"  P5     {_percentile(values, 0.05):.5f}")
    lines.append(f"  P25    {_percentile(values, 0.25):.5f}")
    lines.append(f"  中位数 {_percentile(values, 0.50):.5f}")
    lines.append(f"  均值   {sum(values) / len(values):.5f}")
    lines.append(f"  P75    {_percentile(values, 0.75):.5f}")
    lines.append(f"  P95    {_percentile(values, 0.95):.5f}")
    lines.append(f"  max    {values[-1]:.5f}")
    spread = values[-1] - values[0]
    lines.append(f"  极差   {spread:.5f}")
    lines.append("")
    if spread < 0.15:
        lines.append(
            "  ⚠ 极差过小：相似度几乎不随图片内容变化，Top-1 近乎随机。\n"
            "    建议换模型（tongyi-embedding-vision-plus）或改用图文融合向量，\n"
            "    不要在此基础上接入点评链路。"
        )
    else:
        lines.append("  分布有跨度，向量空间具备一定区分力。仍需人眼核对下面的极值对。")
    lines.append("")
    lines.append(f"【最相似的 {_TOP_PAIRS} 对】—— 打开图核对：它们真的像吗？")
    for s, a, b in pairs[:_TOP_PAIRS]:
        lines.append(f"  {s:.5f}  {a}  ↔  {b}")
    lines.append("")
    lines.append(f"【最不相似的 {_TOP_PAIRS} 对】—— 核对：它们真的不像吗？")
    for s, a, b in pairs[-_TOP_PAIRS:]:
        lines.append(f"  {s:.5f}  {a}  ↔  {b}")
    lines.append("")
    lines.append("【每张图的最近邻】—— 同类图应互为近邻（古镇↔古镇、工业风↔工业风）")
    for name, nb, s in nearest:
        lines.append(f"  {name}  →  {nb}  ({s:.5f})")
    lines.append("")
    lines.append("【阈值参考表】—— 供第二版定阈值，本版不设阈值")
    lines.append("  阈值      判为「相似」的对数 / 占比")
    for pct in (0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95):
        thr = _percentile(values, pct)
        hit = sum(1 for v in values if v >= thr)
        lines.append(
            f"  {thr:.5f} (P{int(pct * 100)})   {hit} / {len(values)}"
            f"  ({hit / len(values) * 100:.1f}%)"
        )

    report = "\n".join(lines)
    io.open(out_dir / "report.txt", "w", encoding="utf-8").write(report)

    _safe_print(report)
    _safe_print("")
    _safe_print(f"输出目录：{out_dir.resolve()}")
    return 0 if diag_ok else 2


def _safe_print(text: str) -> None:
    """打印到控制台，容忍非 UTF-8 终端。

    Windows 控制台常为 GBK，编码不了 ↔ / ⚠ 等字符会抛 UnicodeEncodeError，
    进而把脚本退出码搞成 1、掩盖真正的标定结论。报告文件本身是 UTF-8 完整版，
    控制台这里降级替换不可打印字符即可。
    """
    try:
        print(text)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "utf-8"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"))


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
