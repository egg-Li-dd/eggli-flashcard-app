-- ============================================================
-- CloudBase PostgreSQL 修复脚本 Part 2（启用 RLS + 策略）
-- 注意：必须先执行 part1 后再执行本文件
-- ============================================================

-- 启用 RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wrong_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;

-- RLS 策略

-- categories
CREATE POLICY categories_select ON categories FOR SELECT USING (true);
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY categories_update ON categories FOR UPDATE USING (true);
CREATE POLICY categories_delete ON categories FOR DELETE USING (true);

-- topics
CREATE POLICY topics_select ON topics FOR SELECT USING (true);
CREATE POLICY topics_insert ON topics FOR INSERT WITH CHECK (true);
CREATE POLICY topics_update ON topics FOR UPDATE USING (true);
CREATE POLICY topics_delete ON topics FOR DELETE USING (true);

-- chapters
CREATE POLICY chapters_select ON chapters FOR SELECT USING (true);
CREATE POLICY chapters_insert ON chapters FOR INSERT WITH CHECK (true);
CREATE POLICY chapters_update ON chapters FOR UPDATE USING (true);
CREATE POLICY chapters_delete ON chapters FOR DELETE USING (true);

-- units
CREATE POLICY units_select ON units FOR SELECT USING (true);
CREATE POLICY units_insert ON units FOR INSERT WITH CHECK (true);
CREATE POLICY units_update ON units FOR UPDATE USING (true);
CREATE POLICY units_delete ON units FOR DELETE USING (true);

-- cards
CREATE POLICY cards_select ON cards FOR SELECT USING (true);
CREATE POLICY cards_insert ON cards FOR INSERT WITH CHECK (true);
CREATE POLICY cards_update ON cards FOR UPDATE USING (true);
CREATE POLICY cards_delete ON cards FOR DELETE USING (true);

-- card_status
CREATE POLICY card_status_select ON card_status FOR SELECT USING (true);
CREATE POLICY card_status_insert ON card_status FOR INSERT WITH CHECK (true);
CREATE POLICY card_status_update ON card_status FOR UPDATE USING (true);
CREATE POLICY card_status_delete ON card_status FOR DELETE USING (true);

-- bookmarks
CREATE POLICY bookmarks_select ON bookmarks FOR SELECT USING (true);
CREATE POLICY bookmarks_insert ON bookmarks FOR INSERT WITH CHECK (true);
CREATE POLICY bookmarks_update ON bookmarks FOR UPDATE USING (true);
CREATE POLICY bookmarks_delete ON bookmarks FOR DELETE USING (true);

-- wrong_answers
CREATE POLICY wrong_answers_select ON wrong_answers FOR SELECT USING (true);
CREATE POLICY wrong_answers_insert ON wrong_answers FOR INSERT WITH CHECK (true);
CREATE POLICY wrong_answers_update ON wrong_answers FOR UPDATE USING (true);
CREATE POLICY wrong_answers_delete ON wrong_answers FOR DELETE USING (true);

-- user_profiles
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT USING (true);
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE USING (true);
CREATE POLICY user_profiles_delete ON user_profiles FOR DELETE USING (true);

-- user_settings
CREATE POLICY user_settings_select ON user_settings FOR SELECT USING (true);
CREATE POLICY user_settings_insert ON user_settings FOR INSERT WITH CHECK (true);
CREATE POLICY user_settings_update ON user_settings FOR UPDATE USING (true);
CREATE POLICY user_settings_delete ON user_settings FOR DELETE USING (true);

-- test_questions
CREATE POLICY test_questions_select ON test_questions FOR SELECT USING (true);
CREATE POLICY test_questions_insert ON test_questions FOR INSERT WITH CHECK (true);
CREATE POLICY test_questions_update ON test_questions FOR UPDATE USING (true);
CREATE POLICY test_questions_delete ON test_questions FOR DELETE USING (true);

-- test_records
CREATE POLICY test_records_select ON test_records FOR SELECT USING (true);
CREATE POLICY test_records_insert ON test_records FOR INSERT WITH CHECK (true);
CREATE POLICY test_records_update ON test_records FOR UPDATE USING (true);
CREATE POLICY test_records_delete ON test_records FOR DELETE USING (true);

-- test_sessions
CREATE POLICY test_sessions_select ON test_sessions FOR SELECT USING (true);
CREATE POLICY test_sessions_insert ON test_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY test_sessions_update ON test_sessions FOR UPDATE USING (true);
CREATE POLICY test_sessions_delete ON test_sessions FOR DELETE USING (true);

-- review_history
CREATE POLICY review_history_select ON review_history FOR SELECT USING (true);
CREATE POLICY review_history_insert ON review_history FOR INSERT WITH CHECK (true);
CREATE POLICY review_history_update ON review_history FOR UPDATE USING (true);
CREATE POLICY review_history_delete ON review_history FOR DELETE USING (true);

-- study_plans
CREATE POLICY study_plans_select ON study_plans FOR SELECT USING (true);
CREATE POLICY study_plans_insert ON study_plans FOR INSERT WITH CHECK (true);
CREATE POLICY study_plans_update ON study_plans FOR UPDATE USING (true);
CREATE POLICY study_plans_delete ON study_plans FOR DELETE USING (true);
