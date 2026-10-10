-- =========================================================
-- 迁移脚本：照片点评「识别地点后暂停确认」
--
-- 用于**已有数据**的库 —— init_db.py 只支持 --force 全量重建（会清空数据），
-- 故已上线的库需手工执行本文件：
--
--   mysql -u root -p fashion_review < app/db/migrate_confirm_location.sql
--
-- 幂等性：MODIFY 本身幂等（重复执行结果相同），配置行用 INSERT IGNORE
-- （block_key 有唯一键），重复执行不报错、不产生重复数据。
--
-- 与建库脚本的对应关系（三者须保持一致，否则新建库与迁移库结构会脱节）：
--   schema_ai.sql  ai_analysis_task.status 的 ENUM 取值
--   seed.sql       analytics_display_config 的 image_confirm_location 行
--   本文件         对已有库施加上述两项变更
-- =========================================================

SET NAMES utf8mb4;

-- =========================================================
-- 一、任务状态新增 awaiting_confirm
-- =========================================================
-- ENUM 扩值是向后兼容的：已有行的取值不在新增项内，不受影响。
-- awaiting_confirm 为非终态（任务随后由用户确认继续），但 SSE 会在此收尾断开，
-- 避免挂着连接等用户几分钟。
ALTER TABLE ai_analysis_task
  MODIFY status ENUM('pending','analyzing','awaiting_confirm','completed','failed','cancelled')
  NOT NULL DEFAULT 'pending';

-- =========================================================
-- 二、功能开关（复用 analytics_display_config）
-- =========================================================
-- flow 分组不是结果页展示区块，而是链路流程开关。关闭后 submit_image_analysis
-- 在入口分叉回原 _run_pipeline，照片点评完全恢复为「识别完直接跑完」。
INSERT IGNORE INTO analytics_display_config
    (block_key, block_group, name, description, enabled, sort_no) VALUES
  ('image_confirm_location', 'flow', '照片地点确认',
   '照片点评识别出地点后暂停，由用户确认或修改地点后再继续评分', 1, 1);
