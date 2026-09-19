# 弱模型卡片生成数据丢失修复 Spec

## Why
使用弱模型（Spark Lite）进行卡片生成时，从知识点→卡片生成→主题分组确认的整个流程中存在严重的数据丢失和索引错位问题。39 个知识点被分为 2 批（30+9）生成卡片，但最终仅剩 9 张卡片（第二批），且 kpIndex 为 60-68（超出 kpMarkers 范围 0-38），导致后续 `generateNewTopicsAndUnits` 直接映射全部失败，只能回退到 AI 聚类（浪费 5 次额外的 API 调用）。

## 日志关键发现

### 问题 1: 卡片数量丢失（39 → 9）
- Line 2: `flatNewCardsLength: 9` — 仅剩 9 张卡片
- 第一批（30 张，offset=0）的卡片未被包含在最终结果中
- 可能原因：JSON 解析失败、所有卡片被过滤（空 front/back）、或异常被静默吞掉

### 问题 2: kpIndex 双重偏移（60-68 而非 0-38）
- Line 30: `kpIndex=60` 开始，而 kpMarkers 范围为 0-38
- 根因：`generateCardsFromKnowledgePoints` 的 prompt 已使用全局索引 `__KP_${offset+i}__`（L946-948），但 `mergeBatchCardResults` 又叠加了 offset（L1600-1602: `globalIdx = offset + localIdx`）
- 第二批 offset=30，AI 返回 kpMarker `__KP_30__`~`__KP_38__`，叠加后变成 60-68

### 问题 3: 直接映射全部失败，浪费 AI 调用
- Line 28: `assignments=0` — 无任何卡片被成功分配到主题-单元
- 被迫回退到弱模型 AI 聚类（Line 603），额外消耗 5 次 Spark Lite API 调用（1 次 Round1 + 4 次 Round2）
- 即使 AI 聚类成功，卡片被分配到错误的单元（如"RAM特点"被分到"计算机硬件系统"而非"存储器"）

## What Changes
- **核心修复 1**：修复 `mergeBatchCardResults` 中的 kpMarker 双重偏移问题 — 直接保留 AI 返回的全局标记
- **核心修复 2**：增强 `generateCardsFromKnowledgePoints` 批处理错误处理 — 确保所有批次结果都被包含
- 添加批处理级别的数据完整性日志，便于追踪每批的卡片生成和过滤情况
- 更新规格文档以反映实际根因

## Impact
- Affected specs: weak-model-data-loss-fix（本 spec）
- Affected code: 
  - `src/services/aiService.js` (`mergeBatchCardResults` L1597-1603, `generateCardsFromKnowledgePoints` L941-994)

## 数据流分析（修正后）

### 实际流程（弱模型路径）
```
Step 1: 知识点确认 (39 KP)
  ↓
卡片生成: generateCardsFromKnowledgePoints
  → Batch 1: offset=0, 30 KP, prompt 带 __KP_0__~__KP_29__
  → Batch 2: offset=30, 9 KP, prompt 带 __KP_30__~__KP_38__
  ↓
mergeBatchCardResults:
  → Batch 1: AI 返回 kpMarker __KP_0__~__KP_29__
    → 代码叠加 offset: 0+0=0 ~ 0+29=29 ✓ 正确
    → 但第一批卡片可能被过滤或丢失 ✗
  → Batch 2: AI 返回 kpMarker __KP_30__~__KP_38__
    → 代码叠加 offset: 30+30=60 ~ 30+38=68 ✗ 双重偏移！
  → 最终: 仅 9 张卡片，kpIndex 60-68
  ↓
Step 2: 主题分组确认 (TopicConfirmModal)
  → flatNewCards: 9 张，kpIndex 60-68
  → kpMarkers: 39 个，索引 0-38
  → 数据一致性检查通过（数量检查通过，但索引不匹配未检测）
  ↓
Step 2→3: generateNewTopicsAndUnits (直接映射路径)
  → 匹配 card.kpIndex (60-68) === unit.pointIndices (0-38)
  → 全部失败：assignments=0
  → kpIndexMap 大小 39，覆盖 0-38，但卡片 kpIndex 为 60-68
  → kpIndex 补充：0 卡片（无需补充）
  → pointIndices 回退：0 卡片
  → 文本匹配回退：+0 成功, 9 失败
  ↓
Step 2→3: 回退到弱模型 AI 聚类（浪费 5 次 API 调用）
  → Round 1: 分配卡片到主题（4 条分配 + 5 条补全）
  → Round 2: 5 个章节内分组为单元（5 次 API 调用）
  → 最终 assignments=9，但分配给错误的单元
```

## ADDED Requirements

### Requirement: kpMarker 全局索引一致性
系统 SHALL 确保 `mergeBatchCardResults` 中 kpMarker 的全局索引与 `generateCardsFromKnowledgePoints` 的 prompt 中的全局索引一致，不进行双重偏移。

#### Scenario: 单批处理
- **WHEN** 只有一批知识点（offset=0）
- **THEN** AI 返回 kpMarker `__KP_0__`~`__KP_N__`
- **AND** mergeBatchCardResults 直接保留 AI 返回的 kpMarker
- **AND** kpIndex 与 kpMarkers 范围一致

#### Scenario: 多批处理
- **WHEN** 有两批知识点（offset=0, offset=30）
- **THEN** 第一批 AI 返回 kpMarker `__KP_0__`~`__KP_29__`
- **AND** 第二批 AI 返回 kpMarker `__KP_30__`~`__KP_38__`
- **AND** mergeBatchCardResults 直接保留所有批次的 kpMarker
- **AND** 最终 kpIndex 范围为 0-38

### Requirement: 批处理卡片完整性
系统 SHALL 确保 `generateCardsFromKnowledgePoints` 的每一批处理结果都被正确包含在最终输出中，不丢失任何批次。

#### Scenario: 所有批次成功
- **WHEN** 两批处理均成功返回
- **THEN** `allResults` 包含两批的结果
- **AND** `mergeBatchCardResults` 合并两批的所有卡片
- **AND** 最终卡片数量 = 第一批卡片数 + 第二批卡片数

#### Scenario: 批次 JSON 解析失败
- **WHEN** 某批次的 JSON 解析失败
- **THEN** 系统记录详细错误日志（包含批次号、offset、原始内容片段）
- **AND** 尝试 `extractCardsFromBrokenJson` 降级恢复
- **AND** 如仍无法恢复，抛出明确异常（包含批次号）

### Requirement: 批处理数据完整性日志
系统 SHALL 在 `mergeBatchCardResults` 中为每个批次输出详细的处理日志。

#### Scenario: 每批处理完成
- **WHEN** mergeBatchCardResults 处理完一个批次
- **THEN** 输出日志包含：批次 offset、原始卡片数、过滤后卡片数、过滤原因统计

## MODIFIED Requirements

### Requirement: mergeBatchCardResults kpMarker 处理
原逻辑：`globalIdx = offset + localIdx`（双重偏移）
新逻辑：直接保留 AI 返回的 kpMarker 值（因为 prompt 中已使用全局索引）

### Requirement: generateCardsFromKnowledgePoints 批处理遍历
原逻辑：使用 `for` 循环同步处理批次
保持不变：重试机制、错误处理、进度回调均保持

## REMOVED Requirements
无