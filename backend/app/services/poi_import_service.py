"""资源中心 POI 文件导入服务。

支持 PostgreSQL 导出的 SQL 与中文 CSV。源文件只作为文本解析，绝不直接执行。
解析后统一写入 MySQL 的 street_poi 表。
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any

from app.db import repository as repo

AMAP_SQL_COLUMNS = [
    "店铺ID", "店铺名称", "地址(高德)", "经度(高德)", "纬度(高德)",
    "坐标(高德)", "一级分类(高德)", "二级分类(高德)",
]
DZDP_SQL_COLUMNS = [
    "店铺id", "店铺名字", "店铺图片", "团套餐", "是否连锁", "营业状态",
    "评价", "评价数量", "人均", "菜系分类", "商区", "推荐菜", "是否优惠信息",
]


def import_upload(
    conn,
    *,
    filename: str,
    content: bytes,
    street_name: str,
    city: str | None = None,
    district: str | None = None,
    source_mode: str | None = None,
    clear_existing: bool = False,
) -> dict[str, Any]:
    """解析并入库一个上传文件，返回导入摘要。"""
    text = content.decode("utf-8-sig", errors="replace")
    detected = detect_format(filename, text, source_mode)
    street_id = repo.get_or_create_street(conn, street_name, city, district)
    if clear_existing:
        src = None if detected["source"] == "mixed" else detected["source"]
        repo.delete_pois_by_street(conn, street_id, src)

    rows = parse_rows(text, detected)
    inserted = updated = skipped = 0
    warnings: list[str] = []
    sample_rows: list[dict[str, Any]] = []
    coverage_keys = ["name", "rating", "longitude", "category_l1", "cuisine", "avg_price", "is_chain"]
    coverage_hit = {k: 0 for k in coverage_keys}

    for r in rows:
        poi = normalize_row(r, detected, street_name)
        if not poi.get("name"):
            skipped += 1
            continue
        for k in coverage_keys:
            if poi.get(k) not in (None, ""):
                coverage_hit[k] += 1
        existed = repo.street_poi_exists(conn, street_id, poi.get("external_id"))
        repo.upsert_street_poi(conn, street_id, poi)
        if existed:
            updated += 1
        else:
            inserted += 1
        if len(sample_rows) < 20:
            sample_rows.append({k: poi.get(k) for k in [
                "source", "name", "address", "category_l1", "category_l2",
                "cuisine", "rating", "review_count", "avg_price", "is_chain",
            ]})

    total = len(rows)
    if skipped:
        warnings.append(f"{skipped} 行缺少店铺名称已跳过")
    denom = max(total - skipped, 1)
    return {
        "street": {"id": street_id, "name": street_name, "city": city, "district": district},
        "detected_format": detected["format"],
        "source": detected["source"],
        "total_rows": total,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "field_coverage": {k: round(v / denom, 4) for k, v in coverage_hit.items()},
        "sample_rows": sample_rows,
        "warnings": warnings,
    }


def detect_format(filename: str, text: str, source_mode: str | None = None) -> dict[str, str]:
    name = filename.lower()
    if source_mode in {"amap", "dianping", "mixed"}:
        source = source_mode
    elif name.startswith("dzdp_") or "dzdp_" in text.lower() or "店铺名字" in text:
        source = "dianping"
    elif name.endswith(".csv") and "店铺ID(合并)" in text:
        source = "mixed"
    else:
        source = "amap"

    if name.endswith(".csv"):
        fmt = "merged_csv" if source == "mixed" else ("amap_csv" if source == "amap" else "dzdp_csv")
    elif source == "dianping":
        fmt = "dzdp_sql"
    else:
        fmt = "amap_sql"
    return {"format": fmt, "source": source}


def parse_rows(text: str, detected: dict[str, str]) -> list[dict[str, Any]]:
    fmt = detected["format"]
    if fmt.endswith("csv"):
        return _parse_csv(text)
    cols = DZDP_SQL_COLUMNS if fmt == "dzdp_sql" else AMAP_SQL_COLUMNS
    out: list[dict[str, Any]] = []
    for values in _extract_sql_value_tuples(text):
        if len(values) < len(cols):
            continue
        out.append({cols[i]: values[i] for i in range(len(cols))})
    return out


def _parse_csv(text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    return [dict(r) for r in reader]


def _extract_sql_value_tuples(text: str) -> list[list[Any]]:
    """从 INSERT ... VALUES (...) 文本中提取 tuple 值。支持多行 VALUES 与单行 INSERT。"""
    tuples: list[list[Any]] = []
    for m in re.finditer(r"INSERT\s+INTO\s+.*?\s+VALUES\s*", text, re.I | re.S):
        i = m.end()
        depth = 0
        in_str = False
        start = None
        j = i
        while j < len(text):
            ch = text[j]
            if in_str:
                if ch == "'":
                    if j + 1 < len(text) and text[j + 1] == "'":
                        j += 2
                        continue
                    in_str = False
                j += 1
                continue
            if ch == "'":
                in_str = True
            elif ch == "(":
                if depth == 0:
                    start = j + 1
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0 and start is not None:
                    tuples.append(_split_sql_tuple(text[start:j]))
                    start = None
            elif ch == ";" and depth == 0:
                break
            j += 1
    return tuples


def _split_sql_tuple(s: str) -> list[Any]:
    vals: list[str] = []
    buf: list[str] = []
    in_str = False
    i = 0
    while i < len(s):
        ch = s[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
        elif ch == ",":
            vals.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    vals.append("".join(buf).strip())
    return [_parse_sql_value(v) for v in vals]


def _parse_sql_value(v: str) -> Any:
    if v.upper() == "NULL" or v == "":
        return None
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        return v


def normalize_row(row: dict[str, Any], detected: dict[str, str], street_name: str) -> dict[str, Any]:
    fmt = detected["format"]
    if fmt == "amap_sql" or (fmt == "amap_csv"):
        return _normalize_amap(row, street_name)
    if fmt == "dzdp_sql" or fmt == "dzdp_csv":
        return _normalize_dzdp(row, street_name)
    return _normalize_merged_csv(row, street_name)


def _normalize_amap(row: dict[str, Any], street_name: str) -> dict[str, Any]:
    sid = row.get("店铺ID") or row.get("id") or row.get("external_id")
    return {
        "external_id": f"amap:{street_name}:{sid}" if sid is not None else None,
        "source": "amap",
        "name": _clean_str(row.get("店铺名称") or row.get("name")),
        "address": _clean_str(row.get("地址(高德)") or row.get("address")),
        "longitude": _to_decimal(row.get("经度(高德)") or row.get("longitude")),
        "latitude": _to_decimal(row.get("纬度(高德)") or row.get("latitude")),
        "category_l1": _clean_str(row.get("一级分类(高德)") or row.get("category_l1")),
        "category_l2": _clean_str(row.get("二级分类(高德)") or row.get("category_l2")),
        "merge_source": "仅高德",
    }


def _normalize_dzdp(row: dict[str, Any], street_name: str) -> dict[str, Any]:
    sid = row.get("店铺id") or row.get("店铺ID")
    rating = _to_float(row.get("评价"))
    if rating == 0:
        rating = None
    return {
        "external_id": f"dianping:{street_name}:{sid}" if sid is not None else None,
        "source": "dianping",
        "name": _clean_str(row.get("店铺名字") or row.get("店铺名称")),
        "business_area": _clean_str(row.get("商区")),
        "cuisine": _clean_str(row.get("菜系分类") or row.get("菜系(点评)")),
        "rating": rating,
        "review_count": _to_int(row.get("评价数量") or row.get("评论数(合并)")),
        "avg_price": _to_decimal(row.get("人均") or row.get("人均消费(点评)")),
        "is_chain": _to_int(row.get("是否连锁") or row.get("是否连锁(点评)")),
        "has_promotion": _to_int(row.get("是否优惠信息") or row.get("是否有优惠(点评)")),
        "business_status": _clean_str(row.get("营业状态") or row.get("营业状态(点评)")),
        "image_url": _clean_str(row.get("店铺图片") or row.get("店铺图片(点评)")),
        "merge_source": "仅点评",
    }


def _normalize_merged_csv(row: dict[str, Any], street_name: str) -> dict[str, Any]:
    # merged CSV 每行可能「仅高德/仅点评/双方共有」，优先保留能拿到的全部字段。
    sid = row.get("店铺ID(合并)")
    rating = _to_float(row.get("评分(合并)"))
    if rating == 0:
        rating = None
    source = "mixed"
    merge_source = _clean_str(row.get("合并来源"))
    if merge_source == "仅高德":
        source = "amap"
    elif merge_source == "仅点评":
        source = "dianping"
    return {
        "external_id": f"{source}:{street_name}:{sid}" if sid is not None else None,
        "source": source,
        "name": _clean_str(row.get("店铺名称(合并)")),
        "address": _clean_str(row.get("地址(高德)")),
        "business_area": _clean_str(row.get("商区(点评)")),
        "longitude": _to_decimal(row.get("经度(高德)")),
        "latitude": _to_decimal(row.get("纬度(高德)")),
        "category_l1": _clean_str(row.get("一级分类(高德)")),
        "category_l2": _clean_str(row.get("二级分类(高德)")),
        "cuisine": _clean_str(row.get("菜系(点评)")),
        "rating": rating,
        "review_count": _to_int(row.get("评论数(合并)")),
        "avg_price": _to_decimal(row.get("人均消费(点评)")),
        "checkin_count": _to_int(row.get("签到数(高德)")),
        "is_chain": _to_int(row.get("是否连锁(点评)")),
        "has_promotion": _to_int(row.get("是否有优惠(点评)")),
        "business_status": _clean_str(row.get("营业状态(点评)")),
        "image_url": _clean_str(row.get("店铺图片(点评)")),
        "merge_source": merge_source,
    }


def _clean_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group(0)) if m else None


def _to_int(v: Any) -> int | None:
    f = _to_float(v)
    return int(f) if f is not None else None


def _to_decimal(v: Any) -> float | None:
    return _to_float(v)
