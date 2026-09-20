-- ============================================================
-- CloudBase PostgreSQL 建表脚本（完整版）
-- 数据库：postgres（系统库）
-- ============================================================

-- 1. 分类表 categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  purpose text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL
);

-- 2. 主题表 topics
CREATE TABLE IF NOT EXISTS topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL
);

-- 3. 章节表 chapters
CREATE TABLE IF NOT EXISTS chapters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  topic_id uuid,
  name text NOT NULL,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL
);

-- 4. 单元表 units
CREATE TABLE IF NOT EXISTS units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL,
  chapter_id uuid,
  name text NOT NULL,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL
);

-- 5. 卡片表 cards
CREATE TABLE IF NOT EXISTS cards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id uuid,
  category_id uuid NOT NULL,
  chapter_id uuid,
  front text NOT NULL,
  back text,
  knowledge_point text,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL,
  type text DEFAULT 'short',
  options text,
  answer_blank text
);

-- 6. 卡片状态表 card_status
CREATE TABLE IF NOT EXISTS card_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  category_id uuid NOT NULL,
  chapter_id uuid,
  user_id uuid NOT NULL,
  status text DEFAULT 'new',
  updated_at timestamptz DEFAULT NOW(),
  review_count integer DEFAULT 0,
  ease_factor real DEFAULT 2.5,
  interval_days integer DEFAULT 0,
  repetitions integer DEFAULT 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  difficulty text,
  wrong_count integer DEFAULT 0,
  wrong_streak integer DEFAULT 0,
  mode text DEFAULT 'ebbinghaus',
  user_override boolean DEFAULT FALSE
);

-- 7. 书签表 bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  user_id uuid NOT NULL
);

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
  user_id uuid NOT NULL,
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
  user_id uuid NOT NULL UNIQUE,
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
  user_id uuid NOT NULL UNIQUE,
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
  user_id uuid NOT NULL,
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
  user_id uuid NOT NULL,
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
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 14. 复习历史表 review_history
CREATE TABLE IF NOT EXISTS review_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL,
  category_id uuid NOT NULL,
  chapter_id uuid,
  user_id uuid NOT NULL,
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
  user_id uuid NOT NULL,
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
