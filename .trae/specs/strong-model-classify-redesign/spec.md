# 强模型归类流程重新设计 Spec

## Why
当前强模型归类 prompt 对新章节创建门槛过高（5 张以上才允许），且不分场景统一发送全部上下文，导致：
- 卡片数量少时 AI 不敢创建新章节，全部硬塞进现有章节
- 卡片数量多时 prompt 过长，AI 容易出错
- 出现"一个单元一个章节"的异常结构

## What Changes
- 新增**阈值判断**：根据现有卡片总数（从章节+未归章单元下统计）是否超过 200 张，选择两条路径
- **路径 A（小数据，≤200 张）**：一次发送全部上下文，AI 自由判断归类+创建新章节/单元，门槛降低
- **路径 B（大数据，>200 张）**：多轮分批处理，每批 3 个章节，前 N 轮仅归类（不创建），最终轮创建新章节/单元
- 使用 `Set` 精确追踪已归类/未归类卡片，防止遗漏
- 降低新章节创建门槛：从"5 张"改为"2 张"

## Impact
- Affected specs: ai-classify-chapter-fix
- Affected code: `src/services/aiService.js`（classifyCardsByCategoryContent 函数）

## ADDED Requirements

### Requirement: 阈值判断双路径
系统 SHALL 在强模型归类时，根据现有卡片总数（章节下卡片 + 未归章单元下卡片）是否超过 200 张选择路径。

#### Scenario: 小数据路径
- **WHEN** 现有卡片总数 ≤ 200 张
- **THEN** 系统 SHALL 一次性发送全部上下文（章节+单元+示例卡片），AI 自由判断归类+创建新章节/单元

#### Scenario: 大数据路径
- **WHEN** 现有卡片总数 > 200 张
- **THEN** 系统 SHALL 进入多轮分批处理模式

### Requirement: 多轮分批处理
系统 SHALL 在大数据路径中按每批 3 个章节分批调用 AI。

#### Scenario: 前 N 轮仅归类
- **WHEN** 存在尚未遍历的章节且仍有未归类卡片
- **THEN** 系统 SHALL 取下一批章节（3 个）+ 全部未归类卡片发送给 AI
- **AND** AI SHALL 仅将卡片归入本批现有结构（禁止创建新章节/单元）
- **AND** 系统 SHALL 用 `classifiedSet` 追踪已归类卡片

#### Scenario: 最终轮创建新结构
- **WHEN** 所有章节已遍历完，且仍有未归类卡片
- **THEN** 系统 SHALL 将剩余卡片发送给 AI，AI 创建新章节/单元（≥2 张同主题即可创建）

#### Scenario: 无进度提前终止
- **WHEN** 某一轮 AI 返回 0 条归类结果
- **THEN** 系统 SHALL 直接进入最终轮（创建新章节/单元）

## MODIFIED Requirements

### Requirement: 新章节创建门槛降低
系统 SHALL 将新章节创建条件从"5 张以上"降低为"2 张以上"。

#### Scenario: 2 张同主题新卡片
- **WHEN** 2 张以上新卡片属于同一主题且现有章节无法合理覆盖
- **THEN** AI SHALL 建议创建新章节

### Requirement: 未归类卡片精确追踪
系统 SHALL 使用 `classifiedSet`（Set<原始索引>）精确追踪每张新卡片的归类状态。

#### Scenario: 卡片追踪
- **WHEN** 每轮结束后
- **THEN** 系统 SHALL 将 AI 返回的临时索引通过 `indexMap` 映射回原始索引并加入 `classifiedSet`
- **AND** 下一轮仅发送 `classifiedSet` 中不存在的卡片