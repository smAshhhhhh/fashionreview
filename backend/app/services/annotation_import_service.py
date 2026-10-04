"""人工标注库导入服务。

两步走，刻意不合成一步：

  ① 导入（同步）—— 解析 xlsx、图片落盘、属性入库。秒级，请求内完成。
  ② 算向量（异步）—— 30 次 embedding 调用是网络密集操作，走后台线程池，
     前端轮询 job 状态。若与导入合并，上传请求会挂住几十秒。

异步任务沿用 profile_service 的同款模式（模块级 ThreadPoolExecutor + 内存
_jobs dict + start_*_job / get_*_job），保持代码库内一致。
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db import repository as repo
from app.db.session import connection_scope
from app.services.annotation import xlsx_parser
from app.services.annotation.embedding import embed_image

logger = get_logger(__name__)

_embed_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="annot-embed")
_embed_jobs: dict[str, dict[str, Any]] = {}


# ──────────────── ① 导入 ────────────────

def import_annotation_xlsx(
    *, temp_path: str, clear_existing: bool = False
) -> dict[str, Any]:
    """解析标注表格并入库，返回导入摘要。

    :param temp_path: 上传文件落到的本地临时路径（API 层负责创建与清理）
    :param clear_existing: True 时先清空标注库再导入
    """
    annotations = xlsx_parser.parse_annotation_xlsx(temp_path)
    if not annotations:
        raise ValueError(
            "未从表格中解析出任何标注数据。请确认这是含内嵌图（DISPIMG）的 WPS 表格，"
            "且「图片」列与「图片属性」列有内容。"
        )

    settings = get_settings()
    annotation_dir = Path(settings.annotation_dir)
    annotation_dir.mkdir(parents=True, exist_ok=True)

    unknown_metrics, unknown_grade_words = xlsx_parser.collect_unknown(annotations)

    inserted = updated = attr_total = 0
    unsplittable = 0
    written_files: list[Path] = []

    try:
        with connection_scope() as conn:
            if clear_existing:
                removed = repo.delete_all_annotations(conn)
                logger.info("清空标注库：删除 %s 张标注图", removed)

            for ann in annotations:
                # 源表格没有可靠的图片文件名列（「图片编号」仅前 2 行有值），
                # 故以行号构造稳定的逻辑名作为唯一键；重复导入同一份表格时
                # 同一行仍映射到同一条记录，已算好的向量得以保留。
                file_name = f"row{ann.row_no:03d}{ann.image_ext}"
                # 落盘用 uuid 命名，扩展名来自解析器白名单，杜绝路径穿越
                disk_name = f"{uuid.uuid4().hex}{ann.image_ext}"
                abs_path = annotation_dir / disk_name
                abs_path.write_bytes(ann.image_bytes)
                written_files.append(abs_path)
                rel_url = f"/static/annotations/{disk_name}"

                annotation_id, existed = repo.upsert_annotation_image(
                    conn,
                    file_name=file_name,
                    image_url=rel_url,
                    row_no=ann.row_no,
                )
                if existed:
                    updated += 1
                else:
                    inserted += 1

                attrs = [
                    {
                        "attr_index": a.attr_index,
                        "raw_text": a.raw_text,
                        "metric_name": a.metric_name,
                        "grade_word": a.grade_word,
                    }
                    for a in ann.attributes
                ]
                unsplittable += sum(
                    1 for a in ann.attributes if a.metric_name is None
                )
                attr_total += repo.replace_annotation_attributes(
                    conn, annotation_id, attrs
                )
    except Exception:
        # 入库失败则清掉本次已写的图片，不留孤儿文件
        for p in written_files:
            p.unlink(missing_ok=True)
        raise

    warnings: list[str] = []
    if unknown_metrics:
        warnings.append(
            f"{len(unknown_metrics)} 个指标名未命中空间美学维度的三级指标，"
            "这些属性仍已入库，但前端无法与指标行对齐"
        )
    if unknown_grade_words:
        warnings.append(f"{len(unknown_grade_words)} 个等级成语不在已知词表内")
    if unsplittable:
        warnings.append(f"{unsplittable} 条属性无法按「指标名：等级成语」拆解")

    summary = {
        "total_rows": len(annotations),
        "inserted": inserted,
        "updated": updated,
        "attr_total": attr_total,
        "unknown_metrics": unknown_metrics,
        "unknown_grade_words": unknown_grade_words,
        "warnings": warnings,
    }
    logger.info(
        "标注库导入完成：%s 行（新增 %s / 更新 %s），属性 %s 条，未知指标 %s 个，未知成语 %s 个",
        len(annotations), inserted, updated, attr_total,
        len(unknown_metrics), len(unknown_grade_words),
    )
    return summary


# ──────────────── ② 算向量（异步） ────────────────

def start_embedding_job(*, force: bool = False) -> str:
    """异步生成标注图向量，立即返回 job_id。

    :param force: False 只补算缺失/模型不符的；True 全部重算
    """
    settings = get_settings()
    with connection_scope() as conn:
        if force:
            ids = repo.list_all_annotation_ids(conn)
        else:
            ids = repo.list_annotation_ids_without_embedding(
                conn,
                model=settings.annotation_embedding_model,
                dim=settings.annotation_embedding_dim,
            )

    job_id = uuid.uuid4().hex
    _embed_jobs[job_id] = {
        "job_id": job_id,
        "status": "running" if ids else "completed",
        "total": len(ids),
        "done": 0,
        "failed": 0,
        "error": None,
    }
    if ids:
        _embed_executor.submit(_run_embedding_job, job_id, ids)
    return job_id


def get_embedding_job(job_id: str) -> dict[str, Any] | None:
    """查询向量生成任务状态。"""
    return _embed_jobs.get(job_id)


def _run_embedding_job(job_id: str, annotation_ids: list[int]) -> None:
    """逐张算向量。单张失败不终止整批 —— 记 failed 计数，其余继续。"""
    settings = get_settings()
    model = settings.annotation_embedding_model
    dim = settings.annotation_embedding_dim
    job = _embed_jobs[job_id]
    annotation_dir = Path(settings.annotation_dir)

    for annotation_id in annotation_ids:
        try:
            with connection_scope() as conn:
                rel_url = repo.get_annotation_image_url(conn, annotation_id)
            if not rel_url:
                job["failed"] += 1
                continue
            # rel_url 形如 /static/annotations/xxx.jpg；按文件名拼回落盘目录，
            # 不用 url 前缀拼路径（避免 url 结构与磁盘布局耦合）
            abs_path = annotation_dir / Path(rel_url).name
            vector = embed_image(str(abs_path))
            with connection_scope() as conn:
                repo.update_annotation_embedding(
                    conn, annotation_id, vector, model, len(vector)
                )
            job["done"] += 1
        except Exception as exc:  # noqa: BLE001 - 单张失败不拖垮整批
            job["failed"] += 1
            job["error"] = str(exc)[:300]
            logger.warning(
                "标注图 %s 生成向量失败：%s", annotation_id, exc, exc_info=True
            )

    job["status"] = "completed" if job["failed"] == 0 else "partial"
    logger.info(
        "标注库向量生成结束：成功 %s / 失败 %s（model=%s dim=%s）",
        job["done"], job["failed"], model, dim,
    )


# ──────────────── 查询 ────────────────

def list_annotations(limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """标注图分页列表 + 库概览计数。"""
    with connection_scope() as conn:
        data = repo.list_annotations(conn, limit=limit, offset=offset)
        counts = repo.count_annotations(conn)
    data.update(counts)
    return data


def clear_annotations() -> int:
    """清空标注库（图片文件一并删除），返回删除的图片数。"""
    settings = get_settings()
    with connection_scope() as conn:
        removed = repo.delete_all_annotations(conn)
    # 库已清空，目录下的图片文件成为孤儿，一并清理
    annotation_dir = Path(settings.annotation_dir)
    if annotation_dir.is_dir():
        for p in annotation_dir.iterdir():
            if p.is_file():
                p.unlink(missing_ok=True)
    return removed
