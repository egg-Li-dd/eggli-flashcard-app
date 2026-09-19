# 错题本章节化更新 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: UnitTestPage.jsx 传递 chapterId 到 addWrongAnswer
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 修改 UnitTestPage.jsx 中调用 addWrongAnswer 的位置（L703-708），传递 chapterId 参数
  - chapterId 来源：从 testQuestions 或 cards 数据中获取
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 检查 addWrongAnswer 调用是否包含 chapterId 参数
  - `programmatic` TR-1.2: 单元检测答错后，wrongAnswers 记录包含正确的 chapterId

## [x] Task 2: testGradingService.js 传递 chapterId 到 addWrongAnswer
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 修改 testGradingService.js 中调用 addWrongAnswer 的位置（L871-873），传递 chapterId 参数
  - chapterId 来源：从题目数据（question 或 card）中获取
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 检查 addWrongAnswer 调用是否包含 chapterId 参数
  - `programmatic` TR-2.2: AI 评分错误后，wrongAnswers 记录包含正确的 chapterId

## [x] Task 3: db.js 添加 getWrongAnswersByChapter 函数
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 在 db.js 中添加 getWrongAnswersByChapter(chapterId) 函数
  - 函数返回指定章节下的所有错题记录
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 单元测试验证函数返回正确的数据
  - `programmatic` TR-3.2: 空 chapterId 时返回所有未归章的错题

## [x] Task 4: db.js 添加 [categoryId+chapterId] 复合索引
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 在 wrongAnswers 表的 schema 中添加 [categoryId+chapterId] 复合索引
  - 通过 db.version(9) 升级实现
- **Acceptance Criteria Addressed**: FR-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 数据库升级成功，索引创建完成
  - `programmatic` TR-4.2: 按章节查询性能提升（可选）

## [x] Task 5: 更新存储数据记录.txt
- **Priority**: P1
- **Depends On**: Tasks 1-4
- **Description**: 
  - 在存储数据记录.txt 中添加错题本章节化更新的记录
  - 包括触发入口、核心函数、存储表、记录内容与逻辑
- **Acceptance Criteria Addressed**: NFR-3
- **Test Requirements**:
  - `human-judgment` TR-5.1: 文档内容完整准确，包含所有关键变更点

## [ ] Task 6: 更新 SQL 文件（完整版和更新版）
- **Priority**: P1
- **Depends On**: Task 4
- **Description**: 
  - 在需执行的 SQL（完整版）.txt 中添加 wrong_answers 表的 chapter_id 索引
  - 在需执行的 SQL（更新版）.txt 中添加新增的索引 SQL
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: SQL 语法正确，可在 Supabase SQL Editor 中执行
  - `programmatic` TR-6.2: 索引创建成功后查询性能正常

## [ ] Task 7: 构建验证
- **Priority**: P0
- **Depends On**: Tasks 1-4
- **Description**: 
  - 执行 npm run build 验证所有修改无语法错误
- **Acceptance Criteria Addressed**: NFR-3
- **Test Requirements**:
  - `programmatic` TR-7.1: npm run build 退出码为 0
  - `programmatic` TR-7.2: 无编译警告和错误
