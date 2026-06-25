"""日志配置。

集中初始化根 logger，统一输出格式（时间 + 级别 + 线程名 + logger 名 + 消息）。
线程名入格式是为了在并发评分时一眼区分是哪个 score-* 线程的日志。
业务代码通过 get_logger(__name__) 取 logger，不要各自 basicConfig。
"""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False

_FORMAT = "%(asctime)s | %(levelname)-5s | %(threadName)-12s | %(name)s | %(message)s"
_DATEFMT = "%H:%M:%S"


def setup_logging(level: str = "INFO") -> None:
    """初始化根 logger，幂等（重复调用只生效一次）。

    :param level: 根日志级别名，如 INFO / DEBUG。
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger()
    root.setLevel(level.upper())

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))
    root.addHandler(handler)

    # uvicorn 自带 handler，避免与根 logger 重复输出
    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).propagate = False

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """取一个已挂到根配置的 logger。"""
    return logging.getLogger(name)
