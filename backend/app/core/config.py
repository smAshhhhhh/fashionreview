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
    llm_model: str = "qwen3.7-plus"
    llm_timeout: int = 60

    # 图片上传落盘目录（相对后端工作目录）。对外仅暴露相对路径 /static/uploads/<uuid>.ext
    upload_dir: str = "static/uploads"

    @property
    def cors_origins_list(self) -> list[str]:
        """将逗号分隔的来源字符串解析为列表。"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """获取配置单例。"""
    return Settings()
