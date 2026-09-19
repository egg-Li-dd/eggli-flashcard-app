-- ============================================================
-- CloudBase PostgreSQL 建表脚本（第 2/4 部分）
-- 项目：AI 背诵卡片
-- ============================================================

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
