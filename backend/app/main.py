"""FastAPI 应用入口。

Fashion Street AI 后端服务的基础骨架，当前仅提供健康检查与路由挂载，
具体业务功能待后续迭代实现。
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.logging import setup_logging

settings = get_settings()

# 初始化日志（须在任何业务 logger 使用前调用）
setup_logging(settings.log_level)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
)

# 开发环境允许所有来源（仅本地开发使用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许任何来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 v1 API 路由
app.include_router(api_router, prefix="/api/v1")

# 上传图片的静态服务：upload_dir = static/uploads，挂在 /static 下供前端展示原图。
# 启动即建目录，避免首次上传前 mount 失败。
_static_root = Path(settings.upload_dir).parent  # static/
_static_root.mkdir(parents=True, exist_ok=True)
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_root)), name="static")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """服务健康检查。"""
    return {"status": "ok", "environment": settings.environment}


def main() -> None:
    """本地启动入口：python -m app.main"""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
