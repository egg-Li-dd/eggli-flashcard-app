-- ============================================================
-- CloudBase PostgreSQL RLS 配置验证脚本
-- 执行此脚本检查所有表的 RLS 状态和策略
-- ============================================================

-- 检查所有表的 RLS 状态
SELECT 
    schemaname,
    tablename,
    rowsecurity AS "RLS已启用"
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 检查每个表的策略数量（正常应为 4：select/insert/update/delete）
SELECT 
    tablename AS "表名",
    policyname AS "策略名",
    cmd AS "操作类型",
    permissive AS "是否允许"
FROM pg_policy 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 统计每个表的策略数量
SELECT 
    tablename AS "表名",
    COUNT(*) AS "策略数量"
FROM pg_policy 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
