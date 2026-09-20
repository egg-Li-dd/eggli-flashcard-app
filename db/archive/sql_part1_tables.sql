-- ============================================================
-- CloudBase PostgreSQL 建表脚本（第 1/4 部分）
-- 项目：AI 背诵卡片
-- 执行顺序：1→2→3→4
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

-- 6. 卡片状态表
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
