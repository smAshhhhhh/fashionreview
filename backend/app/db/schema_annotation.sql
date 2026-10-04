-- =========================================================
-- 街巷时尚度评价平台 —— 人工标注库（图片属性匹配）扩展表
-- 依赖 schema.sql 与 schema_ai.sql（需先执行，本文件引用 street_evaluation
-- 与 fashion_metric 外键）。
--
-- 职责分层：
--   标注库    annotation_image / annotation_attribute
--             —— 人工标注的街景图与其图片属性，导入一次、多次点评共用
--   点评快照  evaluation_image_match / evaluation_image_attribute
--             —— 某一次点评的匹配结果与被赋予的属性，一次点评一份
--
-- 设计要点见 docs 与方案：
--   1. 属性摊平存（一条一行），不塞宽表、不塞 JSON —— 需要按指标名反查、
--      按行数校验导入完整性（本源数据应为 169 行）。
--   2. embedding 存已归一化单位向量，查询时余弦 = 点积。
--   3. evaluation_image_attribute 冗余存属性文字，历史点评不随标注库变动。
--      与 repository.fetch_dimension_name_map() 的取舍一致。
-- 引擎/字符集：InnoDB + utf8mb4
-- =========================================================

SET NAMES utf8mb4;

-- =========================================================
-- 一、标注库：人工标注的街景图与图片属性
-- =========================================================

-- 1.1 标注图
-- file_name 作唯一键而非表格里的「图片编号」列：该列仅前 2 行有值、后 28 行为空，
-- 无法作标识；文件名是 30 张图唯一可靠的区分依据，重复导入时据它 upsert。
CREATE TABLE annotation_image (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    file_name       VARCHAR(300) NOT NULL COMMENT '原始文件名，唯一标识一张标注图',
    image_url       VARCHAR(500) NOT NULL COMMENT '对外相对路径 /static/annotations/<uuid>.ext',
    row_no          INT          NULL COMMENT '源表格行号（2~31），便于回查源数据',
    embedding       JSON         NULL COMMENT '已归一化的单位向量；查询时余弦=点积',
    embedding_model VARCHAR(100) NULL COMMENT '产出该向量的模型；换模型后据此识别脏数据',
    embedding_dim   INT          NULL COMMENT '向量维度；与 model 一同校验是否可比',
    embedded_time   DATETIME     NULL COMMENT '向量生成时间',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否参与匹配：0 下架但保留数据',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_annotation_file (file_name),
    KEY idx_annotation_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人工标注图（标注库）';

-- 1.2 标注图的图片属性（一条一行）
-- 源表格为「图片属性1..7」宽表，每行实际 4~7 条、空列在 sheet XML 中无节点。
-- 摊平后「取某图全部属性」为一句索引查询，且导入完整性可用 COUNT(*) 判定。
CREATE TABLE annotation_attribute (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    annotation_id BIGINT       NOT NULL COMMENT '所属标注图',
    attr_index    INT          NOT NULL COMMENT '源列序号 1~7（对应 图片属性1..7）',
    raw_text      VARCHAR(200) NOT NULL COMMENT '属性原文，如 色彩控制力：繁简相宜',
    metric_name   VARCHAR(200) NULL COMMENT '拆解出的指标名，应命中 SPACE 维度三级指标',
    grade_word    VARCHAR(100) NULL COMMENT '拆解并归一后的等级成语，如 中规中矩',
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_attr_annotation (annotation_id),
    KEY idx_attr_metric_name (metric_name),
    CONSTRAINT fk_attr_annotation FOREIGN KEY (annotation_id)
        REFERENCES annotation_image (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标注图的图片属性（摊平明细）';

-- =========================================================
-- 二、点评快照：某次点评的匹配结果与被赋予的属性
-- =========================================================

-- 2.1 匹配结果表头（一次点评一行）
-- 无 matched 列：本版不设阈值，无条件取 Top-1，标注库非空即有结果。
-- candidates 存 Top-5 仅供人工排查「为什么匹错」，不查询不聚合，故用 JSON。
CREATE TABLE evaluation_image_match (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    evaluation_id   BIGINT        NOT NULL COMMENT '所属评价',
    annotation_id   BIGINT        NULL COMMENT '命中的标注图（Top-1）',
    similarity      DECIMAL(6,5)  NULL COMMENT 'Top-1 余弦相似度',
    candidates      JSON          NULL COMMENT 'Top-N 候选留痕 [{annotation_id,file_name,similarity}]',
    embedding_model VARCHAR(100)  NULL COMMENT '本次比对所用向量模型',
    attr_count      INT           NOT NULL DEFAULT 0 COMMENT '本次赋予的属性条数',
    create_time     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_match_eval (evaluation_id),
    KEY idx_match_annotation (annotation_id),
    CONSTRAINT fk_match_eval FOREIGN KEY (evaluation_id)
        REFERENCES street_evaluation (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点评的标注图匹配结果';

-- 2.2 本次点评被赋予的图片属性
-- 冗余存 metric_name / grade_word / raw_text 而不 join annotation_attribute：
-- 评价结果是已发生事实的快照，标注库后续修改或下架不得改变历史点评的显示内容
-- （同 repository.fetch_dimension_name_map() 的注释所述取舍）。
CREATE TABLE evaluation_image_attribute (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    evaluation_id BIGINT       NOT NULL COMMENT '所属评价',
    metric_id     BIGINT       NULL COMMENT '对齐的三级指标；模板改名等解析不到时为 NULL',
    metric_name   VARCHAR(200) NULL COMMENT '属性指标名（冗余快照）',
    grade_word    VARCHAR(100) NULL COMMENT '等级成语（冗余快照）',
    raw_text      VARCHAR(200) NOT NULL COMMENT '属性原文（冗余快照）',
    create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_eval_attr_eval (evaluation_id),
    KEY idx_eval_attr_metric (metric_id),
    CONSTRAINT fk_eval_attr_eval FOREIGN KEY (evaluation_id)
        REFERENCES street_evaluation (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点评被赋予的图片属性（快照）';
