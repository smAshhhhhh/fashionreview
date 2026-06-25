# Fashion Street AI — 长三角街巷时尚度评价平台

基于 LLM 的多维度街巷时尚度智能评价系统。用户输入街巷名称或上传街景照片，系统自动识别街道、召回 POI 画像事实、并发评分 75 项三级指标、聚合生成综合报告，并以雷达图、维度拆解、AI 洞察等形式展示结果。

---

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [数据库设计](#数据库设计)
- [核心架构](#核心架构)
- [关键任务流](#关键任务流)
  - [1. 文本分析主流程](#1-文本分析主流程)
  - [2. 图片分析流程](#2-图片分析流程)
  - [3. 实时进度推送 (SSE)](#3-实时进度推送-sse)
  - [4. 评分聚合机制](#4-评分聚合机制)
  - [5. Prompt 模板管理](#5-prompt-模板管理)
  - [6. 指标体系模板版本管理](#6-指标体系模板版本管理)
  - [7. 分析中心显示配置](#7-分析中心显示配置)
  - [8. 历史记录与结果回溯](#8-历史记录与结果回溯)
  - [9. 活跃任务守卫](#9-活跃任务守卫)
- [前端页面与组件](#前端页面与组件)
- [API 接口一览](#api-接口一览)
- [环境变量与启动](#环境变量与启动)

---

## 技术栈

### 前端

| 项目 | 版本 | 说明 |
|------|------|------|
| Next.js | 16.2.9 | App Router，Turbopack 构建 |
| React | 19.2.4 | — |
| TypeScript | ^5 | strict 模式 |
| Tailwind CSS | v4 | 通过 PostCSS 插件集成 |
| Google Fonts | Inter | Material Symbols Outlined 图标 |

### 后端

| 项目 | 版本 | 说明 |
|------|------|------|
| Python | 3.12 | — |
| FastAPI | 0.115.6 | ASGI 框架 |
| Uvicorn | 0.34.0 | ASGI 服务器 |
| Pydantic | 2.10.4 | 数据校验 + Settings |
| PyMySQL | 1.1.1 | MySQL 驱动 |
| OpenAI SDK | 1.59.6 | 对接阿里云 DashScope（通义千问，OpenAI 兼容模式） |
| sse-starlette | 2.1.3 | Server-Sent Events 实时推送 |

### 数据库

- **MySQL** (InnoDB, utf8mb4)
- 分制：三级指标整数 1\~5，二/一级及综合分由下层加权平均得出，值域 1.0\~5.0，精确到一位小数

---

## 项目结构

```
fashion review/
├── backend/                          # FastAPI 后端
│   ├── app/
│   │   ├── main.py                   # 应用入口：CORS、路由挂载、静态文件、健康检查
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic Settings（DB/LLM/CORS 等环境变量）
│   │   │   └── logging.py            # 日志初始化
│   │   ├── api/v1/                   # 路由层
│   │   │   ├── __init__.py           # 路由聚合（evaluation/prompt/task/analytics_config/metric_template）
│   │   │   ├── evaluation.py         # 评价分析 API（文本/图片提交、结果查询、历史列表）
│   │   │   ├── task.py               # 任务进度 API（轮询 + SSE 流）
│   │   │   ├── prompt.py             # Prompt 模板 CRUD + 版本回滚
│   │   │   ├── metric_template.py    # 指标体系模板 CRUD + 克隆/启用/维度树编辑
│   │   │   └── analytics_config.py   # 分析中心显示配置查询/更新
│   │   ├── schemas/
│   │   │   └── evaluation.py         # 全部 Pydantic 请求/响应模型
│   │   ├── services/                 # 业务逻辑层
│   │   │   ├── evaluation_service.py # 评价流程编排（核心：识别→画像→评分→聚合→报告）
│   │   │   ├── llm_client.py         # LLM 客户端封装（chat / chat_vision / JSON 解析）
│   │   │   ├── prompt_builder.py     # Prompt 构造（DB 模板 + 硬编码兜底）
│   │   │   ├── scoring_service.py    # 评分聚合（三级→二级→一级→综合，纯函数）
│   │   │   ├── retriever.py          # 街巷知识检索（POI 画像 → 结构化 facts 文本）
│   │   │   ├── profile_service.py    # 街巷画像聚合（POI 明细 → 数值字段 + extra_stats）
│   │   │   ├── progress_service.py   # 进度更新（独立短连接，与主流程解耦）
│   │   │   ├── prompt_service.py     # Prompt 模板管理（版本归档 + 回滚）
│   │   │   ├── metric_template_service.py # 指标模板管理（复制式模板、已用则另存保护）
│   │   │   └── display_config_service.py  # 显示配置管理
│   │   └── db/
│   │       ├── session.py            # MySQL 连接上下文（connection_scope）
│   │       ├── repository.py         # 数据访问层（裸 SQL，集中读写）
│   │       ├── schema.sql            # 核心 DDL（13 张表：模板/维度/街巷/评价/分数/证据/趋势/配置）
│   │       ├── schema_ai.sql         # AI 扩展 DDL（POI/画像/AI任务/Prompt模板）
│   │       └── seed.sql              # 种子数据
│   ├── static/uploads/               # 上传图片存储
│   └── requirements.txt
├── frontend/                         # Next.js 前端
│   ├── src/
│   │   ├── lib/api.ts                # API 客户端封装
│   │   └── app/
│   │       ├── layout.tsx            # 根布局（Inter 字体、zh-CN、Material Symbols）
│   │       ├── page.tsx              # 首页（搜索 + 最近洞察）
│   │       ├── types/index.ts        # 共享 TypeScript 类型
│   │       ├── components/           # 14 个 UI 组件
│   │       ├── analytics/page.tsx    # 分析结果页
│   │       ├── progress/page.tsx     # 分析进度页（SSE 驱动）
│   │       ├── history/page.tsx      # 历史记录页
│   │       └── resources/            # 资源中心（Prompt/指标/分析管理）
│   └── package.json
├── docs/                             # 设计文档
└── 时尚街区点评/                      # 参考研究资料（不参与运行）
```

---

## 数据库设计

### 核心表概览

```
┌─────────────────────────────────────────────────────────────┐
│                     指标体系（模板化）                        │
│                                                             │
│  metric_template ──┬── fashion_dimension      (一级维度)     │
│  (版本/模板)       ├── fashion_sub_dimension   (二级维度)     │
│                    └── fashion_metric          (三级指标)     │
│                     5 一级 × 5 二级 × 3 三级 = 75 指标        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     评价业务                                  │
│                                                             │
│  street ── street_evaluation ──┬── street_metric_score       │
│  (街巷)     (一次评价)         ├── street_dimension_score    │
│                                └── street_metric_evidence    │
│                                                             │
│  street_poi ── street_profile   (POI → 画像聚合)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     AI 任务                                  │
│                                                             │
│  ai_analysis_task ── ai_analysis_result  (识别结果)          │
│       │                                                     │
│       └── ai_prompt_log            (Prompt 调用日志)         │
│                                                             │
│  ai_prompt_template ── ai_prompt_template_history            │
│  (当前模板)             (历史版本，支持回滚)                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     平台配置                                  │
│                                                             │
│  analytics_display_config    (分析中心显示区块开关)            │
│  street_similarity           (相似街巷，待接入)               │
│  street_keyword              (街巷热词)                      │
│  street_trend                (历史趋势)                      │
└─────────────────────────────────────────────────────────────┘
```

### 分制说明

| 层级 | 分制 | 说明 |
|------|------|------|
| 三级指标 | 整数 1\~5 | LLM 直接打分：5=极高, 4=较高, 3=一般, 2=较低, 1=极低 |
| 二级维度 | 1.0\~5.0 | 其下三级指标的加权平均（权重归一化） |
| 一级维度 | 1.0\~5.0 | 其下二级维度的加权平均 |
| 综合分 | 1.0\~5.0 | 五个一级维度的加权平均 |

---

## 核心架构

```
用户输入（文字/图片）
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  街巷识别     │────▶│  画像召回     │────▶│  并发评分     │
│  (LLM)       │     │  (POI→facts) │     │  (5 维度并行) │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  报告生成     │◀────│  分数聚合     │
                    │  (LLM)       │     │  (加权平均)   │
                    └──────────────┘     └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  结果入库     │
                    │  + 前端展示   │
                    └──────────────┘
```

### 分层设计

- **路由层** (`api/v1/`)：参数校验、HTTP 状态码、响应模型映射
- **服务层** (`services/`)：业务编排、LLM 调用、进度更新、模板渲染
- **数据层** (`db/repository.py`)：裸 SQL 读写，接收调用方传入的连接，便于事务控制
- **连接管理** (`db/session.py`)：`connection_scope()` 上下文管理器，正常提交/异常回滚/最终关闭

### 事务策略

- LLM 调用耗时较长，不长开事务
- 识别 + 建任务：一个短事务
- 最终入库（明细 + 聚合 + 回写表头）：一个事务
- Prompt 日志：各自独立短事务写入，失败不影响主流程
- 进度更新：独立连接独立提交，失败静默

---

## 关键任务流

### 1. 文本分析主流程

```
前端 SearchBar                后端 evaluation_service           后端后台线程池
    │                              │                                │
    │ POST /analyze/text           │                                │
    │ {content, city}              │                                │
    │─────────────────────────────▶│                                │
    │                              │ create_ai_task (pending)       │
    │                              │───────────────────────────────▶│
    │                              │   _task_executor.submit()      │
    │   {task_id, status}          │                                │
    │◀─────────────────────────────│                                │
    │                              │                                │
    │  (前端跳转 /progress)         │          _run_pipeline()       │
    │                              │          ① recognize_street    │
    │                              │             LLM 识别街巷名     │
    │                              │          ② retriever.retrieve  │
    │                              │             POI→画像 facts     │
    │                              │          ③ score_all_metrics   │
    │                              │             5 维度并发 LLM 评分 │
    │                              │          ④ aggregate           │
    │                              │             加权平均聚合        │
    │                              │          ⑤ generate_report     │
    │                              │             LLM 生成综合报告   │
    │                              │          ⑥ 入库（一个事务）     │
```

**详细步骤：**

1. **提交**：`POST /analyze/text` → 创建 `ai_analysis_task` (status=pending) → 提交到 `ThreadPoolExecutor(max_workers=5)` → 立即返回 `{task_id, status}`
2. **识别**：调用 LLM（通义千问）从用户文本中提取规范街巷名、城市、行政区、置信度；置信度 < 0.5 视为失败
3. **画像**：`profile_service` 按 street_id 查 `street_poi` 聚合出 `street_profile`（POI 总数、连锁占比、高评分占比、人均消费、分类计数、亮点品牌），`retriever` 将其格式化为 `[POI_SUMMARY]` / `[POI_HIGHLIGHTS]` / `[STREET_PROFILE]` 结构化文本
4. **并发评分**：75 个三级指标按 5 个一级维度分 5 批，每批独立线程调用 LLM 打分（1\~5 整数 + 理由），每完成一个维度更新进度；缺失指标兜底补中位分 3
5. **聚合**：`scoring_service.aggregate()` 纯函数，三级→二级→一级→综合逐层加权平均
6. **报告**：调用 LLM 生成 150 字综合画像 + 优势/短板/建议
7. **入库**：一个事务写入 `street_metric_score`（75 行）+ `street_dimension_score`（30 行）+ 回写 `street_evaluation`

### 2. 图片分析流程

```
前端 SearchBar                后端 evaluation.py                后端后台线程池
    │                              │                                │
    │ POST /analyze/image          │                                │
    │ (multipart: file + city)     │                                │
    │─────────────────────────────▶│                                │
    │                              │ 校验类型/大小                   │
    │                              │ 落盘 static/uploads/<uuid>.ext │
    │                              │ create_ai_task (image)         │
    │                              │───────────────────────────────▶│
    │   {task_id, status}          │                                │
    │◀─────────────────────────────│                                │
    │                              │                                │
    │                              │    recognize_street_from_image  │
    │                              │    (chat_vision: base64 图片)   │
    │                              │    → 识别街巷名/城市/置信度      │
    │                              │    → 后续与文字流程完全一致      │
```

- 允许类型：JPEG / PNG / WebP，上限 10MB
- 图片以 base64 data URI 内联发送给 LLM，不暴露本地 URL
- 识别后流程与文字分析完全一致（步骤 2\~7）

### 3. 实时进度推送 (SSE)

```
前端 progress/page.tsx           后端 task.py
    │                              │
    │ GET /task/{id}/progress      │ (SSE)
    │─────────────────────────────▶│
    │                              │ event_generator():
    │                              │   每秒查 DB，内容变化才推
    │  event: progress             │
    │  data: {task_id, status,     │
    │    progress, current_stage,  │
    │    stage_message, ...}       │
    │◀─────────────────────────────│
    │                              │
    │  (status = completed/failed) │
    │  推最后一帧，关闭连接         │
```

**进度节点：**

| 阶段 | 进度 | 说明 |
|------|------|------|
| recognize | 10% | 正在识别街巷 |
| profile | 20% | 正在获取街巷画像 |
| scoring | 20% + N×13% | N=已完成维度数，5 维共 85% |
| report | 95% | 正在生成评价报告 |
| done | 100% | 分析完成 |

**前端降级策略：** 进度页先 `fetchTaskProgress()` 恢复快照（应对刷新），再接 SSE 实时流；SSE 不可用时可用 `setInterval` 轮询降级。

### 4. 评分聚合机制

```
三级指标 (75 个)          二级维度 (25 个)         一级维度 (5 个)         综合分
score: 整数 1~5           score: 加权平均          score: 加权平均         加权平均
                          值域 1.0~5.0            值域 1.0~5.0           值域 1.0~5.0
    │                         │                       │                    │
    │  weight 归一化           │  weight 归一化         │  weight 归一化      │
    ▼                         ▼                       ▼                    ▼
  ┌─指标A (w=0.4)         ┌─二级1 (w=0.3)         ┌─空间美学 (w=0.2)    综合分
  ├─指标B (w=0.3)         ├─二级2 (w=0.3)         ├─商业活力 (w=0.2)
  └─指标C (w=0.3)         ├─二级3 (w=0.2)         ├─文化底蕴 (w=0.2)
                          └─...                    ├─街区活力 (w=0.2)
                                                   └─时尚影响 (w=0.2)
```

- 纯函数设计（`scoring_service.py`），不依赖数据库/LLM，便于单元测试
- 权重和不为 1 时按实际和归一化
- 使用原始值（raw_score）参与上层聚合，避免二次舍入误差累积

### 5. Prompt 模板管理

```
前端 resources/prompts         后端 prompt.py / prompt_service.py
    │                              │
    │ GET /prompts                 │ → 列表
    │ PUT /prompts/{id}            │ → archive旧版 → 更新 → version+1
    │ GET /prompts/{id}/history    │ → 历史版本列表
    │ POST /prompts/{id}/rollback/{ver} │ → 归档当前 → 恢复目标版本 → 新version
```

**模板定位键** `(stage, dim_code)`：
- `recognize`：dim_code=NULL，1 条（街巷识别）
- `score`：dim_code=SPACE/BUSINESS/CULTURE/VITALITY/INFLUENCE，5 条（各维度评分）
- `report`：dim_code=NULL，1 条（报告生成）

**运行时渲染**：`prompt_builder.render_template()` 先查 DB 模板，查不到用硬编码默认模板；用 Python `str.format()` 填充占位符变量。

### 6. 指标体系模板版本管理

```
前端 resources/metrics         后端 metric_template.py / metric_template_service.py
    │                              │
    │ GET /metric-templates        │ → 列表（含计数 + 是否被引用）
    │ GET /metric-templates/{id}/tree │ → 嵌套维度树
    │ POST /metric-templates       │ → 新建（空骨架/克隆）
    │ PUT /metric-templates/{id}/tree │ → 保存维度内容
    │ POST /metric-templates/{id}/activate │ → 启用
    │ DELETE /metric-templates/{id} │ → 删除
```

**「复制式」模型：**
- 每个模板拥有完整独立的 5/25/75 维度树
- 切换模板只改 `metric_template.is_active`，不影响历史评价
- 历史评价按 `metric_id` 隔离，维度名始终保留当时模板的值

**「已用则另存」保护：**
- 编辑被历史评价引用过的模板时，强制先克隆为新模板再修改
- 按 `code` 在新旧模板间映射 id，保证改动落到新模板

### 7. 分析中心显示配置

```
前端 resources/analysis        后端 analytics_config.py / display_config_service.py
    │                              │
    │ GET /analytics-config        │ → 全部区块配置
    │ PUT /analytics-config/{key}  │ → 更新 enabled 状态
```

**区块分组：**

| 分组 | block_key 示例 | 说明 |
|------|----------------|------|
| overview | total_score, header_image | 总览区 |
| visual | radar_chart, dimension_break | 可视化区 |
| detail | sub_dimension, metric_score, metric_reason | 明细区 |
| report | ai_summary, similar_streets | 报告区 |

后端 `get_result()` 按 `enabled_blocks` 过滤字段，前端按 `enabled_blocks` 条件渲染。

### 8. 历史记录与结果回溯

```
前端 history/page.tsx          后端 evaluation.py
    │                              │
    │ GET /analyze/history         │ → JOIN street + ai_analysis_task
    │                              │   按时间倒序，summary 截断 120 字
    │                              │
前端 analytics/page.tsx        后端 evaluation.py
    │                              │
    │ GET /analyze/result/{id}     │ → 组装维度分数 + 按显示配置过滤
```

- 历史页按「今天/昨天/更早」分组展示
- 分析中心无 `eid` 时回退读 `localStorage.lastEvaluationId` 展示上次结果
- 新任务分析期间不清除 `lastEvaluationId`，避免浏览历史时发起新点评导致分析中心空窗

### 9. 活跃任务守卫

```
用户进入首页
    │
    ▼
ActiveTaskGuard
    │
    ├─ localStorage.activeTaskId 存在？
    │   ├─ 否 → 放行，渲染首页
    │   └─ 是 → fetchTaskProgress(taskId)
    │       ├─ pending/analyzing → router.replace(/progress) 继续看进度
    │       ├─ completed/failed → 清除记录，放行
    │       └─ 查询失败 → 清除记录（脏数据自愈），放行
    │
    └─ 渲染期间显示极简占位，避免先闪现再跳转
```

- 任务进行中首页被守卫占据，用户无法发起第二个点评
- 分析中心/历史记录/资源中心不受守卫影响

---

## 前端页面与组件

### 页面路由

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | 首页 | 搜索框 + 图片上传 + 推荐标签 + 最近洞察 |
| `/progress?taskId=&q=` | 进度页 | SSE 驱动的时间线进度展示 |
| `/analytics?eid=` | 分析结果 | 雷达图 + 维度拆解 + 指标明细 + AI 洞察 |
| `/history` | 历史记录 | 按时间分组的评价卡片列表 + 搜索过滤 |
| `/resources` | 资源中心 | 管理入口 |
| `/resources/prompts` | Prompt 管理 | 模板编辑 + 版本历史 + 回滚 |
| `/resources/metrics` | 指标体系 | 三级维度树编辑 + 模板克隆/启用/删除 |
| `/resources/analysis` | 分析管理 | 显示区块开关配置 |

### 组件清单

| 组件 | 功能 |
|------|------|
| `SearchBar` | 搜索框 + 图片上传 + 推荐标签，提交后跳进度页 |
| `ActiveTaskGuard` | 首页入口守卫，检测未完成任务并重定向 |
| `ProgressStep` | 时间线步骤项（done/active/pending 三态） |
| `RadarChart` | SVG 五维雷达图 |
| `HeaderCard` | 结果页头部卡片（街道名 + 综合分 + 图片） |
| `DimensionScores` | 一级维度分数条形图 |
| `SubDimensionScores` | 二级维度分数（按一级分组） |
| `MetricScores` | 三级指标分数（按二级分组，可展开理由） |
| `AIInsight` | AI 生成的综合画像文本 |
| `HistoryCard` | 历史记录卡片（缩略信息 + 点击跳转） |
| `HistoryHeader` | 历史页头部 + 搜索框 |
| `RecentInsights` | 首页最近洞察列表 |
| `Sidebar` | 左侧导航栏 |
| `MobileBottomNav` | 移动端底部导航 |

---

## API 接口一览

### 评价分析 (`/api/v1/analyze`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/analyze/text` | 提交文本分析，返回 `{task_id, status}` |
| POST | `/analyze/image` | 上传图片分析（multipart），返回 `{task_id, status}` |
| GET | `/analyze/history` | 历史记录列表（已完成，时间倒序） |
| GET | `/analyze/result/{id}` | 查询评价结果（含维度分数 + 指标明细） |

### 任务进度 (`/api/v1/task`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/task/{id}` | 一次性查询进度 |
| GET | `/task/{id}/progress` | SSE 实时进度流 |

### Prompt 模板 (`/api/v1/prompts`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/prompts` | 模板列表 |
| GET | `/prompts/{id}` | 模板详情 |
| PUT | `/prompts/{id}` | 更新模板（自动归档旧版） |
| GET | `/prompts/{id}/history` | 历史版本列表 |
| POST | `/prompts/{id}/rollback/{ver}` | 回滚到指定版本 |

### 指标体系模板 (`/api/v1/metric-templates`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/metric-templates` | 模板列表（含计数 + 是否被引用） |
| GET | `/metric-templates/{id}/tree` | 嵌套维度树详情 |
| POST | `/metric-templates` | 新建模板（空骨架/克隆） |
| PUT | `/metric-templates/{id}` | 更新模板名称/说明 |
| PUT | `/metric-templates/{id}/tree` | 保存维度树内容 |
| POST | `/metric-templates/{id}/activate` | 启用模板 |
| DELETE | `/metric-templates/{id}` | 删除模板 |

### 分析中心显示配置 (`/api/v1/analytics-config`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/analytics-config` | 全部显示区块配置 |
| PUT | `/analytics-config/{block_key}` | 更新区块启用状态 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

---

## 环境变量与启动

### 后端

```bash
cd backend

# 复制并编辑环境变量
cp .env.example .env

# .env 关键配置：
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=fashion_review
# LLM_API_KEY=your_dashscope_api_key
# LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# LLM_MODEL=qwen3.7-plus

# 安装依赖
pip install -r requirements.txt

# 初始化数据库（执行 schema.sql + schema_ai.sql + seed.sql）
mysql -u root -p fashion_review < app/db/schema.sql
mysql -u root -p fashion_review < app/db/schema_ai.sql
mysql -u root -p fashion_review < app/db/seed.sql

# 启动
python -m app.main
# 或
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 前端

```bash
cd frontend

# 安装依赖
npm install

# .env 配置
# NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1

# 开发模式
npm run dev

# 生产构建
npm run build && npm start
```

### 访问

- 前端：http://localhost:3000
- 后端 API：http://localhost:8000
- 健康检查：http://localhost:8000/health
- API 文档（Swagger UI）：http://localhost:8000/docs
