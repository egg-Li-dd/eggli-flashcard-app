# 分类流程全面优化与根因修复 Spec

## Why

用户反馈：智能单元整理功能持续弹出"AI 调用失败或未配置服务"警告，即使 Network 面板显示 200 OK 响应。经全流程代码审查，发现核心根因为 `convertAssignResultToValidateFormat` 函数存在**作用域引用 bug**（引用了未传入的 `selectedCards` 变量），导致每次调用都抛出 `ReferenceError`，被 try-catch 捕获后触发 fallback，从而显示警告。

同时发现三大分类功能（智能单元整理、AI 全权归类、指定分类归类）存在多处逻辑漏洞、数据处理不当、分类目的未完整传递等问题，需要系统性优化。

## 根因分析

### 问题 1: `convertAssignResultToValidateFormat` 作用域 bug（CRITICAL）

- **位置**: [aiService.js:8391-8425](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js#L8391-L8425)
- **现象**: 函数签名为 `convertAssignResultToValidateFormat(assignResult)`，但函数体第 8407 行引用 `selectedCards.findIndex(...)`，而 `selectedCards` 既不是参数也不在闭包作用域内
- **影响**: 每次调用必抛 `ReferenceError: selectedCards is not defined`
- **波及范围**:
  - `classifySameCategoryReorganize` (L5746) → 智能单元整理
  - `classifyCrossCategoryAuto` (L6360) → AI 全权归类
  - 指定分类归类（复用 `same-category-reorganize` 模式）
- **结果**: AI 实际返回 200 OK 且 JSON 正确，但校验步骤抛错 → catch 块触发 `fallbackResult()` → `usedFallback: true` → 显示警告

### 问题 2: `convertValidateFormatToAssignResult` 索引映射错误

- **位置**: [aiService.js:8434-8472](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js#L8434-L8472)
- **现象**: 构建 `cardIndexToCard` Map 时使用顺序自增索引 `i`（L8443-8446），但 `validatedResult` 中的 `cardIndices` 指向原始卡片在 `selectedCards` 中的位置
- **影响**: 即使修复问题 1，修正后的卡片分配会错位

### 问题 3: `validateStructurePlan` 校验过严

- **位置**: [aiService.js:7985-7987](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js#L7985-L7987)
- **现象**: 强制要求每个章节至少 2 个单元（`if (units.length < 2)`）
- **影响**: AI 返回 1 个单元的章节时校验失败，`fixStructurePlan` 不一定能修正，导致 fallback

### 问题 4: 分类目的未完整传递

- `assignCards` 的 prompt（L8236 起）未包含 `categoryPurpose`
- `classifyCrossCategoryAuto` 的 unit-only 模式 prompt 未包含 `categoryPurpose`
- `assignCardsSingleBatch` 函数签名未接收 `categoryPurpose`

### 问题 5: `classifyCrossCategoryAuto` 本地聚类与"AI 全权"矛盾

- **位置**: [aiService.js:6336](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js#L6336)
- **现象**: chapter-and-unit 模式下先用本地 `clusterCardsByTopic` 聚类成多个分类，再对每个聚类调用 `planStructure` + `assignCards`
- **影响**: "AI 全权归类"实际由本地算法决定分类数量和归属，AI 只负责子结构规划，与"全权"语义矛盾

### 问题 6: `assignCards` 批次失败降级可能丢卡

- **位置**: [aiService.js:8209-8214](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js#L8209-L8214)
- **现象**: 批次失败时调用 `localFallbackAssign`，但该函数未保证覆盖所有卡片
- **影响**: 大数据量场景下可能丢失卡片

## What Changes

### 核心修复

- **修复 `convertAssignResultToValidateFormat`**: 增加 `selectedCards` 参数，建立 `card.id → index` 映射，正确转换格式
- **修复 `convertValidateFormatToAssignResult`**: 使用 `cardIndex → card` 的正确映射，基于原始卡片数组构建
- **放宽 `validateStructurePlan`**: 允许章节包含 1 个单元（降为 warning，不报 error）
- **统一分类目的传递**: 在 `assignCards`、`assignCardsSingleBatch`、所有分类 prompt 中注入 `categoryPurpose`

### 逻辑优化

- **重构 `classifyCrossCategoryAuto` chapter-and-unit 模式**: 改为真正的 AI 全权归类——一次性让 AI 规划分类+章节+单元结构，而非本地聚类后多次调用
- **增强 `assignCards` 批次降级**: 确保降级路径覆盖所有输入卡片，添加完整性校验
- **优化 `fixStructurePlan`**: 对单单元章节自动补充默认单元，而非丢弃

### 防御性增强

- 在 `classifySameCategoryReorganize` 和 `classifyCrossCategoryAuto` 的 try-catch 中区分"AI 调用失败"与"数据处理 bug"，前者降级，后者抛出明确错误
- 添加详细的阶段日志，便于定位问题

## Impact

- **Affected specs**: 
  - `ai-classification-system`（基础架构）
  - `ai-classification-two-step`（两步法架构）
  - `strong-model-classify-redesign`（强模型归类）
  - `weak-model-data-loss-fix`（弱模型数据丢失修复）
- **Affected code**: 
  - [aiService.js](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js) — 核心修复与优化
  - [Category.jsx](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx) — 调用点参数传递
- **Affected features**: 智能单元整理、AI 全权归类、指定分类归类

## ADDED Requirements

### Requirement: 分类目的全链路传递

系统 SHALL 在所有分类相关 AI 调用中传递 `categoryPurpose`，包括结构规划、卡片分配、跨分类归类。

#### Scenario: 智能单元整理传递分类目的
- **WHEN** 用户执行智能单元整理
- **THEN** `planStructure` 和 `assignCards` 的 prompt SHALL 包含分类目的上下文
- **AND** AI SHALL 根据分类目的调整章节/单元命名和结构

#### Scenario: AI 全权归类传递分类目的
- **WHEN** 用户执行 AI 全权归类
- **THEN** 跨分类归类 prompt SHALL 包含分类目的
- **AND** AI SHALL 根据分类目的决定分类数量和层级

#### Scenario: 指定分类归类传递分类目的
- **WHEN** 用户选择目标分类执行归类
- **THEN** 系统 SHALL 使用目标分类的分类目的
- **AND** prompt SHALL 包含该目的作为归类参考

### Requirement: 错误分类与降级策略

系统 SHALL 区分"AI 服务调用失败"与"数据处理逻辑错误"，采用不同处理策略。

#### Scenario: AI 调用失败
- **WHEN** AI 返回非 200 状态、超时或网络异常
- **THEN** 系统 SHALL 降级到本地 fallback
- **AND** 显示"AI 调用失败，已使用本地方案"提示

#### Scenario: 数据处理逻辑错误
- **WHEN** AI 返回 200 OK 但本地解析/校验/转换抛出异常
- **THEN** 系统 SHALL 记录详细错误日志（包含堆栈）
- **AND** 系统 SHALL 仍尝试降级，但日志中明确标注"数据处理异常"而非"AI 调用失败"
- **AND** 系统 SHALL 在控制台输出 `[classifyBug]` 前缀日志便于定位

### Requirement: 真正的 AI 全权归类

系统 SHALL 在 `classifyCrossCategoryAuto` 的 chapter-and-unit 模式下，由 AI 一次性决定分类、章节、单元三级结构，而非本地预聚类。

#### Scenario: AI 全权归类 chapter-and-unit 模式
- **WHEN** 用户选择 AI 全权归类且分类深度为 chapter-and-unit
- **THEN** 系统 SHALL 一次性发送所有卡片给 AI
- **AND** AI SHALL 返回完整的 categories→chapters→units→cardIndices 四级结构
- **AND** 系统 SHALL 校验所有卡片被分配且无重复

## MODIFIED Requirements

### Requirement: `convertAssignResultToValidateFormat` 正确转换

原逻辑：引用未定义的 `selectedCards` 变量
新逻辑：接受 `selectedCards` 参数，建立 `card.id → index` 映射

#### Scenario: 正常转换
- **WHEN** assignCards 返回 `{ chapters: [{ units: [{ cards: [cardObj] }] }] }`
- **THEN** 函数 SHALL 通过 `selectedCards` 参数找到 cardObj 的索引
- **AND** 返回 `{ chapters: [{ units: [{ cardIndices: [idx] }] }] }`

### Requirement: `convertValidateFormatToAssignResult` 正确还原

原逻辑：使用顺序自增索引构建 Map
新逻辑：基于 `selectedCards` 数组构建 `index → card` 映射

#### Scenario: 修正结果还原
- **WHEN** fixClassificationResult 返回 `{ chapters: [{ units: [{ cardIndices: [0, 2] }] }] }`
- **THEN** 函数 SHALL 通过 `selectedCards[0]` 和 `selectedCards[2]` 获取卡片对象
- **AND** 返回 `{ chapters: [{ units: [{ cards: [card0, card2] }] }] }`

### Requirement: `validateStructurePlan` 放宽单元数校验

原逻辑：每章节单元数 < 2 报 error
新逻辑：每章节单元数 < 2 报 warning，不阻断流程

#### Scenario: 章节含 1 个单元
- **WHEN** AI 返回的章节只有 1 个单元
- **THEN** 校验 SHALL 产生 warning 而非 error
- **AND** `fixStructurePlan` SHALL 尝试补充默认单元或合并到其他章节

### Requirement: `assignCards` 批次降级完整性保证

原逻辑：批次失败时调用 `localFallbackAssign`，不保证覆盖
新逻辑：降级后校验卡片数，未覆盖卡片强制分配到"未归类"单元

#### Scenario: 批次降级后补全
- **WHEN** 某批次 AI 调用失败触发降级
- **THEN** 降级结果 SHALL 包含该批次所有卡片
- **AND** 如有遗漏，系统 SHALL 将遗漏卡片分配到"未归类"单元

## REMOVED Requirements

### Requirement: `classifyCrossCategoryAuto` 本地预聚类

**Reason**: 与"AI 全权归类"语义矛盾，本地聚类决定分类数量后 AI 只负责子结构，无法实现真正的全权重构
**Migration**: 改为一次性 AI 调用，由 AI 决定完整的 categories→chapters→units 结构
