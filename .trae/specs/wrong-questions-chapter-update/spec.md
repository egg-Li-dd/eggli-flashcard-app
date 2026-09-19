# 错题本章节化更新 - Product Requirement Document

## Overview
- **Summary**: 错题本页面已支持章节分组展示，但错题记录的写入源头（单元检测答题、AI 评分）缺少 chapterId 参数，导致新错题无法正确关联到章节。本需求旨在补全错题记录的数据链路，确保章节概念在错题本功能中完整落地。
- **Purpose**: 解决引入章节概念后，错题记录与章节关联断裂的问题，保证错题本能够正确按章节分组展示和筛选。
- **Target Users**: 使用单元检测功能的所有用户

## Goals
- [ ] 错题记录写入时完整传递 chapterId 参数
- [ ] 数据库层支持按章节查询错题记录
- [ ] 云端同步层确保 chapterId 字段正确映射
- [ ] 验证所有测试路径错题记录的章节关联正确性

## Non-Goals (Out of Scope)
- [ ] 不修改错题本页面的 UI 布局（已有三层分组展示）
- [ ] 不新增错题本的统计分析功能
- [ ] 不修改背诵计划与错题本的联动逻辑

## Background & Context

### 现状分析
1. **错题本页面** (`WrongQuestionsPage.jsx`)：已实现分类→章节→单元三层分组展示，支持按章节筛选错题重做
2. **本地数据库** (`db.js`)：
   - v5 升级已为 `wrongAnswers` 表添加 `unitId` 索引
   - v7 升级已为 `wrongAnswers` 表添加 `chapterId` 字段
   - `addWrongAnswer` 函数已支持 `chapterId` 参数
3. **云端同步** (`sync.js`)：`TABLE_SCHEMAS.wrong_answers` 已包含 `chapter_id` 字段

### 问题定位
1. **单元检测答题后写入错题** (`UnitTestPage.jsx`)：调用 `addWrongAnswer` 时未传递 `chapterId` 参数
2. **AI 评分后写入错题** (`testGradingService.js`)：调用 `addWrongAnswer` 时未传递 `chapterId` 参数
3. **数据库查询缺失**：缺少按章节查询错题的专用函数（`getWrongAnswersByChapter`）
4. **索引不完善**：`wrongAnswers` 表缺少 `[categoryId+chapterId]` 复合索引

## Functional Requirements
- **FR-1**: 单元检测答题错误时，写入错题记录必须包含 chapterId
- **FR-2**: AI 评分结果错误时，写入错题记录必须包含 chapterId
- **FR-3**: 数据库层提供按章节查询错题的函数 `getWrongAnswersByChapter`
- **FR-4**: wrongAnswers 表添加 `[categoryId+chapterId]` 复合索引优化查询性能

## Non-Functional Requirements
- **NFR-1**: 不影响现有错题记录的兼容性（历史记录 chapterId 为空仍可正常显示）
- **NFR-2**: 不改变移动端界面布局和交互逻辑
- **NFR-3**: 构建验证通过（`npm run build`）

## Constraints
- **Technical**: 必须保持与现有 API 兼容，不破坏已有功能
- **Dependencies**: 依赖 `db.js` 的 `addWrongAnswer` 函数（已支持 chapterId 参数）

## Assumptions
- [ ] cards 表已有 `chapterId` 字段（v7 升级已完成）
- [ ] testQuestions 表已有 `chapterId` 字段（v7 升级已完成）
- [ ] 云端表结构已包含 `chapter_id` 字段（sync.js TABLE_SCHEMAS 已定义）

## Acceptance Criteria

### AC-1: 单元检测答题错误写入错题时包含 chapterId
- **Given**: 用户在单元检测中答错题目
- **When**: UnitTestPage.jsx 处理答题结果并调用 addWrongAnswer
- **Then**: 写入的 wrongAnswers 记录包含正确的 chapterId
- **Verification**: `programmatic`

### AC-2: AI 评分错误写入错题时包含 chapterId
- **Given**: AI 评分服务判定题目答错
- **When**: testGradingService.js 处理评分结果并调用 addWrongAnswer
- **Then**: 写入的 wrongAnswers 记录包含正确的 chapterId
- **Verification**: `programmatic`

### AC-3: 数据库支持按章节查询错题
- **Given**: 错题本页面需要按章节筛选错题
- **When**: 调用 getWrongAnswersByChapter(chapterId)
- **Then**: 返回该章节下所有错题记录
- **Verification**: `programmatic`

### AC-4: 错题本页面按章节分组展示正确
- **Given**: 存在多个章节的错题记录
- **When**: 打开错题本页面
- **Then**: 错题正确归类到所属章节下，未分类区域显示 chapterId 为空的记录
- **Verification**: `human-judgment`

### AC-5: 章节错题重做功能正常
- **Given**: 某章节下存在错题
- **When**: 点击章节右侧的重做按钮
- **Then**: 跳转到单元检测页面，正确加载该章节的错题
- **Verification**: `human-judgment`

### AC-6: 云端同步支持 chapterId
- **Given**: 用户登录云端账号
- **When**: 同步错题记录到云端
- **Then**: chapterId 字段正确映射为 chapter_id 并同步成功
- **Verification**: `programmatic`

## Open Questions
- [ ] 是否需要为 `wrongAnswers` 表添加 `[categoryId+chapterId+unitId]` 三层复合索引？
- [ ] 是否需要在 `repairCardRelationsAfterImport` 中补充 chapterId 回填逻辑？

## Implementation Impact

### 需要修改的文件
1. `src/pages/UnitTestPage.jsx` - 传递 chapterId 到 addWrongAnswer
2. `src/services/testGradingService.js` - 传递 chapterId 到 addWrongAnswer
3. `src/services/db.js` - 添加 getWrongAnswersByChapter 函数和索引
4. `存储数据记录.txt` - 更新错题本相关记录
5. `需执行的 SQL（更新版）.txt` - 添加索引 SQL

### SQL 更新评估
- 本地 IndexedDB：v7 已添加 chapterId 字段，需新增 `[categoryId+chapterId]` 复合索引
- 云端 PostgreSQL：`wrong_answers` 表已有 `chapter_id` 字段，需新增 `category_id+chapter_id` 索引
