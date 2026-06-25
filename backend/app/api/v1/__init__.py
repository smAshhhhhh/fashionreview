"""v1 API 路由聚合。"""

from fastapi import APIRouter

from app.api.v1.analytics_config import router as analytics_config_router
from app.api.v1.evaluation import router as evaluation_router
from app.api.v1.metric_template import router as metric_template_router
from app.api.v1.prompt import router as prompt_router
from app.api.v1.task import router as task_router

api_router = APIRouter()
api_router.include_router(evaluation_router)
api_router.include_router(prompt_router)
api_router.include_router(task_router)
api_router.include_router(analytics_config_router)
api_router.include_router(metric_template_router)
