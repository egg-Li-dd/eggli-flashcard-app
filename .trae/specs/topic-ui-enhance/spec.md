# 主题分组界面 UI 与功能优化 Spec

## Why
当前主题分组流程存在以下问题：
1. 主题聚类（`clusterKnowledgePointsByTopic`）仅输出主题+知识点索引，无单元级别
2. 卡片生成后的 `generateNewTopicsAndUnits` 重新基于卡片内容聚类单元，与阶段1的原始知识点分组脱节
3. 两次独立聚类可能产生不一致（同一知识点生成的卡片被分到不同单元）
4. "简"模式点击后无即时反馈
5. AI 合并完成后无可视化反馈，用户无法理解分类体系变化

## What Changes
- **核心修复**：主题聚类阶段同步生成单元归类，消除两次聚类脱节
- 主题展示从两级改为三级："主题 → 单元 → 知识点"
- "简"/"详"按钮强制主题数量变化并即时反馈
- 新增合并结果弹窗

## Impact
- Affected specs: knowledge-flow-restructure
- Affected code: `src/services/aiService.js` (clusterKnowledgePointsByTopic), `src/pages/Category.jsx` (TopicConfirmModal)

## ADDED Requirements

### Requirement: 主题聚类阶段同步生成单元归类
系统 SHALL 在 `clusterKnowledgePointsByTopic` 阶段同步生成单元分组，消除后续 `generateNewTopicsAndUnits` 中重新聚类产生的冲突。

#### 数据流变更
**原流程**：
```
原始知识点 → clusterKnowledgePointsByTopic → 仅主题 → generateNewTopicsAndUnits(重新基于卡片聚类) → 单元
```

**新流程**：
```
原始知识点 → clusterKnowledgePointsByTopic → 主题+单元 → generateNewTopicsAndUnits(直接复用单元，不重新聚类) → 单元
```

#### 输出格式变更
```json
// 原格式
[{"topicName":"主题名","pointIndices":[0,1,2]}]

// 新格式
[{"topicName":"主题名","units":[{"unitName":"单元名","pointIndices":[0,1]},{"unitName":"另一单元","pointIndices":[2]}]}]
```

#### Scenario: 强模型同步生成单元
- **WHEN** 使用强模型进行主题聚类
- **THEN** prompt 中增加单元分组要求："每个主题下按语义再细分为2-5个单元"
- **AND** 输出格式包含 `topicName` + `units[{unitName, pointIndices}]`

#### Scenario: 弱模型同步生成单元
- **WHEN** 使用 Spark Lite 进行主题聚类
- **THEN** 同样在 prompt 中增加单元分组要求
- **AND** 输出格式与强模型一致

#### Scenario: AI 未返回单元信息（兼容旧格式）
- **WHEN** AI 返回的数据中不包含 `units` 字段
- **THEN** 系统自动将每个主题的所有知识点归入一个"基础"单元

### Requirement: 三级层级展示
系统 SHALL 在主题分组确认界面以"主题 → 单元 → 知识点"三级结构展示聚类结果。

#### Scenario: 正常三级展示
- **WHEN** 用户进入主题确认界面
- **THEN** 每个主题显示为可展开/折叠的卡片
- **AND** 展开后显示该主题下的单元列表
- **AND** 每个单元下显示知识点预览（最多3个）
- **AND** 知识点数量统计格式为"X 个知识点 · Y 个单元"

### Requirement: "简"/"详"模式强制主题数量变化
系统 SHALL 在用户点击"简"或"详"按钮后，即时反馈并强制 AI 按方向调整主题数量。

#### Scenario: 简模式
- **WHEN** 用户点击"简"
- **THEN** toast 提示："当前 N 个主题，正在简化..."
- **AND** 向 AI 发送指令，要求生成比当前更少的主题（目标：N-1 到 N-3）
- **AND** 已最简时（1-2个主题）提示"已是最简主题分组"

#### Scenario: 详模式
- **WHEN** 用户点击"详"
- **THEN** toast 提示："当前 N 个主题，正在细分..."
- **AND** 向 AI 发送指令，要求生成比当前更多的主题（目标：N+1 到 N+3）

### Requirement: 合并结果弹窗
系统 SHALL 在 AI 卡片分类完成后自动弹出合并结果弹窗。

#### 弹窗内容
- 标题："知识体系结构调整完成"
- 变化说明（如"主题 A 已与主题 B 合并"）
- 章节分布 + 单元分布
- "确认并预览卡片"按钮

### Requirement: generateNewTopicsAndUnits 复用单元结构
系统 SHALL 修改 `generateNewTopicsAndUnits` 使其直接复用主题聚类阶段生成的单元结构，不再重新基于卡片聚类。

#### Scenario: 直接复用单元
- **WHEN** 主题聚类已完成（含单元信息）
- **THEN** `generateNewTopicsAndUnits` 直接使用 `finalTopics` 中的 `units` 字段
- **AND** 不再调用 AI 重新聚类单元
- **AND** 仅将卡片按 `kpIndex` 映射到对应的主题和单元

## MODIFIED Requirements

### Requirement: clusterKnowledgePointsByTopic 输出格式
原输出：`[{topicName, pointIndices}]`
新输出：`[{topicName, units: [{unitName, pointIndices}]}]`

### Requirement: generateNewTopicsAndUnits 流程
原流程：基于卡片内容重新聚类单元
新流程：直接复用主题聚类阶段的单元结构，按 kpIndex 映射

## REMOVED Requirements
无