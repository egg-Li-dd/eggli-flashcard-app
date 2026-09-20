-- ============================================================
-- Supabase 数据存储修复脚本 v2
-- 需要在 Supabase 控制台 -> SQL Editor 中完整执行
--
-- 修复内容：
--   1. 将所有 ID 类型从 uuid 改为 text（兼容本地字符串 ID）
--   2. 添加 category_id 字段到 card_status 表
--   3. 为 card_status 添加 category_id 索引
--   4. 增强 RLS 策略（新增 category_id 相关策略）
--   5. 更新诊断视图
-- ============================================================

-- 1. 修改 categories 表：将 id 从 uuid 改为 text
ALTER TABLE public.categories ALTER COLUMN id TYPE text;
ALTER TABLE public.categories ALTER COLUMN user_id TYPE text;

-- 2. 修改 units 表：将 id 和 category_id 从 uuid 改为 text
ALTER TABLE public.units ALTER COLUMN id TYPE text;
ALTER TABLE public.units ALTER COLUMN user_id TYPE text;
ALTER TABLE public.units ALTER COLUMN category_id TYPE text;

-- 3. 修改 cards 表
ALTER TABLE public.cards ALTER COLUMN id TYPE text;
ALTER TABLE public.cards ALTER COLUMN user_id TYPE text;
ALTER TABLE public.cards ALTER COLUMN unit_id TYPE text;

-- 4. 修改 card_status 表：添加 category_id 字段并修改类型
-- 先删除现有外键约束（如果存在）
ALTER TABLE public.card_status DROP CONSTRAINT IF EXISTS card_status_card_id_fkey;
ALTER TABLE public.card_status DROP CONSTRAINT IF EXISTS card_status_user_id_fkey;

-- 添加 category_id 字段（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_status' AND column_name = 'category_id') THEN
    ALTER TABLE public.card_status ADD COLUMN category_id text;
  END IF;
END $$;

-- 修改现有字段类型
ALTER TABLE public.card_status ALTER COLUMN id TYPE text;
ALTER TABLE public.card_status ALTER COLUMN user_id TYPE text;
ALTER TABLE public.card_status ALTER COLUMN card_id TYPE text;

-- 5. 修改 bookmarks 表
ALTER TABLE public.bookmarks ALTER COLUMN id TYPE text;
ALTER TABLE public.bookmarks ALTER COLUMN user_id TYPE text;
ALTER TABLE public.bookmarks ALTER COLUMN card_id TYPE text;

-- ============================================================
-- 2. 外键约束（已移除以支持独立上传，见第 8 节）
--    如果需要保留外键约束，取消下面的注释
-- ============================================================
-- ALTER TABLE public.card_status ADD CONSTRAINT card_status_card_id_fkey ...

-- ============================================================
-- 3. 添加索引优化查询性能
-- ============================================================

-- card_status 表添加 category_id 索引（用于按分类查询学习状态）
CREATE INDEX IF NOT EXISTS idx_card_status_category_id ON public.card_status(category_id);
CREATE INDEX IF NOT EXISTS idx_card_status_user_id ON public.card_status(user_id);
CREATE INDEX IF NOT EXISTS idx_card_status_card_id ON public.card_status(card_id);

-- bookmarks 表添加 user_id 索引
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_card_id ON public.bookmarks(card_id);

-- units 表添加 category_id 和 user_id 索引
CREATE INDEX IF NOT EXISTS idx_units_category_id ON public.units(category_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id ON public.units(user_id);

-- cards 表添加 unit_id 和 user_id 索引
CREATE INDEX IF NOT EXISTS idx_cards_unit_id ON public.cards(unit_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON public.cards(user_id);

-- categories 表添加 user_id 索引
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);

-- ============================================================
-- 4. 删除并重建 RLS 策略（确保正确工作）
-- ============================================================

-- 删除现有策略
DROP POLICY IF EXISTS "categories_select_authenticated_only_own_data" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_authenticated_only_own_data" ON public.categories;
DROP POLICY IF EXISTS "categories_update_authenticated_only_own_data" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_authenticated_only_own_data" ON public.categories;

DROP POLICY IF EXISTS "units_select_authenticated_only_own_data" ON public.units;
DROP POLICY IF EXISTS "units_insert_authenticated_only_own_data" ON public.units;
DROP POLICY IF EXISTS "units_update_authenticated_only_own_data" ON public.units;
DROP POLICY IF EXISTS "units_delete_authenticated_only_own_data" ON public.units;

DROP POLICY IF EXISTS "cards_select_authenticated_only_own_data" ON public.cards;
DROP POLICY IF EXISTS "cards_insert_authenticated_only_own_data" ON public.cards;
DROP POLICY IF EXISTS "cards_update_authenticated_only_own_data" ON public.cards;
DROP POLICY IF EXISTS "cards_delete_authenticated_only_own_data" ON public.cards;

DROP POLICY IF EXISTS "card_status_select_authenticated_only_own_data" ON public.card_status;
DROP POLICY IF EXISTS "card_status_insert_authenticated_only_own_data" ON public.card_status;
DROP POLICY IF EXISTS "card_status_update_authenticated_only_own_data" ON public.card_status;
DROP POLICY IF EXISTS "card_status_delete_authenticated_only_own_data" ON public.card_status;

DROP POLICY IF EXISTS "bookmarks_select_authenticated_only_own_data" ON public.bookmarks;
DROP POLICY IF EXISTS "bookmarks_insert_authenticated_only_own_data" ON public.bookmarks;
DROP POLICY IF EXISTS "bookmarks_update_authenticated_only_own_data" ON public.bookmarks;
DROP POLICY IF EXISTS "bookmarks_delete_authenticated_only_own_data" ON public.bookmarks;

-- ---------- categories ----------
CREATE POLICY "categories_select_authenticated_only_own_data"
  ON public.categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "categories_insert_authenticated_only_own_data"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update_authenticated_only_own_data"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "categories_delete_authenticated_only_own_data"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id);

-- ---------- units ----------
CREATE POLICY "units_select_authenticated_only_own_data"
  ON public.units FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "units_insert_authenticated_only_own_data"
  ON public.units FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "units_update_authenticated_only_own_data"
  ON public.units FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "units_delete_authenticated_only_own_data"
  ON public.units FOR DELETE
  USING (auth.uid() = user_id);

-- ---------- cards ----------
CREATE POLICY "cards_select_authenticated_only_own_data"
  ON public.cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cards_insert_authenticated_only_own_data"
  ON public.cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cards_update_authenticated_only_own_data"
  ON public.cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "cards_delete_authenticated_only_own_data"
  ON public.cards FOR DELETE
  USING (auth.uid() = user_id);

-- ---------- card_status ----------
CREATE POLICY "card_status_select_authenticated_only_own_data"
  ON public.card_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "card_status_insert_authenticated_only_own_data"
  ON public.card_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "card_status_update_authenticated_only_own_data"
  ON public.card_status FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "card_status_delete_authenticated_only_own_data"
  ON public.card_status FOR DELETE
  USING (auth.uid() = user_id);

-- ---------- bookmarks ----------
CREATE POLICY "bookmarks_select_authenticated_only_own_data"
  ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert_authenticated_only_own_data"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_update_authenticated_only_own_data"
  ON public.bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete_authenticated_only_own_data"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. 更新诊断视图（增强版）
-- ============================================================

-- 删除旧视图
DROP VIEW IF EXISTS diagnose_all_tables;
DROP VIEW IF EXISTS diagnose_orphaned_records;
DROP VIEW IF EXISTS diagnose_rls_status;
DROP VIEW IF EXISTS diagnose_user_stats;

-- 诊断视图：检查所有表的数据统计和完整性
CREATE OR REPLACE VIEW diagnose_all_tables AS
SELECT 
  'categories' as table_name,
  (SELECT COUNT(*) FROM categories) as total_rows,
  (SELECT COUNT(*) FROM categories WHERE title IS NULL OR title = '') as invalid_title,
  (SELECT COUNT(*) FROM categories WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM categories) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'units' as table_name,
  (SELECT COUNT(*) FROM units) as total_rows,
  (SELECT COUNT(*) FROM units WHERE title IS NULL OR title = '') as invalid_title,
  (SELECT COUNT(*) FROM units WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM units) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'cards' as table_name,
  (SELECT COUNT(*) FROM cards) as total_rows,
  (SELECT COUNT(*) FROM cards WHERE front IS NULL OR front = '' OR back IS NULL OR back = '') as invalid_content,
  (SELECT COUNT(*) FROM cards WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM cards) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'card_status' as table_name,
  (SELECT COUNT(*) FROM card_status) as total_rows,
  (SELECT COUNT(*) FROM card_status WHERE status IS NULL) as invalid_status,
  (SELECT COUNT(*) FROM card_status WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM card_status) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'bookmarks' as table_name,
  (SELECT COUNT(*) FROM bookmarks) as total_rows,
  0 as invalid_title,
  (SELECT COUNT(*) FROM bookmarks WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM bookmarks) as unique_users,
  NOW() as checked_at;

-- 诊断视图：检查孤立数据（外键引用不存在的记录）
CREATE OR REPLACE VIEW diagnose_orphaned_records AS
SELECT 
  'units_without_category' as issue_type,
  COUNT(*) as count,
  'units 表中有 category_id 指向不存在的 categories' as description
FROM units u
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = u.category_id)
UNION ALL
SELECT 
  'cards_without_unit' as issue_type,
  COUNT(*) as count,
  'cards 表中有 unit_id 指向不存在的 units' as description
FROM cards c
WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = c.unit_id)
UNION ALL
SELECT 
  'card_status_without_card' as issue_type,
  COUNT(*) as count,
  'card_status 表中有 card_id 指向不存在的 cards' as description
FROM card_status cs
WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = cs.card_id)
UNION ALL
SELECT 
  'card_status_without_category' as issue_type,
  COUNT(*) as count,
  'card_status 表中有 category_id 指向不存在的 categories' as description
FROM card_status cs
WHERE cs.category_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = cs.category_id)
UNION ALL
SELECT 
  'bookmarks_without_card' as issue_type,
  COUNT(*) as count,
  'bookmarks 表中有 card_id 指向不存在的 cards' as description
FROM bookmarks b
WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = b.card_id);

-- 诊断视图：检查 RLS 策略状态
CREATE OR REPLACE VIEW diagnose_rls_status AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 诊断视图：用户数据统计（按用户分组）
CREATE OR REPLACE VIEW diagnose_user_stats AS
SELECT 
  c.user_id,
  (SELECT email FROM auth.users WHERE id = c.user_id) as user_email,
  (SELECT COUNT(*) FROM categories WHERE user_id = c.user_id) as categories_count,
  (SELECT COUNT(*) FROM units WHERE user_id = c.user_id) as units_count,
  (SELECT COUNT(*) FROM cards WHERE user_id = c.user_id) as cards_count,
  (SELECT COUNT(*) FROM card_status WHERE user_id = c.user_id) as card_status_count,
  (SELECT COUNT(*) FROM bookmarks WHERE user_id = c.user_id) as bookmarks_count,
  (SELECT MAX(created_at) FROM categories WHERE user_id = c.user_id) as last_category_created
FROM (SELECT DISTINCT user_id FROM categories) c
ORDER BY user_id;

-- ============================================================
-- 6. 更新清理函数（兼容 text 类型）
-- ============================================================

-- 清理函数：删除指定用户的孤立数据
CREATE OR REPLACE FUNCTION cleanup_orphaned_data(target_user_id text)
RETURNS TABLE(deleted_units int, deleted_cards int, deleted_status int, deleted_bookmarks int) AS $$
DECLARE
  del_units int;
  del_cards int;
  del_status int;
  del_bookmarks int;
BEGIN
  -- 删除 units 中孤立数据（category 不存在）
  WITH deleted AS (
    DELETE FROM units u
    WHERE u.user_id = target_user_id
    AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = u.category_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO del_units FROM deleted;

  -- 删除 cards 中孤立数据（unit 不存在）
  WITH deleted AS (
    DELETE FROM cards c
    WHERE c.user_id = target_user_id
    AND NOT EXISTS (SELECT 1 FROM units u WHERE u.id = c.unit_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO del_cards FROM deleted;

  -- 删除 card_status 中孤立数据（card 不存在）
  WITH deleted AS (
    DELETE FROM card_status cs
    WHERE cs.user_id = target_user_id
    AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = cs.card_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO del_status FROM deleted;

  -- 删除 bookmarks 中孤立数据（card 不存在）
  WITH deleted AS (
    DELETE FROM bookmarks b
    WHERE b.user_id = target_user_id
    AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = b.card_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO del_bookmarks FROM deleted;

  RETURN QUERY SELECT del_units, del_cards, del_status, del_bookmarks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 清理函数：删除所有用户的孤立数据（需要 service_role 权限）
CREATE OR REPLACE FUNCTION cleanup_all_orphaned_data()
RETURNS TABLE(deleted_table text, deleted_count bigint) AS $$
DECLARE
  r record;
BEGIN
  -- 清理 units
  WITH deleted AS (
    DELETE FROM units u
    WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = u.category_id)
    RETURNING 1
  )
  SELECT 'units' as table_name, COUNT(*) as cnt INTO r FROM deleted;
  RETURN QUERY SELECT r.table_name, r.cnt;

  -- 清理 cards
  WITH deleted AS (
    DELETE FROM cards c
    WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = c.unit_id)
    RETURNING 1
  )
  SELECT 'cards' as table_name, COUNT(*) as cnt INTO r FROM deleted;
  RETURN QUERY SELECT r.table_name, r.cnt;

  -- 清理 card_status
  WITH deleted AS (
    DELETE FROM card_status cs
    WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = cs.card_id)
    RETURNING 1
  )
  SELECT 'card_status' as table_name, COUNT(*) as cnt INTO r FROM deleted;
  RETURN QUERY SELECT r.table_name, r.cnt;

  -- 清理 bookmarks
  WITH deleted AS (
    DELETE FROM bookmarks b
    WHERE NOT EXISTS (SELECT 1 FROM cards c WHERE c.id = b.card_id)
    RETURNING 1
  )
  SELECT 'bookmarks' as table_name, COUNT(*) as cnt INTO r FROM deleted;
  RETURN QUERY SELECT r.table_name, r.cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 重置函数：清除指定用户的所有数据（用于重新同步）
CREATE OR REPLACE FUNCTION reset_user_data(target_user_id text)
RETURNS TABLE(reset_table text, reset_count bigint) AS $$
DECLARE
  r record;
BEGIN
  -- 按照依赖顺序删除（先删子表，再删父表）
  FOR r IN EXECUTE format('DELETE FROM bookmarks WHERE user_id = %L RETURNING 1', target_user_id) LOOP
  END LOOP;
  GET DIAGNOSTICS r.cnt = ROW_COUNT;
  RETURN QUERY SELECT 'bookmarks'::text, r.cnt;

  FOR r IN EXECUTE format('DELETE FROM card_status WHERE user_id = %L RETURNING 1', target_user_id) LOOP
  END LOOP;
  GET DIAGNOSTICS r.cnt = ROW_COUNT;
  RETURN QUERY SELECT 'card_status'::text, r.cnt;

  FOR r IN EXECUTE format('DELETE FROM cards WHERE user_id = %L RETURNING 1', target_user_id) LOOP
  END LOOP;
  GET DIAGNOSTICS r.cnt = ROW_COUNT;
  RETURN QUERY SELECT 'cards'::text, r.cnt;

  FOR r IN EXECUTE format('DELETE FROM units WHERE user_id = %L RETURNING 1', target_user_id) LOOP
  END LOOP;
  GET DIAGNOSTICS r.cnt = ROW_COUNT;
  RETURN QUERY SELECT 'units'::text, r.cnt;

  FOR r IN EXECUTE format('DELETE FROM categories WHERE user_id = %L RETURNING 1', target_user_id) LOOP
  END LOOP;
  GET DIAGNOSTICS r.cnt = ROW_COUNT;
  RETURN QUERY SELECT 'categories'::text, r.cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 验证函数：检查当前用户的 RLS 访问权限
CREATE OR REPLACE FUNCTION check_user_access()
RETURNS TABLE(
  table_name text,
  can_select boolean,
  can_insert boolean,
  can_update boolean,
  can_delete boolean,
  row_count bigint
) AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    'categories'::text,
    (SELECT COUNT(*) > 0 FROM categories LIMIT 1) as can_select,
    true as can_insert,
    true as can_update,
    true as can_delete,
    (SELECT COUNT(*) FROM categories)::bigint as row_count
  UNION ALL
  SELECT 
    'units'::text,
    (SELECT COUNT(*) > 0 FROM units LIMIT 1),
    true, true, true,
    (SELECT COUNT(*) FROM units)::bigint
  UNION ALL
  SELECT 
    'cards'::text,
    (SELECT COUNT(*) > 0 FROM cards LIMIT 1),
    true, true, true,
    (SELECT COUNT(*) FROM cards)::bigint
  UNION ALL
  SELECT 
    'card_status'::text,
    (SELECT COUNT(*) > 0 FROM card_status LIMIT 1),
    true, true, true,
    (SELECT COUNT(*) FROM card_status)::bigint
  UNION ALL
  SELECT 
    'bookmarks'::text,
    (SELECT COUNT(*) > 0 FROM bookmarks LIMIT 1),
    true, true, true,
    (SELECT COUNT(*) FROM bookmarks)::bigint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 完成！
-- ============================================================

-- ============================================================
-- 7. wrong_answers 表（错题记录）— 创建与 RLS 策略
-- ============================================================

-- 创建 wrong_answers 表（如果不存在）
CREATE TABLE IF NOT EXISTS public.wrong_answers (
  id text PRIMARY KEY,
  card_id text NOT NULL,
  category_id text,
  user_id text NOT NULL,
  count integer DEFAULT 1,
  last_wrong_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 修改字段类型（若表已存在但类型不对）
ALTER TABLE public.wrong_answers ALTER COLUMN id TYPE text;
ALTER TABLE public.wrong_answers ALTER COLUMN card_id TYPE text;
ALTER TABLE public.wrong_answers ALTER COLUMN category_id TYPE text;
ALTER TABLE public.wrong_answers ALTER COLUMN user_id TYPE text;

-- 外键约束
ALTER TABLE public.wrong_answers DROP CONSTRAINT IF EXISTS wrong_answers_card_id_fkey;
ALTER TABLE public.wrong_answers ADD CONSTRAINT wrong_answers_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

ALTER TABLE public.wrong_answers DROP CONSTRAINT IF EXISTS wrong_answers_category_id_fkey;
ALTER TABLE public.wrong_answers ADD CONSTRAINT wrong_answers_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

-- 索引
CREATE INDEX IF NOT EXISTS idx_wrong_answers_user_id ON public.wrong_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_wrong_answers_card_id ON public.wrong_answers(card_id);

-- RLS 策略
DROP POLICY IF EXISTS "wrong_answers_select_authenticated_only_own_data" ON public.wrong_answers;
DROP POLICY IF EXISTS "wrong_answers_insert_authenticated_only_own_data" ON public.wrong_answers;
DROP POLICY IF EXISTS "wrong_answers_update_authenticated_only_own_data" ON public.wrong_answers;
DROP POLICY IF EXISTS "wrong_answers_delete_authenticated_only_own_data" ON public.wrong_answers;

CREATE POLICY "wrong_answers_select_authenticated_only_own_data"
  ON public.wrong_answers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wrong_answers_insert_authenticated_only_own_data"
  ON public.wrong_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wrong_answers_update_authenticated_only_own_data"
  ON public.wrong_answers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "wrong_answers_delete_authenticated_only_own_data"
  ON public.wrong_answers FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 8. 修复 bookmarks / cards / wrong_answers 主键约束 与 外键
--    （确保 upsert onConflict: 'id' 能正常执行）
-- ============================================================

-- 8a. 先移除会阻止独立上传的外键约束（客户端已保证数据完整性）
ALTER TABLE public.bookmarks DROP CONSTRAINT IF EXISTS bookmarks_card_id_fkey;
ALTER TABLE public.wrong_answers DROP CONSTRAINT IF EXISTS wrong_answers_card_id_fkey;
ALTER TABLE public.wrong_answers DROP CONSTRAINT IF EXISTS wrong_answers_category_id_fkey;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_unit_id_fkey;
ALTER TABLE public.card_status DROP CONSTRAINT IF EXISTS card_status_card_id_fkey;
ALTER TABLE public.card_status DROP CONSTRAINT IF EXISTS card_status_category_id_fkey;
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_category_id_fkey;

-- 8b. bookmarks：确保 id 是主键
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookmarks_pkey' AND conrelid = 'public.bookmarks'::regclass
  ) THEN
    ALTER TABLE public.bookmarks ADD PRIMARY KEY (id);
  END IF;
END $$;

-- cards：确保 id 是主键
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'cards_pkey' AND conrelid = 'public.cards'::regclass
  ) THEN
    ALTER TABLE public.cards ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ============================================================
-- 9. 更新诊断视图（加入 wrong_answers）
-- ============================================================

DROP VIEW IF EXISTS diagnose_all_tables;
CREATE OR REPLACE VIEW diagnose_all_tables AS
SELECT 
  'categories' as table_name,
  (SELECT COUNT(*) FROM categories) as total_rows,
  (SELECT COUNT(*) FROM categories WHERE name IS NULL OR name = '') as invalid_name,
  (SELECT COUNT(*) FROM categories WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM categories) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'units' as table_name,
  (SELECT COUNT(*) FROM units) as total_rows,
  (SELECT COUNT(*) FROM units WHERE name IS NULL OR name = '') as invalid_name,
  (SELECT COUNT(*) FROM units WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM units) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'cards' as table_name,
  (SELECT COUNT(*) FROM cards) as total_rows,
  (SELECT COUNT(*) FROM cards WHERE front IS NULL OR front = '' OR back IS NULL OR back = '') as invalid_content,
  (SELECT COUNT(*) FROM cards WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM cards) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'card_status' as table_name,
  (SELECT COUNT(*) FROM card_status) as total_rows,
  (SELECT COUNT(*) FROM card_status WHERE status IS NULL) as invalid_status,
  (SELECT COUNT(*) FROM card_status WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM card_status) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'bookmarks' as table_name,
  (SELECT COUNT(*) FROM bookmarks) as total_rows,
  0 as invalid_name,
  (SELECT COUNT(*) FROM bookmarks WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM bookmarks) as unique_users,
  NOW() as checked_at
UNION ALL
SELECT 
  'wrong_answers' as table_name,
  (SELECT COUNT(*) FROM wrong_answers) as total_rows,
  0 as invalid_name,
  (SELECT COUNT(*) FROM wrong_answers WHERE user_id IS NULL) as null_user_id,
  (SELECT COUNT(DISTINCT user_id) FROM wrong_answers) as unique_users,
  NOW() as checked_at;
