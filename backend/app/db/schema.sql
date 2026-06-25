-- =========================================================
-- 街巷时尚度评价平台 —— 数据库结构
-- 分制说明：三级指标打分为整数 1~5；二级/一级/综合分由下层加权平均得出，
--           值域 1.0~5.0，精确到一位小数（DECIMAL(2,1)）。
-- 引擎/字符集：InnoDB + utf8mb4
-- =========================================================

SET NAMES utf8mb4;

-- =========================================================
-- 一、评分模板（静态配置：5 一级 / 25 二级 / 75 三级）
-- 模板化：每个模板拥有自己完整一套维度树（复制式）。
-- 切换模板 = 改 metric_template.is_active；历史评价按 metric_id 隔离，不受切换影响。
-- =========================================================

-- 1.0 指标体系模板（版本）
CREATE TABLE metric_template (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL COMMENT '模板名，如 模板一',
    description VARCHAR(500) NULL COMMENT '模板说明',
    is_active   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否为当前启用模板（全表恒一行为 1）',
    sort_no     INT          NOT NULL DEFAULT 0,
    update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='指标体系模板（版本）';

-- 1.1 一级维度
CREATE TABLE fashion_dimension (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    template_id BIGINT       NOT NULL DEFAULT 1 COMMENT '所属模板',
    code        VARCHAR(50)  NOT NULL COMMENT '稳定编码，如 SPACE',
    name        VARCHAR(100) NOT NULL COMMENT '维度名称，如 空间美学',
    weight      DECIMAL(6,4) NOT NULL DEFAULT 0.2000 COMMENT '在 5 个一级维度内的权重，和为 1',
    sort_no     INT          NOT NULL DEFAULT 0,
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dim_code (template_id, code),
    CONSTRAINT fk_dim_template FOREIGN KEY (template_id) REFERENCES metric_template (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一级维度';

-- 1.2 二级维度
CREATE TABLE fashion_sub_dimension (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    template_id  BIGINT       NOT NULL DEFAULT 1 COMMENT '所属模板（与所属一级一致，冗余便于过滤）',
    dimension_id BIGINT       NOT NULL COMMENT '所属一级维度',
    code         VARCHAR(50)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    weight       DECIMAL(6,4) NOT NULL DEFAULT 0.2000 COMMENT '在所属一级的 5 个二级内的权重，和为 1',
    sort_no      INT          NOT NULL DEFAULT 0,
    create_time  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sub_code (template_id, code),
    KEY idx_sub_dim (dimension_id),
    CONSTRAINT fk_sub_dim FOREIGN KEY (dimension_id) REFERENCES fashion_dimension (id),
    CONSTRAINT fk_sub_template FOREIGN KEY (template_id) REFERENCES metric_template (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='二级维度';

-- 1.3 三级指标
CREATE TABLE fashion_metric (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    template_id      BIGINT       NOT NULL DEFAULT 1 COMMENT '所属模板（冗余便于过滤）',
    sub_dimension_id BIGINT       NOT NULL COMMENT '所属二级维度',
    code             VARCHAR(100) NOT NULL,
    name             VARCHAR(200) NOT NULL,
    metric_desc      TEXT         NULL COMMENT '指标说明/观察要点（来自表格备注列）',
    weight           DECIMAL(6,4) NOT NULL DEFAULT 0.3333 COMMENT '在所属二级的 3 个三级内的权重，和为 1',
    score_mode       ENUM('rule','llm','hybrid') NOT NULL DEFAULT 'llm' COMMENT '评分方式：rule=POI数据可直接计算 llm=大模型主观判断 hybrid=两者融合',
    data_source      VARCHAR(100) NULL COMMENT '数据来源，如 IMAGE/POI/XIAOHONGSHU',
    ai_extract_rule  TEXT         NULL COMMENT 'AI 评分规则/提示词；rule 模式下存放计算规则（阈值映射等）',
    sort_no          INT          NOT NULL DEFAULT 0,
    create_time      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_metric_code (template_id, code),
    KEY idx_metric_sub (sub_dimension_id),
    CONSTRAINT fk_metric_sub FOREIGN KEY (sub_dimension_id) REFERENCES fashion_sub_dimension (id),
    CONSTRAINT fk_metric_template FOREIGN KEY (template_id) REFERENCES metric_template (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='三级指标（满分恒为 5）';

-- =========================================================
-- 二、街巷与评价业务
-- =========================================================

-- 2.1 街巷档案
CREATE TABLE street (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    street_name VARCHAR(200)  NOT NULL,
    city        VARCHAR(100)  NULL,
    district    VARCHAR(100)  NULL,
    longitude   DECIMAL(10,6) NULL,
    latitude    DECIMAL(10,6) NULL,
    description TEXT          NULL,
    create_time DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_street_city_name (city, street_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='街巷档案';

-- 2.2 一次评价任务（表头）
CREATE TABLE street_evaluation (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    street_id   BIGINT       NOT NULL,
    task_no     VARCHAR(64)  NULL COMMENT '任务编号，如 TASK202606001',
    total_score DECIMAL(2,1) NULL COMMENT '综合时尚度分 1.0~5.0',
    ai_summary  TEXT         NULL COMMENT '街区画像/AI 报告',
    source      ENUM('ai','human','mixed') NOT NULL DEFAULT 'ai' COMMENT '评分来源',
    status      ENUM('pending','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_task_no (task_no),
    KEY idx_eval_street (street_id),
    CONSTRAINT fk_eval_street FOREIGN KEY (street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='街巷评价任务（表头）';

-- 2.3 指标评分明细（核心业务表，每个三级指标一行，整数 1~5）
CREATE TABLE street_metric_score (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    evaluation_id BIGINT      NOT NULL,
    metric_id     BIGINT      NOT NULL COMMENT '指向三级指标',
    score         TINYINT     NOT NULL COMMENT '原始打分，整数 1~5',
    score_reason  TEXT        NULL COMMENT 'AI 评价说明',
    source_type   VARCHAR(50) NULL COMMENT '本条得分主要依据来源',
    create_time   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_eval_metric (evaluation_id, metric_id),
    KEY idx_score_metric (metric_id),
    CONSTRAINT fk_score_eval   FOREIGN KEY (evaluation_id) REFERENCES street_evaluation (id) ON DELETE CASCADE,
    CONSTRAINT fk_score_metric FOREIGN KEY (metric_id) REFERENCES fashion_metric (id),
    CONSTRAINT chk_score_range CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='指标评分明细';

-- 2.4 评分依据/证据（一条明细可挂多条证据）
CREATE TABLE street_metric_evidence (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    metric_score_id BIGINT       NOT NULL,
    evidence_type   VARCHAR(50)  NULL COMMENT 'IMAGE/TEXT/POI/XIAOHONGSHU/DOUYIN/MAP/NEWS/MANUAL',
    content         TEXT         NULL,
    source_url      VARCHAR(500) NULL,
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_evi_score (metric_score_id),
    CONSTRAINT fk_evi_score FOREIGN KEY (metric_score_id) REFERENCES street_metric_score (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评分依据';

-- 2.5 维度聚合分缓存（雷达图 / 分项评分表直接读，值域 1.0~5.0）
CREATE TABLE street_dimension_score (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    evaluation_id BIGINT       NOT NULL,
    dim_level     TINYINT      NOT NULL COMMENT '聚合层级：1=一级 2=二级',
    ref_id        BIGINT       NOT NULL COMMENT 'dim_level=1 指向 fashion_dimension.id；=2 指向 fashion_sub_dimension.id',
    score         DECIMAL(2,1) NOT NULL COMMENT '加权平均分 1.0~5.0',
    PRIMARY KEY (id),
    UNIQUE KEY uk_eval_dim (evaluation_id, dim_level, ref_id),
    CONSTRAINT fk_ds_eval FOREIGN KEY (evaluation_id) REFERENCES street_evaluation (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='维度聚合分缓存';

-- =========================================================
-- 三、展示 / 推荐扩展
-- =========================================================

CREATE TABLE street_similarity (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    street_id         BIGINT       NOT NULL,
    similar_street_id BIGINT       NOT NULL,
    similarity_score  DECIMAL(5,2) NULL,
    similarity_reason TEXT         NULL,
    PRIMARY KEY (id),
    KEY idx_sim_street (street_id),
    CONSTRAINT fk_sim_street   FOREIGN KEY (street_id) REFERENCES street (id),
    CONSTRAINT fk_sim_similar  FOREIGN KEY (similar_street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='相似街巷推荐';

CREATE TABLE street_keyword (
    id        BIGINT       NOT NULL AUTO_INCREMENT,
    street_id BIGINT       NOT NULL,
    keyword   VARCHAR(100) NOT NULL,
    weight    DECIMAL(5,2) NULL COMMENT '热度/词频权重',
    PRIMARY KEY (id),
    KEY idx_kw_street (street_id),
    CONSTRAINT fk_kw_street FOREIGN KEY (street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='街巷热词';

CREATE TABLE street_trend (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    street_id      BIGINT       NOT NULL,
    statistic_date DATE         NOT NULL,
    score          DECIMAL(2,1) NULL COMMENT '当日时尚度分 1.0~5.0',
    popularity     DECIMAL(5,2) NULL,
    flow_count     BIGINT       NULL,
    PRIMARY KEY (id),
    KEY idx_trend_street_date (street_id, statistic_date),
    CONSTRAINT fk_trend_street FOREIGN KEY (street_id) REFERENCES street (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='历史趋势';

-- =========================================================
-- 四、平台配置：分析中心显示配置（资源中心「分析管理」前端可配）
-- =========================================================
-- 全局统一配置：一行一个内容区块，控制分析结果页（/analytics）是否展示该块。
-- block_key 为稳定标识，后端按它过滤结果字段；前端再对区块做条件渲染。
-- block_group 用于管理页分组手风琴：overview/visual/detail/report。

CREATE TABLE analytics_display_config (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    block_key   VARCHAR(50)  NOT NULL COMMENT '区块稳定标识，前后端据此过滤/渲染',
    block_group VARCHAR(50)  NOT NULL COMMENT '分组：overview/visual/detail/report',
    name        VARCHAR(100) NOT NULL COMMENT '区块名称，管理页展示',
    description VARCHAR(300) NULL COMMENT '区块说明',
    enabled     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否在分析中心展示',
    sort_no     INT          NOT NULL DEFAULT 0 COMMENT '组内排序',
    update_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_block_key (block_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分析中心显示配置（前端可配）';
