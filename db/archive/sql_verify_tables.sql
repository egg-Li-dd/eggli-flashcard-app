-- ============================================================
-- 验证数据库表完整性查询
-- ============================================================

-- 1. 查询所有预期表是否存在
SELECT
  t.tablename AS "表名",
  CASE
    WHEN t.tablename IN ('categories','topics','chapters','units','cards','card_status',
                         'bookmarks','wrong_answers','user_profiles','user_settings',
                         'test_questions','test_records','test_sessions','review_history','study_plans')
    THEN '是'
    ELSE '否'
  END AS "是否为预期表",
  obj_description(c.oid) AS "表备注",
  pg_size_pretty(pg_total_relation_size(c.oid)) AS "表大小"
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

-- 2. 查询预期表清单与实际表比对
SELECT
  expected.table_name AS "预期表名",
  CASE
    WHEN actual.tablename IS NOT NULL THEN '已创建'
    ELSE '未创建'
  END AS "状态",
  expected.description AS "说明"
FROM (VALUES
  ('categories', '分类表'),
  ('topics', '主题表'),
  ('chapters', '章节表'),
  ('units', '单元表'),
  ('cards', '卡片表'),
  ('card_status', '卡片状态表'),
  ('bookmarks', '书签表'),
  ('wrong_answers', '错题表'),
  ('user_profiles', '用户资料表'),
  ('user_settings', '用户设置表'),
  ('test_questions', '测试题目表'),
  ('test_records', '测试记录表'),
  ('test_sessions', '测试会话表'),
  ('review_history', '复习历史表'),
  ('study_plans', '学习计划表')
) AS expected(table_name, description)
LEFT JOIN pg_tables actual ON actual.tablename = expected.table_name AND actual.schemaname = 'public'
ORDER BY expected.table_name;

-- 3. 查询每张表的字段数量
SELECT
  t.tablename AS "表名",
  COUNT(a.attname) AS "字段数量",
  string_agg(a.attname, ', ' ORDER BY a.attnum) AS "字段列表"
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE t.schemaname = 'public'
  AND t.tablename IN ('categories','topics','chapters','units','cards','card_status',
                      'bookmarks','wrong_answers','user_profiles','user_settings',
                      'test_questions','test_records','test_sessions','review_history','study_plans')
GROUP BY t.tablename
ORDER BY t.tablename;

-- 4. 查询每张表的索引
SELECT
  t.tablename AS "表名",
  i.indexname AS "索引名",
  i.indexdef AS "索引定义"
FROM pg_tables t
JOIN pg_indexes i ON i.tablename = t.tablename AND i.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN ('categories','topics','chapters','units','cards','card_status',
                      'bookmarks','wrong_answers','user_profiles','user_settings',
                      'test_questions','test_records','test_sessions','review_history','study_plans')
ORDER BY t.tablename, i.indexname;

-- 5. 查询每张表的RLS启用状态
SELECT
  t.tablename AS "表名",
  CASE WHEN c.relrowsecurity THEN '已启用' ELSE '未启用' END AS "RLS状态",
  CASE WHEN c.relforcerowsecurity THEN '强制' ELSE '非强制' END AS "强制模式"
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN ('categories','topics','chapters','units','cards','card_status',
                      'bookmarks','wrong_answers','user_profiles','user_settings',
                      'test_questions','test_records','test_sessions','review_history','study_plans')
ORDER BY t.tablename;

-- 6. 查询每张表的记录数
SELECT 'categories' AS "表名", COUNT(*) AS "记录数" FROM categories
UNION ALL SELECT 'topics', COUNT(*) FROM topics
UNION ALL SELECT 'chapters', COUNT(*) FROM chapters
UNION ALL SELECT 'units', COUNT(*) FROM units
UNION ALL SELECT 'cards', COUNT(*) FROM cards
UNION ALL SELECT 'card_status', COUNT(*) FROM card_status
UNION ALL SELECT 'bookmarks', COUNT(*) FROM bookmarks
UNION ALL SELECT 'wrong_answers', COUNT(*) FROM wrong_answers
UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL SELECT 'test_questions', COUNT(*) FROM test_questions
UNION ALL SELECT 'test_records', COUNT(*) FROM test_records
UNION ALL SELECT 'test_sessions', COUNT(*) FROM test_sessions
UNION ALL SELECT 'review_history', COUNT(*) FROM review_history
UNION ALL SELECT 'study_plans', COUNT(*) FROM study_plans
ORDER BY "表名";
