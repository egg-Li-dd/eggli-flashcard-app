-- ============================================================
-- CloudBase PostgreSQL RLS 行级安全策略
-- 执行此文件为所有表启用行级安全，允许用户访问自己的数据
-- ============================================================

-- 1. categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_select ON categories FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY categories_delete ON categories FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 2. topics
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topics_select ON topics;
DROP POLICY IF EXISTS topics_insert ON topics;
DROP POLICY IF EXISTS topics_update ON topics;
DROP POLICY IF EXISTS topics_delete ON topics;
CREATE POLICY topics_select ON topics FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY topics_insert ON topics FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY topics_update ON topics FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY topics_delete ON topics FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 3. chapters
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chapters_select ON chapters;
DROP POLICY IF EXISTS chapters_insert ON chapters;
DROP POLICY IF EXISTS chapters_update ON chapters;
DROP POLICY IF EXISTS chapters_delete ON chapters;
CREATE POLICY chapters_select ON chapters FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY chapters_insert ON chapters FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY chapters_update ON chapters FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY chapters_delete ON chapters FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 4. units
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS units_select ON units;
DROP POLICY IF EXISTS units_insert ON units;
DROP POLICY IF EXISTS units_update ON units;
DROP POLICY IF EXISTS units_delete ON units;
CREATE POLICY units_select ON units FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY units_insert ON units FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY units_update ON units FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY units_delete ON units FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 5. cards
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cards_select ON cards;
DROP POLICY IF EXISTS cards_insert ON cards;
DROP POLICY IF EXISTS cards_update ON cards;
DROP POLICY IF EXISTS cards_delete ON cards;
CREATE POLICY cards_select ON cards FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY cards_insert ON cards FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY cards_update ON cards FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY cards_delete ON cards FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 6. card_status
ALTER TABLE card_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_status_select ON card_status;
DROP POLICY IF EXISTS card_status_insert ON card_status;
DROP POLICY IF EXISTS card_status_update ON card_status;
DROP POLICY IF EXISTS card_status_delete ON card_status;
CREATE POLICY card_status_select ON card_status FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY card_status_insert ON card_status FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY card_status_update ON card_status FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY card_status_delete ON card_status FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 7. bookmarks
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookmarks_select ON bookmarks;
DROP POLICY IF EXISTS bookmarks_insert ON bookmarks;
DROP POLICY IF EXISTS bookmarks_update ON bookmarks;
DROP POLICY IF EXISTS bookmarks_delete ON bookmarks;
CREATE POLICY bookmarks_select ON bookmarks FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY bookmarks_insert ON bookmarks FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY bookmarks_update ON bookmarks FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY bookmarks_delete ON bookmarks FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 8. wrong_answers
ALTER TABLE wrong_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wrong_answers_select ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_insert ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_update ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_delete ON wrong_answers;
CREATE POLICY wrong_answers_select ON wrong_answers FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY wrong_answers_insert ON wrong_answers FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY wrong_answers_update ON wrong_answers FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY wrong_answers_delete ON wrong_answers FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 9. user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
DROP POLICY IF EXISTS user_profiles_insert ON user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
DROP POLICY IF EXISTS user_profiles_delete ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY user_profiles_insert ON user_profiles FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY user_profiles_update ON user_profiles FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY user_profiles_delete ON user_profiles FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 10. user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_select ON user_settings;
DROP POLICY IF EXISTS user_settings_insert ON user_settings;
DROP POLICY IF EXISTS user_settings_update ON user_settings;
DROP POLICY IF EXISTS user_settings_delete ON user_settings;
CREATE POLICY user_settings_select ON user_settings FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY user_settings_insert ON user_settings FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY user_settings_update ON user_settings FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY user_settings_delete ON user_settings FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 11. test_questions
ALTER TABLE test_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_questions_select ON test_questions;
DROP POLICY IF EXISTS test_questions_insert ON test_questions;
DROP POLICY IF EXISTS test_questions_update ON test_questions;
DROP POLICY IF EXISTS test_questions_delete ON test_questions;
CREATE POLICY test_questions_select ON test_questions FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY test_questions_insert ON test_questions FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_questions_update ON test_questions FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_questions_delete ON test_questions FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 12. test_records
ALTER TABLE test_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_records_select ON test_records;
DROP POLICY IF EXISTS test_records_insert ON test_records;
DROP POLICY IF EXISTS test_records_update ON test_records;
DROP POLICY IF EXISTS test_records_delete ON test_records;
CREATE POLICY test_records_select ON test_records FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY test_records_insert ON test_records FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_records_update ON test_records FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_records_delete ON test_records FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 13. test_sessions
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_sessions_select ON test_sessions;
DROP POLICY IF EXISTS test_sessions_insert ON test_sessions;
DROP POLICY IF EXISTS test_sessions_update ON test_sessions;
DROP POLICY IF EXISTS test_sessions_delete ON test_sessions;
CREATE POLICY test_sessions_select ON test_sessions FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY test_sessions_insert ON test_sessions FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_sessions_update ON test_sessions FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY test_sessions_delete ON test_sessions FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 14. review_history
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_history_select ON review_history;
DROP POLICY IF EXISTS review_history_insert ON review_history;
DROP POLICY IF EXISTS review_history_update ON review_history;
DROP POLICY IF EXISTS review_history_delete ON review_history;
CREATE POLICY review_history_select ON review_history FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY review_history_insert ON review_history FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY review_history_update ON review_history FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY review_history_delete ON review_history FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 15. study_plans
ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_plans_select ON study_plans;
DROP POLICY IF EXISTS study_plans_insert ON study_plans;
DROP POLICY IF EXISTS study_plans_update ON study_plans;
DROP POLICY IF EXISTS study_plans_delete ON study_plans;
CREATE POLICY study_plans_select ON study_plans FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY study_plans_insert ON study_plans FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY study_plans_update ON study_plans FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY study_plans_delete ON study_plans FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- 16. knowledge_tree
ALTER TABLE knowledge_tree ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_tree_select ON knowledge_tree;
DROP POLICY IF EXISTS knowledge_tree_insert ON knowledge_tree;
DROP POLICY IF EXISTS knowledge_tree_update ON knowledge_tree;
DROP POLICY IF EXISTS knowledge_tree_delete ON knowledge_tree;
CREATE POLICY knowledge_tree_select ON knowledge_tree FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY knowledge_tree_insert ON knowledge_tree FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY knowledge_tree_update ON knowledge_tree FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY knowledge_tree_delete ON knowledge_tree FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
