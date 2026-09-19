-- ============================================================
-- CloudBase PostgreSQL 建表脚本
-- 项目：AI 背诵卡片
-- 环境 ID：egg-flashcards-d7gbngnx49b955983
-- 说明：从 Supabase 迁移，id 使用 text（前端 UUID），时间戳用 timestamptz
-- ============================================================

-- 1. 分类表
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

-- 2. 主题表
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

-- 3. 章节表
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  topic_id TEXT,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

-- 4. 单元表
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

-- 5. 卡片表
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  front TEXT NOT NULL,
  back TEXT,
  knowledge_point TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL,
  type TEXT DEFAULT 'short',
  options TEXT,
  answer_blank TEXT
);

-- 6. 知识树单表（替代 categories、topics、chapters、units、cards、drafts）
CREATE TABLE IF NOT EXISTS knowledge_tree (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  level TEXT NOT NULL,
  name TEXT,
  category_id TEXT,
  topic_id TEXT,
  chapter_id TEXT,
  unit_id TEXT,
  knowledge_point_id TEXT,
  
  purpose TEXT,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '📚',
  
  is_processed BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  
  content TEXT,
  
  front TEXT,
  back TEXT,
  hint TEXT,
  explanation TEXT,
  type TEXT DEFAULT 'short',
  options TEXT,
  answer_blank TEXT,
  status TEXT DEFAULT 'active',
  retry_count INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  
  error_message TEXT,
  generated_at TIMESTAMPTZ,
  template_type TEXT,
  
  "order" INTEGER DEFAULT 0,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 卡片状态表
CREATE TABLE IF NOT EXISTS card_status (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  review_count INTEGER DEFAULT 0,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  difficulty TEXT,
  wrong_count INTEGER DEFAULT 0,
  wrong_streak INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'ebbinghaus',
  user_override BOOLEAN DEFAULT FALSE
);

-- 7. 书签表
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL
);

-- 8. 错题表
CREATE TABLE IF NOT EXISTS wrong_answers (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  unit_id TEXT,
  unit_name TEXT,
  category_name TEXT,
  stem TEXT,
  user_id TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  question_type TEXT,
  question_id TEXT,
  last_wrong_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 用户资料表
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  nickname TEXT,
  avatar_url TEXT,
  avatar_type TEXT,
  tags TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  settings TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. 测试题目表
CREATE TABLE IF NOT EXISTS test_questions (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  unit_id TEXT,
  chapter_id TEXT,
  card_id TEXT,
  type TEXT,
  question TEXT,
  stem TEXT,
  options TEXT,
  answer TEXT,
  explanation TEXT,
  analysis TEXT,
  difficulty INTEGER DEFAULT 2,
  knowledge_point TEXT,
  test_type TEXT,
  target_id TEXT,
  card_updated_at TIMESTAMPTZ,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 测试记录表
CREATE TABLE IF NOT EXISTS test_records (
  id TEXT PRIMARY KEY,
  question_id TEXT,
  category_id TEXT,
  unit_id TEXT,
  chapter_id TEXT,
  category_name TEXT,
  unit_name TEXT,
  user_answer TEXT,
  is_correct BOOLEAN,
  test_type TEXT,
  test_session_id TEXT,
  total_score INTEGER,
  correct_count INTEGER,
  total_count INTEGER,
  time_used INTEGER,
  questions TEXT,
  answers TEXT,
  grading_results TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. 测试会话表
CREATE TABLE IF NOT EXISTS test_sessions (
  id TEXT PRIMARY KEY,
  test_type TEXT,
  type_id TEXT,
  unit_id TEXT,
  category_id TEXT,
  chapter_id TEXT,
  category_name TEXT,
  unit_name TEXT,
  questions TEXT,
  user_answers TEXT,
  marked_questions TEXT,
  current_index INTEGER DEFAULT 0,
  elapsed INTEGER DEFAULT 0,
  instant_feedback BOOLEAN DEFAULT FALSE,
  feedback_map TEXT,
  answers TEXT,
  start_time TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT FALSE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. 复习历史表
CREATE TABLE IF NOT EXISTS review_history (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  user_id TEXT NOT NULL,
  was_mastered BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  mode TEXT DEFAULT 'ebbinghaus',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. 学习计划表
CREATE TABLE IF NOT EXISTS study_plans (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  chapter_id TEXT,
  user_id TEXT NOT NULL,
  daily_review_limit INTEGER DEFAULT 20,
  daily_new_limit INTEGER DEFAULT 10,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 索引（提升查询性能）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user_id ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_unit_id ON cards(unit_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_user_id ON knowledge_tree(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_parent_id ON knowledge_tree(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_level ON knowledge_tree(level);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_category_id ON knowledge_tree(category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_chapter_id ON knowledge_tree(chapter_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tree_unit_id ON knowledge_tree(unit_id);
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
  -- RLS 行级安全策略（CloudBase PostgreSQL 必需）
  -- 允许 authenticated 用户访问自己的数据（user_id = auth.uid()）
  -- 注意：使用 DROP POLICY IF EXISTS 确保可重复执行
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

  -- 6. knowledge_tree
  ALTER TABLE knowledge_tree ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS knowledge_tree_select ON knowledge_tree;
  DROP POLICY IF EXISTS knowledge_tree_insert ON knowledge_tree;
  DROP POLICY IF EXISTS knowledge_tree_update ON knowledge_tree;
  DROP POLICY IF EXISTS knowledge_tree_delete ON knowledge_tree;
  CREATE POLICY knowledge_tree_select ON knowledge_tree FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
  CREATE POLICY knowledge_tree_insert ON knowledge_tree FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
  CREATE POLICY knowledge_tree_update ON knowledge_tree FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
  CREATE POLICY knowledge_tree_delete ON knowledge_tree FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

  -- 7. card_status
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
