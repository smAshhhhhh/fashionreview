"""标注表格解析（纯函数，不碰 DB / 不碰网络，便于单测）。

`数据标注.xlsx` 是 WPS 的 DISPIMG 内嵌图格式，**不是**普通 xlsx：
单元格里存的是公式 `_xlfn.DISPIMG("ID_851F5D3B...", 1)`，图片本体在
`xl/media/imageN.jpeg`，两者靠两层间接映射关联：

    sheet1.xml 的 DISPIMG("ID_xxx")
      → cellimages.xml        ID_xxx  → rId
      → cellimages.xml.rels   rId     → media/imageN.jpeg

openpyxl / pandas 读不到这些图（它们只认 `xl/drawings`），故这里用 stdlib
zipfile + ElementTree 直接解析上述三个 part。

列结构（A1:J31，表头 1 行 + 30 行数据）：

    A 图片编号    仅前 2 行有值，不可作标识 —— 用文件名
    B 图片        DISPIMG 内嵌图
    C 图片描述    本版不解析
    D~J 图片属性1..7   每行 4~7 条，格式「指标名：等级成语」

空属性列在 sheet XML 中根本没有对应的 <c> 节点，故按列字母定位而非按出现顺序。
"""

from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

# ──────────────── 已知词表（仅用于导入告警，不做过滤） ────────────────

# 14 个出现过的属性指标名，全部精确命中 seed.sql 里 SPACE（空间美学）维度的三级指标
# （该维度共 15 个，只差「无障碍细节」未被标注使用）。
KNOWN_METRICS: frozenset[str] = frozenset({
    "建筑高低感", "街巷宽高比", "视廊净化度",
    "材料质感", "色彩控制力", "通透性",
    "外摆区品质", "橱窗叙事性", "店招独创性",
    "铺装精致化", "街巷家具集成度",
    "绿植搭配", "花箱容器设计", "光影与夜景照明",
})

# 21 个等级成语（归一后）。褒贬成对，但本版只显示原文、不折算分值。
KNOWN_GRADE_WORDS: frozenset[str] = frozenset({
    "明暗有致", "画龙点睛", "浑然天成", "一望无垠", "繁简相宜",
    "错落有致", "张弛有度", "千篇一律", "中规中矩", "别出心裁",
    "引人入胜", "各行其是", "随波逐流", "温润如玉", "平铺直叙",
    "差强人意", "美中不足", "隔而不绝", "门户森严", "相得益彰",
    "精雕细琢",
})

# 同音错字归一：源数据里「铺装精致化」既写作 中规中距(8 次) 又写作 中规中矩(1 次)
GRADE_ALIASES: dict[str, str] = {"中规中距": "中规中矩"}

# ──────────────── zip / xml 常量 ────────────────

_NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

_PART_SHEET = "xl/worksheets/sheet1.xml"
_PART_SHARED = "xl/sharedStrings.xml"
_PART_CELLIMAGES = "xl/cellimages.xml"
_PART_CELLIMAGES_RELS = "xl/_rels/cellimages.xml.rels"

# 属性所在列（D~J）与图片列
_ATTR_COLUMNS = ("D", "E", "F", "G", "H", "I", "J")
_IMAGE_COLUMN = "B"

# 图片扩展名白名单：写盘时按 media part 的后缀取，杜绝路径穿越与任意文件落盘
_ALLOWED_IMAGE_EXT = {".jpeg": ".jpg", ".jpg": ".jpg", ".png": ".png", ".webp": ".webp"}

# zip bomb 防护：上传的 xlsx 是不可信输入
_MAX_ZIP_ENTRIES = 2000
_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024  # 2GB（147MB 源文件解压后约 150MB）

_DISPIMG_ID_RE = re.compile(r"ID_[0-9A-Fa-f]+")
_CELL_REF_RE = re.compile(r"^([A-Z]+)(\d+)$")


@dataclass
class ParsedAttribute:
    """一条图片属性。"""

    attr_index: int          # 源列序号 1~7
    raw_text: str            # 原文，如「色彩控制力：繁简相宜」
    metric_name: str | None  # 拆解出的指标名
    grade_word: str | None   # 拆解并归一后的等级成语


@dataclass
class ParsedAnnotation:
    """一行标注数据。"""

    row_no: int              # 源表格行号（2~31）
    image_bytes: bytes
    image_ext: str           # 归一后的扩展名，如 .jpg
    attributes: list[ParsedAttribute] = field(default_factory=list)


def parse_annotation_xlsx(path: str) -> list[ParsedAnnotation]:
    """解析标注表格，返回每行的图片字节与属性列表。

    只读固定的四个 part，不遍历解压；解析失败的行整行跳过（无图或无属性）。
    """
    with zipfile.ZipFile(path) as zf:
        _assert_safe_zip(zf)
        shared = _read_shared_strings(zf)
        id_to_part = _read_cellimage_map(zf)
        rows = _read_sheet_rows(zf, shared)

        out: list[ParsedAnnotation] = []
        for row_no, cells in rows:
            if row_no == 1:  # 表头
                continue
            dispimg_id = cells.get(_IMAGE_COLUMN, "")
            part = id_to_part.get(dispimg_id)
            if not part:
                continue  # 该行没有内嵌图，无法作为标注样本
            image_bytes, image_ext = _read_media(zf, part)
            if image_bytes is None:
                continue

            attrs: list[ParsedAttribute] = []
            for idx, col in enumerate(_ATTR_COLUMNS, start=1):
                raw = (cells.get(col) or "").strip()
                if not raw:
                    continue
                metric_name, grade_word = split_attribute(raw)
                attrs.append(
                    ParsedAttribute(
                        attr_index=idx,
                        raw_text=raw,
                        metric_name=metric_name,
                        grade_word=grade_word,
                    )
                )
            if not attrs:
                continue  # 有图无属性，对本功能无用

            out.append(
                ParsedAnnotation(
                    row_no=row_no,
                    image_bytes=image_bytes,
                    image_ext=image_ext,
                    attributes=attrs,
                )
            )
    return out


# ──────────────── 属性文本处理 ────────────────

def split_attribute(raw: str) -> tuple[str | None, str | None]:
    """拆「指标名：等级成语」。

    源数据用全角「：」，这里同时容忍半角「:」。拆不开时返回 (None, None)，
    调用方仍会把 raw_text 入库并在导入摘要里告警，不静默丢数据。
    """
    text = (raw or "").strip()
    for sep in ("：", ":"):
        if sep in text:
            left, right = text.split(sep, 1)
            metric = left.strip()
            grade = normalize_grade_word(right.strip())
            return (metric or None), (grade or None)
    return None, None


def normalize_grade_word(word: str) -> str:
    """等级成语归一（同音错字 中规中距 → 中规中矩）。"""
    w = (word or "").strip()
    return GRADE_ALIASES.get(w, w)


def collect_unknown(
    annotations: list[ParsedAnnotation],
) -> tuple[list[str], list[str]]:
    """汇总未在已知词表内的指标名与等级成语，供导入摘要告警。

    返回 (unknown_metrics, unknown_grade_words)，均已去重排序。
    拆解失败（metric_name/grade_word 为 None）的条目计入 "(无法拆解)"。
    """
    unknown_metrics: set[str] = set()
    unknown_words: set[str] = set()
    for ann in annotations:
        for attr in ann.attributes:
            if attr.metric_name is None or attr.grade_word is None:
                unknown_metrics.add(f"(无法拆解){attr.raw_text}")
                continue
            if attr.metric_name not in KNOWN_METRICS:
                unknown_metrics.add(attr.metric_name)
            if attr.grade_word not in KNOWN_GRADE_WORDS:
                unknown_words.add(attr.grade_word)
    return sorted(unknown_metrics), sorted(unknown_words)


# ──────────────── zip / xml 读取 ────────────────

def _assert_safe_zip(zf: zipfile.ZipFile) -> None:
    """上传的 xlsx 是不可信输入：校验条目数与解压后总大小，防 zip bomb。"""
    infos = zf.infolist()
    if len(infos) > _MAX_ZIP_ENTRIES:
        raise ValueError(f"xlsx 内部条目过多（{len(infos)}），疑似异常文件")
    total = sum(i.file_size for i in infos)
    if total > _MAX_UNCOMPRESSED_BYTES:
        raise ValueError(f"xlsx 解压后体积过大（{total} 字节），疑似异常文件")
    names = set(zf.namelist())
    missing = [p for p in (_PART_SHEET, _PART_CELLIMAGES) if p not in names]
    if missing:
        raise ValueError(
            "不是预期的 WPS 标注表格：缺少 " + "、".join(missing)
            + "。请确认导出的是含内嵌图（DISPIMG）的 xlsx。"
        )


def _read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    """读共享字符串池；属性单元格是 t="s" 的池索引。"""
    if _PART_SHARED not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(_PART_SHARED))
    out: list[str] = []
    for si in root.findall(f"{_NS_MAIN}si"):
        # 富文本会拆成多个 <r><t>，拼接即得完整字符串
        out.append("".join(t.text or "" for t in si.iter(f"{_NS_MAIN}t")))
    return out


def _read_cellimage_map(zf: zipfile.ZipFile) -> dict[str, str]:
    """DISPIMG 的 ID → media part 路径（两层间接映射合成一层）。"""
    rels: dict[str, str] = {}
    if _PART_CELLIMAGES_RELS in zf.namelist():
        root = ET.fromstring(zf.read(_PART_CELLIMAGES_RELS))
        for rel in root.findall(f"{_NS_REL}Relationship"):
            rid = rel.get("Id")
            target = rel.get("Target")
            if rid and target:
                rels[rid] = target

    id_to_part: dict[str, str] = {}
    root = ET.fromstring(zf.read(_PART_CELLIMAGES))
    # 每个 cellImage 内：<xdr:cNvPr name="ID_xxx"/> 与 <a:blip r:embed="rIdN"/>
    for pic in root.iter():
        if not pic.tag.endswith("}pic"):
            continue
        name: str | None = None
        embed: str | None = None
        for node in pic.iter():
            if node.tag.endswith("}cNvPr") and node.get("name"):
                name = node.get("name")
            if node.tag.endswith("}blip") and node.get(f"{_NS_R}embed"):
                embed = node.get(f"{_NS_R}embed")
        if name and embed and embed in rels:
            target = rels[embed]
            # Target 形如 media/image1.jpeg，相对 xl/ 解析
            part = target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"
            id_to_part[name] = part
    return id_to_part


def _read_sheet_rows(
    zf: zipfile.ZipFile, shared: list[str]
) -> list[tuple[int, dict[str, str]]]:
    """读工作表，返回 [(行号, {列字母: 文本})]。

    按列字母定位而非按 <c> 出现顺序 —— 空单元格在 XML 里没有节点，
    按顺序取会让属性整体左移错位。
    """
    root = ET.fromstring(zf.read(_PART_SHEET))
    out: list[tuple[int, dict[str, str]]] = []
    for row in root.iter(f"{_NS_MAIN}row"):
        row_attr = row.get("r")
        if not row_attr or not row_attr.isdigit():
            continue
        row_no = int(row_attr)
        cells: dict[str, str] = {}
        for c in row.findall(f"{_NS_MAIN}c"):
            ref = c.get("r") or ""
            m = _CELL_REF_RE.match(ref)
            if not m:
                continue
            col = m.group(1)
            cells[col] = _cell_text(c, shared)
        if cells:
            out.append((row_no, cells))
    return out


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    """取单元格文本：共享串索引 / 内联串 / 公式原文（DISPIMG 用）。"""
    ctype = cell.get("t")
    if ctype == "s":  # 共享字符串池索引
        v = cell.find(f"{_NS_MAIN}v")
        if v is not None and (v.text or "").strip().isdigit():
            idx = int(v.text.strip())
            if 0 <= idx < len(shared):
                return shared[idx]
        return ""
    if ctype == "inlineStr":
        is_node = cell.find(f"{_NS_MAIN}is")
        if is_node is not None:
            return "".join(t.text or "" for t in is_node.iter(f"{_NS_MAIN}t"))
        return ""

    # 图片列是公式单元格：优先取公式原文，从中抓 DISPIMG 的 ID
    f_node = cell.find(f"{_NS_MAIN}f")
    if f_node is not None and f_node.text:
        m = _DISPIMG_ID_RE.search(f_node.text)
        if m:
            return m.group(0)
    v = cell.find(f"{_NS_MAIN}v")
    if v is not None and v.text:
        m = _DISPIMG_ID_RE.search(v.text)
        if m:
            return m.group(0)
        return v.text
    return ""


def _read_media(zf: zipfile.ZipFile, part: str) -> tuple[bytes | None, str]:
    """读 media part 字节；扩展名按白名单归一（.jpeg → .jpg）。"""
    if part not in zf.namelist():
        return None, ""
    lower = part.lower()
    ext = ""
    for allowed, normalized in _ALLOWED_IMAGE_EXT.items():
        if lower.endswith(allowed):
            ext = normalized
            break
    if not ext:
        return None, ""
    return zf.read(part), ext
