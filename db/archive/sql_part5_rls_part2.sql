-- ============================================================
-- CloudBase PostgreSQL RLS 行级安全策略（第 4/4 部分 下）
-- 项目：AI 背诵卡片
-- 重要：CloudBase 不支持 auth.uid()，使用 true + 应用层 user_id 过滤
-- ============================================================

-- 9. user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
DROP POLICY IF EXISTS user_profiles_insert ON user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
DROP POLICY IF EXISTS user_profiles_delete ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY user_profiles_delete ON user_profiles FOR DELETE TO authenticated USING (true);

-- 10. user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_select ON user_settings;
DROP POLICY IF EXISTS user_settings_insert ON user_settings;
DROP POLICY IF EXISTS user_settings_update ON user_settings;
DROP POLICY IF EXISTS user_settings_delete ON user_settings;
CREATE POLICY user_settings_select ON user_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY user_settings_insert ON user_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY user_settings_update ON user_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY user_settings_delete ON user_settings FOR DELETE TO authenticated USING (true);

-- 11. test_questions
ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_questions_select ON test_questions;
DROP POLICY IF EXISTS test_questions_insert ON test_questions;
DROP POLICY IF EXISTS test_questions_update ON test_questions;
DROP POLICY IF EXISTS test_questions_delete ON test_questions;
CREATE POLICY test_questions_select ON test_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY test_questions_insert ON test_questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY test_questions_update ON test_questions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY test_questions_delete ON test_questions FOR DELETE TO authenticated USING (true);

-- 12. test_records
ALTER TABLE test_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_records_select ON test_records;
DROP POLICY IF EXISTS test_records_insert ON test_records;
DROP POLICY IF EXISTS test_records_update ON test_records;
DROP POLICY IF EXISTS test_records_delete ON test_records;
CREATE POLICY test_records_select ON test_records FOR SELECT TO authenticated USING (true);
CREATE POLICY test_records_insert ON test_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY test_records_update ON test_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY test_records_delete ON test_records FOR DELETE TO authenticated USING (true);

-- 13. test_sessions
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_sessions_select ON test_sessions;
DROP POLICY IF EXISTS test_sessions_insert ON test_sessions;
DROP POLICY IF EXISTS test_sessions_update ON test_sessions;
DROP POLICY IF EXISTS test_sessions_delete ON test_sessions;
CREATE POLICY test_sessions_select ON test_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY test_sessions_insert ON test_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY test_sessions_update ON test_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY test_sessions_delete ON test_sessions FOR DELETE TO authenticated USING (true);

-- 14. review_history
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_history_select ON review_history;
DROP POLICY IF EXISTS review_history_insert ON review_history;
DROP POLICY IF EXISTS review_history_update ON review_history;
DROP POLICY IF EXISTS review_history_delete ON review_history;
CREATE POLICY review_history_select ON review_history FOR SELECT TO authenticated USING (true);
CREATE POLICY review_history_insert ON review_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY review_history_update ON review_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY review_history_delete ON review_history FOR DELETE TO authenticated USING (true);

-- 15. study_plans
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_plans_select ON study_plans;
DROP POLICY IF EXISTS study_plans_insert ON study_plans;
DROP POLICY IF EXISTS study_plans_update ON study_plans;
DROP POLICY IF EXISTS study_plans_delete ON study_plans;
CREATE POLICY study_plans_select ON study_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY study_plans_insert ON study_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY study_plans_update ON study_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY study_plans_delete ON study_plans FOR DELETE TO authenticated USING (true);
