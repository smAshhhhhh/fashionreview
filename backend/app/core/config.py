"""应用配置。

从环境变量 / .env 文件读取配置，集中管理。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """全局配置项。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 应用基础信息
    app_name: str = "Fashion Street AI"
    environment: str = "development"
    debug: bool = True
    # 日志级别（DEBUG 可看到每次 LLM 调用的耗时与 token）
    log_level: str = "INFO"

    # 服务监听
    host: str = "0.0.0.0"
    port: int = 8000

    # 跨域来源，逗号分隔的字符串
    cors_origins: str = "http://localhost:3000"

    # 数据库（MySQL）
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "fashion_review"
    db_charset: str = "utf8mb4"

    # LLM（通义千问 / 阿里云百炼，OpenAI 兼容模式）
    llm_api_key: str = ""
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.6-plus-2026-04-02"
    llm_timeout: int = 180
    llm_enable_search: bool = True

    # 图片上传落盘目录（相对后端工作目录）。对外仅暴露相对路径 /static/uploads/<uuid>.ext
    upload_dir: str = "static/uploads"

    # 人工标注库（图片属性匹配）
    # 标注图落盘目录；main.py 已把整个 static/ mount 到 /static，无需额外 mount
    annotation_dir: str = "static/annotations"
    # 多模态向量模型（百炼原生 REST，非 OpenAI 兼容接口）
    annotation_embedding_model: str = "qwen3-vl-embedding"
    # 向量维度：默认 2560 偏大，1024 足够且省存储
    annotation_embedding_dim: int = 1024
    # embedding 前统一缩图的长边上限。标注图最大 6MB，base64 后逼近接口 10MB 上限；
    # 且上传照片与标注图必须同样预处理，否则向量分布不一致会拉低匹配质量
    annotation_embed_max_px: int = 1280
    # 匹配留痕的候选数：Top-1 用于赋属性，其余仅供排查为何匹错
    annotation_match_top_n: int = 5
    # 「相似审美节点」区块的展示下限：低于此相似度的候选不摆到结果页上。
    # 注意这是**展示过滤**，与匹配判定无关 —— Top-1 赋属性始终不设阈值。
    annotation_similar_min_similarity: float = 0.5

    @property
    def cors_origins_list(self) -> list[str]:
        """将逗号分隔的来源字符串解析为列表。"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """获取配置单例。"""
    return Settings()
