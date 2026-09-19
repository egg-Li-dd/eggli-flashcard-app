-- ============================================================
-- CloudBase PostgreSQL 修复脚本 Part 1（改 user_id 类型 + 建缺失表 + 索引）
-- 数据库：postgres（系统库）
-- ============================================================

-- 先删除可能存在的旧 RLS 策略（避免修改列时冲突）
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

-- 创建缺失的 8 张表

-- 1. 错题表 wrong_answers
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

-- 2. 用户资料表 user_profiles
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

-- 3. 用户设置表 user_settings
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  settings text,
  updated_at timestamptz DEFAULT NOW()
);

-- 4. 测试题目表 test_questions
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

-- 5. 测试记录表 test_records
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

-- 6. 测试会话表 test_sessions
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

-- 7. 复习历史表 review_history
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

-- 8. 学习计划表 study_plans
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
-- 索引
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
