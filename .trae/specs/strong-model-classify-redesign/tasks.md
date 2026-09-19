# Tasks

- [x] Task 1: 新增常量定义
  - `STRONG_CLASSIFY_CARD_THRESHOLD = 200`（现有卡片总数阈值）
  - `BATCH_CHAPTER_SIZE = 3`（每批章节数）
  - 文件: `src/services/aiService.js` 顶部

- [x] Task 2: 重构 `classifyCardsByCategoryContent` 函数 — 阈值判断
  - 在 `hasApi` 分支开头统计现有卡片总数（章节下 + 未归章单元下）
  - 总数 ≤ 200 → 走路径 A（一次性全部）
  - 总数 > 200 → 走路径 B（多轮分批）
  - 文件: `src/services/aiService.js`

- [x] Task 3: 实现路径 A（小数据一次性）prompt
  - 降低新章节创建门槛：2 张以上同主题即可创建
  - 新章节上限：3 个，新单元上限：5 个
  - 禁止"一个单元一个章节"（同一新章节下至少 2 个单元，或 1 个单元至少 2 张卡片）
  - 文件: `src/services/aiService.js`

- [x] Task 4: 实现路径 B（多轮分批）核心逻辑
  - 新增 `classifyCardsMultiRound` 函数：按 3 章节/批分组
  - 用 `classifiedSet`（Set<原始索引>）追踪已归类卡片
  - 每轮构建 `indexMap`（临时索引→原始索引），映射回原始索引
  - 前 N 轮 prompt：仅归类到现有结构，禁止创建新章节/单元
  - 最终轮 prompt：为剩余卡片创建新章节/单元（≥2 张）
  - 防死循环：无进度直接进最终轮，最大轮次 = 章节批次数 + 1
  - 文件: `src/services/aiService.js`

- [x] Task 5: 更新 `AI出题算法报告.txt`
  - 记录双路径策略、阈值、分批逻辑
  - 文件: `AI出题算法报告.txt`

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 2
- Task 5 依赖 Task 3/4