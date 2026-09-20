-- ============================================================
-- CloudBase PostgreSQL RLS 行级安全策略（第 4/4 部分 上）
-- 项目：AI 背诵卡片
-- 重要：CloudBase 不支持 auth.uid()，使用 true + 应用层 user_id 过滤
-- ============================================================

-- 1. categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_select ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY categories_delete ON categories FOR DELETE TO authenticated USING (true);

-- 2. topics
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topics_select ON topics;
DROP POLICY IF EXISTS topics_insert ON topics;
DROP POLICY IF EXISTS topics_update ON topics;
DROP POLICY IF EXISTS topics_delete ON topics;
CREATE POLICY topics_select ON topics FOR SELECT TO authenticated USING (true);
CREATE POLICY topics_insert ON topics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY topics_update ON topics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY topics_delete ON topics FOR DELETE TO authenticated USING (true);

-- 3. chapters
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chapters_select ON chapters;
DROP POLICY IF EXISTS chapters_insert ON chapters;
DROP POLICY IF EXISTS chapters_update ON chapters;
DROP POLICY IF EXISTS chapters_delete ON chapters;
CREATE POLICY chapters_select ON chapters FOR SELECT TO authenticated USING (true);
CREATE POLICY chapters_insert ON chapters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY chapters_update ON chapters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY chapters_delete ON chapters FOR DELETE TO authenticated USING (true);

-- 4. units
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS units_select ON units;
DROP POLICY IF EXISTS units_insert ON units;
DROP POLICY IF EXISTS units_update ON units;
DROP POLICY IF EXISTS units_delete ON units;
CREATE POLICY units_select ON units FOR SELECT TO authenticated USING (true);
CREATE POLICY units_insert ON units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY units_update ON units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY units_delete ON units FOR DELETE TO authenticated USING (true);

-- 5. cards
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cards_select ON cards;
DROP POLICY IF EXISTS cards_insert ON cards;
DROP POLICY IF EXISTS cards_update ON cards;
DROP POLICY IF EXISTS cards_delete ON cards;
CREATE POLICY cards_select ON cards FOR SELECT TO authenticated USING (true);
CREATE POLICY cards_insert ON cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cards_update ON cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cards_delete ON cards FOR DELETE TO authenticated USING (true);

-- 6. card_status
ALTER TABLE card_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_status_select ON card_status;
DROP POLICY IF EXISTS card_status_insert ON card_status;
DROP POLICY IF EXISTS card_status_update ON card_status;
DROP POLICY IF EXISTS card_status_delete ON card_status;
CREATE POLICY card_status_select ON card_status FOR SELECT TO authenticated USING (true);
CREATE POLICY card_status_insert ON card_status FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY card_status_update ON card_status FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY card_status_delete ON card_status FOR DELETE TO authenticated USING (true);

-- 7. bookmarks
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookmarks_select ON bookmarks;
DROP POLICY IF EXISTS bookmarks_insert ON bookmarks;
DROP POLICY IF EXISTS bookmarks_update ON bookmarks;
DROP POLICY IF EXISTS bookmarks_delete ON bookmarks;
CREATE POLICY bookmarks_select ON bookmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY bookmarks_insert ON bookmarks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bookmarks_update ON bookmarks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY bookmarks_delete ON bookmarks FOR DELETE TO authenticated USING (true);

-- 8. wrong_answers
ALTER TABLE wrong_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wrong_answers_select ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_insert ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_update ON wrong_answers;
DROP POLICY IF EXISTS wrong_answers_delete ON wrong_answers;
CREATE POLICY wrong_answers_select ON wrong_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY wrong_answers_insert ON wrong_answers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY wrong_answers_update ON wrong_answers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY wrong_answers_delete ON wrong_answers FOR DELETE TO authenticated USING (true);
