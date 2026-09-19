# 错题上传与云端未更新筛选修复 - 实现计划

## [x] Task 1: 修复 wrong_answers 表 SQL（添加 updated_at 列）
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 `需执行的 SQl（更新版）.txt` 中添加 SQL：`ALTER TABLE public.wrong_answers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`
  - 更新 `需执行的 SQl（完整版）.txt` 中 wrong_answers 表定义，添加 updated_at 列
  - 更新 `我在SQL editor执行的命令.txt` 中 wrong_answers 表定义
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement`: 验证 SQL 文件已更新

## [x] Task 2: 修复 sync.js 中 wrong_answers 的 autoAddUpdatedAt
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 修改 `src/services/sync.js` 的 TABLE_SCHEMAS.wrong_answers
  - 将 `autoAddUpdatedAt: false` 改为 `autoAddUpdatedAt: true`
  - 在 fields 数组中添加 `updated_at`
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement`: 检查 TABLE_SCHEMAS.wrong_answers 配置正确

## [x] Task 3: 修复"云端未更新"筛选逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 修改 `src/pages/CloudDataDetail.jsx`
  - 当 `filters.updatedStatus === 'not-updated'` 时，加载本地数据并过滤出本地有但云端没有的项
  - 新增状态 `localItems` 存储本地完整数据
  - 当筛选激活时，`visibleItems` 从本地数据中筛选
  - 对应的操作按钮改为"上传到云端"
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `human-judgement`: 验证筛选"云端未更新"时显示本地独有数据
  - `human-judgement`: 验证操作按钮显示"上传到云端"

## [x] Task 4: 更新文档分布.txt
- **Priority**: P2
- **Depends On**: Task 1-3
- **Description**:
  - 更新文档分布.txt，记录本次修改的位置
- **Acceptance Criteria Addressed**: 维护任务
- **Test Requirements**:
  - `human-judgement`: 验证文档更新