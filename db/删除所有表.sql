-- ============================================================
-- 删除云端所有表（CloudBase PostgreSQL）
-- 按依赖关系倒序排列
-- ============================================================

-- 先禁用外键约束（如果存在）
SET session_replication_role = replica;

-- 删除表（按依赖关系倒序）
DROP TABLE IF EXISTS knowledge_tree CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS card_status CASCADE;
DROP TABLE IF EXISTS bookmarks CASCADE;
DROP TABLE IF EXISTS wrong_answers CASCADE;
DROP TABLE IF EXISTS test_questions CASCADE;
DROP TABLE IF EXISTS test_records CASCADE;
DROP TABLE IF EXISTS test_sessions CASCADE;
DROP TABLE IF EXISTS review_history CASCADE;
DROP TABLE IF EXISTS study_plans CASCADE;
DROP TABLE IF EXISTS drafts CASCADE;
DROP TABLE IF EXISTS link_generation_runs CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS chapters CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- 恢复外键约束
SET session_replication_role = DEFAULT;

-- 验证：查看剩余表
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%';
