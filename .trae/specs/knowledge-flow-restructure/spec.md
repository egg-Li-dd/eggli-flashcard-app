# 知识体系构建流程重构 Spec

## Why
当前知识体系构建流程中存在以下问题：
1. 主题聚类后的分类阶段直接与用户现有章节/单元联动，混合了"新建"和"合并"两种职责
2. `mergeSimilarUnits` 合并在前端执行，仅基于简单的文本相似度，无法感知语义关联
3. 弱模型分类准确率低，大量知识点被错误归类到不符合的主题
4. 缺少"新主题是否应合并到旧主题"的 AI 判断能力
5. 强模型和弱模型缺少各自独立的优化策略

## What Changes
- **BREAKING** 移除 `mergeSimilarUnits` 合并模块，改由 AI 驱动合并
- 主题/单元生成阶段仅生成新主题和新单元，取消与现有分类体系的联动
- 新增 AI 自动处理阶段：主题合并判断、单元合并判断、循环合并控制
- 强模型和弱模型各自有独立的管道策略
- 保留用户输入文本处理、临时原始知识点生成、原始知识点生成阶段不变

## Impact
- Affected specs: ai-classification-two-step, strong-model-classify-redesign, spark-lite-topic-cluster
- Affected code: `src/services/aiService.js`, `src/pages/Category.jsx`, `src/utils/helpers.js`, `src/services/iflytekAi.js`

## ADDED Requirements

### Requirement: 知识体系构建管道（通用）
系统 SHALL 在主题确认后按以下阶段顺序执行知识体系构建：
1. 用户输入文本处理（不变）
2. 临时原始知识点生成（不变）
3. 原始知识点生成（不变）
4. 新主题/新单元生成（仅生成新结构，不与现有体系联动）
5. AI 主题合并判断
6. AI 单元合并判断
7. 循环合并控制（最多 2 次）
8. 卡片生成与输出

#### Scenario: 正常流程执行
- **WHEN** 用户在主题确认界面点击"确认"
- **THEN** 系统按顺序执行阶段 4-8，每个阶段完成后进入下一阶段
- **AND** 阶段 4 仅生成新主题/新单元，不关联现有分类体系

---

### Requirement: 新主题与新单元独立生成
系统 SHALL 在主题确认后，仅根据用户确认的主题分组（`finalTopics`）生成新主题和新单元，不将新单元分配到已有单元。

#### Scenario: 仅生成新结构
- **WHEN** 用户确认 N 个主题分组
- **THEN** AI 仅输出 N 个新主题（章节）及其对应的新单元
- **AND** 输出的 assignments 中不包含 `unitId`（已有单元 ID），仅包含 `newChapterName` 和 `newUnitName`

#### 强模型路径（DeepSeek / 千问 / 豆包）
- **AI 调用**：单次调用
- **输入**：`finalTopics`（主题名 + 知识点索引数组）+ `flatNewCards`（带 kpIndex 的卡片数组）
- **Prompt 核心**：每个主题 → 1 个章节，章节内按知识点语义分组为 2-5 个单元
- **输出格式**：`[{cardIndex, newChapterName, newUnitName}, ...]`
- **参数**：temperature=0.3, max_tokens=4096（动态计算）

#### 弱模型路径（Spark Lite）
- **AI 调用**：多轮分批调用（每轮 15 张卡片为一批）
- **Round 1**：章节级分类 — 将卡片分配到用户确认的主题
- **Round 2**：单元级分类 — 每个章节内，将卡片按语义分组为 2-5 个单元
- **超时处理**：Round 2 超时时先为当前章节所有卡片创建 fallback 分配，再抛出异常
- **输出格式**：同强模型，仅包含 `newChapterName` / `newUnitName`
- **参数**：temperature=0.3, max_tokens=2048

---

### Requirement: AI 主题合并判断
系统 SHALL 分析新生成主题与已有主题的内容关联性，若满足合并条件，则将旧主题及其内部单元整合进新主题。

#### 强模型路径
- **AI 调用**：单次调用，一次性输入所有新旧主题
- **输入**：新主题列表（名称 + 前 3 张卡片摘要）+ 已有主题列表（名称 + 前 3 张卡片摘要）
- **Prompt 核心**：逐对比较语义相似度，输出合并决策
- **输出格式**：`[{newTopicName, oldChapterId, shouldMerge, reason}]`

#### 弱模型路径
- **AI 调用**：分批调用，每批 5 对（新主题 × 旧主题）
- **输入**：同上，但按批次拆分
- **降级**：超时/解析失败时使用名称相似度（`simpleTextSimilarity`）作为 fallback
- **合并阈值**：语义相似度 > 0.75

#### Scenario: 新主题与旧主题合并
- **WHEN** 新主题 A 与已有主题 B 的语义相似度 > 0.75
- **THEN** 系统将主题 B 的所有单元迁移到主题 A 下
- **AND** 标记主题 B 待删除

#### Scenario: 新主题与旧主题不合并
- **WHEN** 新主题 A 与所有已有主题的语义相似度均 < 0.75
- **THEN** 系统保留新主题 A 为独立新主题

---

### Requirement: AI 单元合并判断
系统 SHALL 评估新生成单元与已有单元的内容关联性，若满足合并条件，则用新单元取代旧单元。

#### 强模型路径
- **AI 调用**：单次调用，一次性输入所有新旧单元
- **输入**：新单元列表（名称 + 前 3 张卡片 front/back）+ 已有单元列表（名称 + 前 3 张卡片 front/back）
- **Prompt 核心**：逐对比较内容相似度，输出替换决策
- **输出格式**：`[{newUnitName, oldUnitId, shouldReplace, reason}]`

#### 弱模型路径
- **AI 调用**：分批调用，每批 5 对（新单元 × 旧单元）
- **降级**：超时/解析失败时使用名称 + 内容相似度（`simpleTextSimilarity`）作为 fallback
- **合并阈值**：内容相似度 > 0.75

#### Scenario: 新单元替代旧单元
- **WHEN** 新单元 X 与已有单元 Y 的内容相似度 > 0.75
- **THEN** 系统将单元 Y 中的卡片合并到单元 X
- **AND** 标记单元 Y 待删除

#### Scenario: 新单元不替代旧单元
- **WHEN** 新单元 X 与所有已有单元的内容相似度均 < 0.75
- **THEN** 系统保留新单元 X 为独立新单元

---

### Requirement: 循环合并控制
系统 SHALL 对合并后的新主题和新单元再次执行合并分析，最多执行 2 次循环合并操作。

#### 执行逻辑
- **第 1 轮**：执行主题合并判断 → 执行单元合并判断 → 记录结果
- **第 2 轮**：对合并后的结果再次执行主题合并判断 → 单元合并判断
- **终止条件**：本轮合并后主题/单元数量与上轮相同，或达到 2 轮上限

#### Scenario: 循环合并终止
- **WHEN** 第 1 轮合并后主题/单元数量与第 2 轮合并后相同
- **THEN** 系统停止循环合并，进入卡片生成阶段

#### Scenario: 循环合并上限
- **WHEN** 已执行 2 次循环合并操作
- **THEN** 系统强制停止循环合并，进入卡片生成阶段

---

## MODIFIED Requirements

### Requirement: 主题聚类到卡片预览的流程

~~原流程：主题确认 → AI 分类（关联已有章节/单元） → mergeSimilarUnits 合并 → 去重 → 预览~~

**新流程（强模型）**：
```
主题确认 → 新主题/新单元生成（单次调用）→ 主题合并判断（单次调用）→ 单元合并判断（单次调用）→ 循环合并(最多2次) → 去重 → 预览
```

**新流程（弱模型）**：
```
主题确认 → 新主题/新单元生成（多轮分批）→ 主题合并判断（分批调用）→ 单元合并判断（分批调用）→ 循环合并(最多2次) → 去重 → 预览
```

---

## REMOVED Requirements

### Requirement: mergeSimilarUnits 前端合并
**Reason**: 仅基于文本相似度的静态合并无法感知语义，精度低，且混淆了"新建"和"合并"职责
**Migration**: 由 AI 主题合并判断和 AI 单元合并判断替代

### Requirement: classifyCardsByCategoryContent 中的弱模型多轮分类 dispatch
**Reason**: 该函数将"新建章节/单元"和"关联已有章节/单元"混合在一次调用中，职责不清
**Migration**: 拆分为独立的 `generateNewTopicsAndUnits`（仅新建）+ `judgeTopicMerge` / `judgeUnitMerge`（合并判断）