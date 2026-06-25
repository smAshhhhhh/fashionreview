"""LLM 客户端封装（通义千问 / 阿里云百炼，OpenAI 兼容模式）。

负责：构造客户端、发起对话、强制 JSON 输出、解析返回与 token 统计。
不直接写库；Prompt 日志由调用方（service）拿到返回后落 ai_prompt_log。
"""

from __future__ import annotations

import base64
import json
import mimetypes
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from openai import OpenAI

from app.core.config import get_settings


@dataclass
class LLMResponse:
    """一次 LLM 调用的结果。"""

    text: str
    model: str
    prompt_text: str
    token_usage: int | None

    def parse_json(self) -> Any:
        """把返回文本解析为 JSON；容忍 ```json 代码块包裹。"""
        return _extract_json(self.text)


@lru_cache
def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError(
            "未配置 LLM_API_KEY，请在 backend/.env 设置通义千问 API Key。"
        )
    return OpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        timeout=settings.llm_timeout,
    )


def chat(
    system_prompt: str,
    user_prompt: str,
    *,
    json_mode: bool = True,
    temperature: float = 0.3,
    model: str | None = None,
) -> LLMResponse:
    """发起一次对话调用。

    :param json_mode: True 时要求模型返回 JSON 对象（response_format）。
    :param model: 覆盖默认模型；None 时用配置中的 llm_model。
    """
    settings = get_settings()
    client = _get_client()
    use_model = model or settings.llm_model

    kwargs: dict[str, Any] = {
        "model": use_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = client.chat.completions.create(**kwargs)
    text = resp.choices[0].message.content or ""
    token_usage = resp.usage.total_tokens if resp.usage else None

    return LLMResponse(
        text=text,
        model=use_model,
        prompt_text=f"[system]\n{system_prompt}\n\n[user]\n{user_prompt}",
        token_usage=token_usage,
    )


def chat_vision(
    system_prompt: str,
    user_prompt: str,
    image_path: str,
    *,
    json_mode: bool = True,
    temperature: float = 0.3,
    model: str | None = None,
) -> LLMResponse:
    """带图片的对话调用（识图）。

    图片以 base64 data URI 内联发送——只接受本地文件路径，绝不把可访问 URL
    交给模型，避免模型反向请求本机服务。返回结构与 chat() 完全一致。
    """
    settings = get_settings()
    client = _get_client()
    use_model = model or settings.llm_model

    data_uri = _encode_image(image_path)

    kwargs: dict[str, Any] = {
        "model": use_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            },
        ],
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = client.chat.completions.create(**kwargs)
    text = resp.choices[0].message.content or ""
    token_usage = resp.usage.total_tokens if resp.usage else None

    return LLMResponse(
        text=text,
        model=use_model,
        # 日志里不落 base64，只标注图片来源，避免日志爆炸
        prompt_text=f"[system]\n{system_prompt}\n\n[user]\n{user_prompt}\n[image]\n{image_path}",
        token_usage=token_usage,
    )


def _encode_image(image_path: str) -> str:
    """读取本地图片，编码为 data URI。MIME 由扩展名推断，未知则按 jpeg。"""
    path = Path(image_path)
    mime, _ = mimetypes.guess_type(path.name)
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _extract_json(text: str) -> Any:
    """从模型返回中提取 JSON。优先直接解析，失败则剥离代码块 / 截取首个 {…}。"""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 去掉 ```json ... ``` 包裹
    if text.startswith("```"):
        inner = text.split("```", 2)
        if len(inner) >= 2:
            body = inner[1]
            body = body[4:] if body.lstrip().lower().startswith("json") else body
            try:
                return json.loads(body.strip())
            except json.JSONDecodeError:
                pass

    # 截取首个 { 到末个 }
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError(f"无法从 LLM 返回中解析 JSON：{text[:200]}")
