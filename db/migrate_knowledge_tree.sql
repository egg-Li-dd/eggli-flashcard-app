-- ============================================================
-- Knowledge Tree 数据迁移脚本
-- 将 categories、topics、chapters、units、cards、drafts 数据迁移到 knowledge_tree
-- ============================================================

-- ============================================================
-- Step 1: 迁移 categories（分类）→ level='category'
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  purpose, description, color, icon,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, NULL, 'category', name,
  id, NULL, NULL, NULL, NULL,
  purpose, description, '#3b82f6', '📚',
  0, user_id, created_at, updated_at
FROM categories
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 2: 迁移 topics（主题）→ level='topic'
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  description, is_processed,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, category_id, 'topic', name,
  category_id, id, NULL, NULL, NULL,
  NULL, FALSE,
  0, user_id, created_at, updated_at
FROM topics
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 3: 迁移 chapters（章节）→ level='chapter'
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  description, position,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, COALESCE(topic_id, category_id), 'chapter', name,
  category_id, topic_id, id, NULL, NULL,
  NULL, "order",
  "order", user_id, created_at, updated_at
FROM chapters
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 4: 迁移 units（单元）→ level='unit'
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  description, position, is_processed,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, COALESCE(chapter_id, category_id), 'unit', name,
  category_id, NULL, chapter_id, id, NULL,
  NULL, "order", FALSE,
  "order", user_id, created_at, updated_at
FROM units
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 5: 迁移 cards（卡片）→ level='card'
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  content, front, back, hint, explanation,
  type, options, answer_blank,
  status, source,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, COALESCE(unit_id, chapter_id, category_id), 'card', NULL,
  category_id, NULL, chapter_id, unit_id, NULL,
  knowledge_point, front, back, NULL, NULL,
  type, options, answer_blank,
  'active', 'manual',
  "order", user_id, created_at, updated_at
FROM cards
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 6: 迁移 drafts（草稿）→ level='card', status=原始状态
-- ============================================================
INSERT INTO knowledge_tree (
  id, parent_id, level, name,
  category_id, topic_id, chapter_id, unit_id, knowledge_point_id,
  content, front, back,
  status, retry_count, source,
  error_message, generated_at, template_type,
  "order", user_id, created_at, updated_at
)
SELECT 
  id, COALESCE(unit_id, chapter_id, category_id), 'card', NULL,
  category_id, NULL, chapter_id, unit_id, NULL,
  content, NULL, NULL,
  status, retry_count, source,
  error_message, generated_at, template_type,
  0, user_id, created_at, updated_at
FROM drafts
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Step 7: 更新 knowledge_tree 中的冗余字段（补充缺失的层级关联）
-- ============================================================

-- 更新 topic 层级的 category_id（确保不为空）
UPDATE knowledge_tree
SET category_id = (SELECT category_id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id)
WHERE level = 'topic' AND category_id IS NULL AND parent_id IS NOT NULL;

-- 更新 chapter 层级的 category_id 和 topic_id
UPDATE knowledge_tree
SET 
  category_id = COALESCE(category_id, (SELECT category_id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id)),
  topic_id = (SELECT id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id AND parent.level = 'topic')
WHERE level = 'chapter' AND parent_id IS NOT NULL;

-- 更新 unit 层级的 category_id 和 chapter_id
UPDATE knowledge_tree
SET 
  category_id = COALESCE(category_id, (SELECT category_id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id)),
  chapter_id = (SELECT id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id AND parent.level = 'chapter')
WHERE level = 'unit' AND parent_id IS NOT NULL;

-- 更新 card 层级的 category_id、chapter_id 和 unit_id
UPDATE knowledge_tree
SET 
  category_id = COALESCE(category_id, (SELECT category_id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id)),
  chapter_id = COALESCE(chapter_id, (SELECT chapter_id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id)),
  unit_id = COALESCE(unit_id, (SELECT id FROM knowledge_tree AS parent WHERE parent.id = knowledge_tree.parent_id AND parent.level = 'unit'))
WHERE level = 'card' AND parent_id IS NOT NULL;

-- ============================================================
-- Step 8: 验证迁移结果
-- ============================================================
SELECT 
  'categories' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'category') AS target_count
UNION ALL
SELECT 
  'topics' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'topic') AS target_count
UNION ALL
SELECT 
  'chapters' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'chapter') AS target_count
UNION ALL
SELECT 
  'units' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'unit') AS target_count
UNION ALL
SELECT 
  'cards' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'card' AND status = 'active') AS target_count
UNION ALL
SELECT 
  'drafts' AS source_table, COUNT(*) AS source_count,
  (SELECT COUNT(*) FROM knowledge_tree WHERE level = 'card' AND status != 'active') AS target_count;
