# Fashion Street AI — 后端服务

街巷时尚资源智能分析平台的后端，基于 FastAPI。

当前为基础框架，尚未实现具体业务功能。

## 技术栈

- Python 3.12+
- FastAPI
- Uvicorn
- Pydantic / pydantic-settings

## 目录结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # 应用入口
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       └── __init__.py   # v1 路由汇总
│   └── core/
│       ├── __init__.py
│       └── config.py    # 配置
├── requirements.txt
├── .env.example
└── README.md
```

## 本地运行

```bash
# 1. 创建并激活虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 准备环境变量
cp .env.example .env

# 4. 启动服务
python -m app.main
# 或
uvicorn app.main:app --reload
```

## 接口

启动后访问：

- 健康检查：http://localhost:8000/health
- v1 探测：http://localhost:8000/api/v1/ping
- 交互式文档：http://localhost:8000/docs
