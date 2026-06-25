-- =========================================================
-- 街巷时尚度评价平台 —— AI / RAG / POI 扩展表
-- 依赖 schema.sql（需先执行，本文件引用 street 表外键）。
-- 职责分层（见 RAG_design.md）：
--   事实层 street_poi      —— POI 明细，画像计算的原料
--   画像层 street_profile  —— 一街一行的聚合统计 + 结构化摘要，喂给 LLM
--   AI 任务 ai_analysis_*  —— 分析任务、识别结果、Prompt 调用日志
-- 注：向量库 knowledge_chunk 属 PGVector（V2），不在本 MySQL 文件内。
-- 引擎/字符集：InnoDB + utf8mb4
-- =========================================================

SET NAMES utf8mb4;

-- =========================================================
-- 一、事实层：POI 明细
-- =========================================================

-- 1.1 街巷 POI（来源高德 / 大众点评合并数据）
CREATE TABLE street_poi (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    street_id      BIGINT        NULL COMMENT '所属街巷，导入后回填',
    external_id    VARCHAR(64)   NULL COMMENT '数据源原始ID，如高德 B0JDNC678D',
    source         VARCHAR(20)   NULL COMMENT '数据来源：amap/dianping/merged',
    name           VARCHAR(300)  NOT NULL COMMENT '店铺名称',
    address        VARCHAR(500)  NULL,
    business_area  VARCHAR(100)  NULL COMMENT '商区（点评），如 南京东路商圈',
    longitude      DECIMAL(10,6) NULL,
    latitude       DECIMAL(10,6) NULL,
    category_l1    VARCHAR(50)   NULL COMMENT '一级分类，如 餐饮服务/购物服务',
    category_l2    VARCHAR(100)  NULL COMMENT '二级分类',
    cuisine        VARCHAR(100)  NULL COMMENT '菜系（点评）',
    rating         DECIMAL(3,1)  NULL COMMENT '商户评分（点评5分制，非时尚度分）',
    review_count   INT           NULL COMMENT '评论数',
    avg_price      DECIMAL(8,2)  NULL COMMENT '人均消费（元）',
    checkin_count  INT           NULL COMMENT '签到数（高德）',
    is_chain       TINYINT(1)    NULL COMMENT '是否连锁：1是 0否',
    has_promotion  TINYINT(1)    NULL COMMENT '是否有优惠',
    business_status VARCHAR(50)  NULL COMMENT '营业状态',
    image_url      VARCHAR(1000) NULL COMMENT '店铺图片',
    merge_source   VARCHAR(50)   NULL COMMENT '合并来源：仅高德/仅点评/双方共有',
    create_time    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_poi_street (street_id),
    KEY idx_poi_cat (category_l1),
    KEY idx_poi_external (external_id),
    CONSTRAINT fk_poi_street FOREIGN KEY (street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='街巷POI明细（事实层）';

-- =========================================================
-- 二、画像层：一街一行聚合统计
-- =========================================================

-- 2.1 街巷画像（对 street_poi 做 SQL 聚合得出，是 LLM 评分的事实输入）
CREATE TABLE street_profile (
    id                 BIGINT        NOT NULL AUTO_INCREMENT,
    street_id          BIGINT        NOT NULL,
    poi_count          INT           NULL COMMENT 'POI 总数',
    restaurant_count   INT           NULL COMMENT '餐饮数量',
    shopping_count     INT           NULL COMMENT '购物数量',
    restaurant_ratio   DECIMAL(5,4)  NULL COMMENT '餐饮占比',
    shopping_ratio     DECIMAL(5,4)  NULL COMMENT '购物（零售）占比',
    chain_count        INT           NULL COMMENT '连锁品牌数量',
    chain_ratio        DECIMAL(5,4)  NULL COMMENT '连锁占比',
    avg_rating         DECIMAL(3,2)  NULL COMMENT '商户平均评分',
    high_rating_ratio  DECIMAL(5,4)  NULL COMMENT '高评分(>=4.0)商户占比',
    avg_price          DECIMAL(8,2)  NULL COMMENT '平均人均消费',
    total_reviews      BIGINT        NULL COMMENT '评论总数',
    total_checkins     BIGINT        NULL COMMENT '签到总数',
    extra_stats        JSON          NULL COMMENT '结构化摘要：poi_summary 分类计数 + poi_highlights 分类品牌',
    update_time        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_street (street_id),
    CONSTRAINT fk_profile_street FOREIGN KEY (street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='街巷画像（聚合层）';

-- =========================================================
-- 三、AI 分析任务
-- =========================================================

-- 3.1 AI 分析任务
CREATE TABLE ai_analysis_task (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    task_no     VARCHAR(64)  NULL COMMENT '任务编号',
    input_type  ENUM('text','image') NOT NULL COMMENT '输入类型',
    text_input  TEXT         NULL COMMENT '文本输入内容',
    image_url   VARCHAR(500) NULL COMMENT '上传图片地址（MinIO）',
    evaluation_id BIGINT     NULL COMMENT '关联的评价任务（street_evaluation）',
    status      ENUM('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
    progress      INT          NOT NULL DEFAULT 0 COMMENT '进度百分比 0~100',
    current_stage VARCHAR(100) NULL COMMENT '当前阶段标识，如 space_score',
    stage_message VARCHAR(500) NULL COMMENT '当前阶段文案，前端展示',
    error_message VARCHAR(500) NULL COMMENT '失败原因',
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ai_task_no (task_no),
    KEY idx_ai_task_eval (evaluation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI分析任务';

-- 3.2 AI 街巷识别结果
CREATE TABLE ai_analysis_result (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    task_id           BIGINT       NOT NULL,
    recognized_street VARCHAR(200) NULL COMMENT '识别出的街巷名',
    recognized_city   VARCHAR(100) NULL COMMENT '识别出的城市',
    confidence        DECIMAL(5,4) NULL COMMENT '识别置信度 0~1',
    matched_street_id BIGINT       NULL COMMENT '匹配到的 street.id',
    raw_response      JSON         NULL COMMENT '模型原始返回',
    create_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ai_result_task (task_id),
    CONSTRAINT fk_ai_result_task FOREIGN KEY (task_id) REFERENCES ai_analysis_task (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI识别结果';

-- 3.3 Prompt 调用日志（成本与可追溯）
CREATE TABLE ai_prompt_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    task_id       BIGINT       NULL,
    stage         VARCHAR(50)  NULL COMMENT '阶段：recognize/score/report',
    prompt_text   LONGTEXT     NULL,
    response_text LONGTEXT     NULL,
    model_name    VARCHAR(100) NULL,
    token_usage   INT          NULL COMMENT 'token 消耗',
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_prompt_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Prompt调用日志';

-- =========================================================
-- 四、AI Prompt 模板（前端可配 + 版本控制）
-- =========================================================
-- 与 ai_prompt_log（运行时拼好的最终 prompt 留痕）不同：
-- 本表存「带占位符的母版」，运行时取出再 .format() 填值。
-- 定位键 (stage, dim_code)：
--   recognize / report —— dim_code 为 NULL，各 1 条
--   score              —— 按一级维度 code（SPACE/BUSINESS/CULTURE/VITALITY/INFLUENCE）各 1 条
-- 占位符用 Python str.format：模板正文若需字面大括号需写 {{ }}。

-- 4.1 当前生效模板
CREATE TABLE ai_prompt_template (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    stage         VARCHAR(50)  NOT NULL COMMENT '阶段：recognize/score/report',
    dim_code      VARCHAR(50)  NULL COMMENT '评分阶段的一级维度code；recognize/report 为 NULL',
    name          VARCHAR(100) NOT NULL COMMENT '模板名称，前端展示',
    system_prompt TEXT         NULL COMMENT '系统提示词',
    user_template TEXT         NOT NULL COMMENT '用户提示词模板，含 {占位符}',
    model         VARCHAR(100) NULL COMMENT '可选，覆盖默认模型',
    temperature   DECIMAL(3,2) NULL COMMENT '可选，覆盖默认温度',
    placeholders  VARCHAR(500) NULL COMMENT '可用占位符说明，提示前端',
    enabled       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
    version       INT          NOT NULL DEFAULT 1 COMMENT '当前版本号',
    remark        VARCHAR(500) NULL COMMENT '备注',
    update_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_stage_dim (stage, dim_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI提示词模板（前端可配）';

-- 4.2 模板历史版本（每次修改前归档旧版，支持回滚/对比）
CREATE TABLE ai_prompt_template_history (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    template_id   BIGINT       NOT NULL COMMENT '指向 ai_prompt_template.id',
    version       INT          NOT NULL COMMENT '被归档的版本号',
    stage         VARCHAR(50)  NOT NULL,
    dim_code      VARCHAR(50)  NULL,
    name          VARCHAR(100) NOT NULL,
    system_prompt TEXT         NULL,
    user_template TEXT         NOT NULL,
    model         VARCHAR(100) NULL,
    temperature   DECIMAL(3,2) NULL,
    change_note   VARCHAR(500) NULL COMMENT '本次变更说明',
    archived_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    PRIMARY KEY (id),
    KEY idx_tpl_hist (template_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI提示词模板历史版本';
