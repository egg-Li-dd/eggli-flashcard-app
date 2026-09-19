-- ============================================================
-- CloudBase PostgreSQL 修复脚本（修复 user_id 类型 + 创建缺失表）
-- 数据库：postgres（系统库）
-- 说明：现有表的 user_id 是 uuid 类型，需要改为 text
--       同时创建缺失的 8 张表
-- ============================================================

-- ============================================================
-- 第一部分：修复现有表的 user_id 类型（uuid -> text）
-- ============================================================

-- 先删除可能存在的 RLS 策略（如果有），避免修改列时冲突
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;

DROP POLICY IF EXISTS topics_select ON topics;
DROP POLICY IF EXISTS topics_insert ON topics;
DROP POLICY IF EXISTS topics_update ON topics;
DROP POLICY IF EXISTS topics_delete ON topics;

DROP POLICY IF EXISTS chapters_select ON chapters;
DROP POLICY IF EXISTS chapters_insert ON chapters;
DROP POLICY IF EXISTS chapters_update ON chapters;
DROP POLICY IF EXISTS chapters_delete ON chapters;

DROP POLICY IF EXISTS units_select ON units;
DROP POLICY IF EXISTS units_insert ON units;
DROP POLICY IF EXISTS units_update ON units;
DROP POLICY IF EXISTS units_delete ON units;

DROP POLICY IF EXISTS cards_select ON cards;
DROP POLICY IF EXISTS cards_insert ON cards;
DROP POLICY IF EXISTS cards_update ON cards;
DROP POLICY IF EXISTS cards_delete ON cards;

DROP POLICY IF EXISTS card_status_select ON card_status;
DROP POLICY IF EXISTS card_status_insert ON card_status;
DROP POLICY IF EXISTS card_status_update ON card_status;
DROP POLICY IF EXISTS card_status_delete ON card_status;

DROP POLICY IF EXISTS bookmarks_select ON bookmarks;
DROP POLICY IF EXISTS bookmarks_insert ON bookmarks;
DROP POLICY IF EXISTS bookmarks_update ON bookmarks;
DROP POLICY IF EXISTS bookmarks_delete ON bookmarks;

-- 修改 user_id 列类型从 uuid 改为 text
ALTER TABLE categories ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE topics ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE chapters ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE units ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE cards ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE card_status ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE bookmarks ALTER COLUMN user_id TYPE text USING user_id::text;

-- ============================================================
-- 第二部分：创建缺失的 8 张表
-- ============================================================

-- 8. 错题表 wrong_answers
CREATE TABLE IF NOT EXISTS wrong_answers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  category_id uuid NOT NULL,
  chapter_id uuid,
  unit_id uuid,
  unit_name text,
  category_name text,
  stem text,
  user_id text NOT NULL,
  count integer DEFAULT 1,
  question_type text,
  question_id uuid,
  last_wrong_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 9. 用户资料表 user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  nickname text,
  avatar_url text,
  avatar_type text,
  tags text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 10. 用户设置表 user_settings
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  settings text,
  updated_at timestamptz DEFAULT NOW()
);

-- 11. 测试题目表 test_questions
CREATE TABLE IF NOT EXISTS test_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  unit_id uuid,
  chapter_id uuid,
  card_id uuid,
  type text,
  question text,
  stem text,
  options text,
  answer text,
  explanation text,
  analysis text,
  difficulty integer DEFAULT 2,
  knowledge_point text,
  test_type text,
  target_id uuid,
  card_updated_at timestamptz,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 12. 测试记录表 test_records
CREATE TABLE IF NOT EXISTS test_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid,
  category_id uuid,
  unit_id uuid,
  chapter_id uuid,
  category_name text,
  unit_name text,
  user_answer text,
  is_correct boolean,
  test_type text,
  test_session_id uuid,
  total_score integer,
  correct_count integer,
  total_count integer,
  time_used integer,
  questions text,
  answers text,
  grading_results text,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 13. 测试会话表 test_sessions
CREATE TABLE IF NOT EXISTS test_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  test_type text,
  type_id uuid,
  unit_id uuid,
  category_id uuid,
  chapter_id uuid,
  category_name text,
  unit_name text,
  questions text,
  user_answers text,
  marked_questions text,
  current_index integer DEFAULT 0,
  elapsed integer DEFAULT 0,
  instant_feedback boolean DEFAULT FALSE,
  feedback_map text,
  answers text,
  start_time timestamptz,
  last_saved_at timestamptz,
  is_completed boolean DEFAULT FALSE,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 14. 复习历史表 review_history
CREATE TABLE IF NOT EXISTS review_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  category_id uuid NOT NULL,
  chapter_id uuid,
  user_id text NOT NULL,
  was_mastered boolean DEFAULT FALSE,
  reviewed_at timestamptz,
  mode text DEFAULT 'ebbinghaus',
  created_at timestamptz DEFAULT NOW()
);

-- 15. 学习计划表 study_plans
CREATE TABLE IF NOT EXISTS study_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  chapter_id uuid,
  user_id text NOT NULL,
  daily_review_limit integer DEFAULT 20,
  daily_new_limit integer DEFAULT 10,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- ============================================================
-- 第三部分：索引（为所有 15 张表创建索引）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user_id ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_unit_id ON cards(unit_id);
CREATE INDEX IF NOT EXISTS idx_card_status_user_id ON card_status(user_id);
CREATE INDEX IF NOT EXISTS idx_card_status_card_id ON card_status(card_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_wrong_answers_user_id ON wrong_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_test_questions_user_id ON test_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_test_records_user_id ON test_records(user_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_user_id ON test_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_review_history_user_id ON review_history(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans(user_id);

-- ============================================================
-- 第四部分：启用 RLS（行级安全）
-- ============================================================
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

-- ============================================================
-- 第五部分：RLS 策略（USING (true)，数据隔离由应用层处理）
-- ============================================================

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
