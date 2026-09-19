# NewCardPanel 章节级分组预览 Spec

## Why
AI 生成卡片后，`classifyCardsByCategoryContent` 正确返回了 chapterId/chapterName 信息，卡片数据中也携带了 `chapterId`/`chapterName` 字段。但 NewCardPanel 预览界面仅按"单元"分组（现有单元/新单元），不展示章节层级，导致：
1. 用户看不到 AI 创建的新章节结构
2. 14 张卡片全显示在"新单元"中，看起来像没有章节分类
3. 统计栏只显示"加入现有单元 0 张 · 新单元 14 张"，缺少章节维度信息

## What Changes
- **BREAKING** NewCardPanel 分组逻辑从"单元级"改为"章节→单元"两级
- 统计栏增加章节数量信息
- 每个章节组显示章节名称和标签（现有章节/新章节）
- 章节内按单元分组展示卡片

## Impact
- Affected specs: strong-model-classify-redesign
- Affected code: `src/components/NewCardPanel.jsx`

## MODIFIED Requirements

### Requirement: 章节→单元两级分组
系统 SHALL 在 NewCardPanel 中按"章节→单元"两级结构展示卡片，替代原有的仅按单元分组。

#### Scenario: 有章节的卡片
- **WHEN** 卡片携带 `chapterId` 或 `chapterName` 字段
- **THEN** 系统 SHALL 先按章节分组，再在章节内按单元分组

#### Scenario: 无章节的卡片
- **WHEN** 卡片不携带任何章节信息
- **THEN** 系统 SHALL 归入"未归章"组，按单元分组展示

### Requirement: 章节标签区分
系统 SHALL 用不同标签区分现有章节和新章节。

#### Scenario: 现有章节
- **WHEN** 卡片归入已有章节（chapterId 匹配 existingChapters 中的 id）
- **THEN** 显示"现有章节"标签（蓝色）

#### Scenario: 新章节
- **WHEN** 卡片归入 AI 新创建的章节（chapterId 为 null 但有 chapterName）
- **THEN** 显示"🆕 新章节"标签（橙色/警告色）

### Requirement: 统计栏增加章节维度
系统 SHALL 在统计栏中显示章节和单元的数量信息。

#### Scenario: 有章节和单元
- **WHEN** 卡片中包含章节和单元信息
- **THEN** 统计栏显示"新章节 X 个 · 现有章节 X 个 · 新单元 X 张 · 现有单元 X 张"

#### Scenario: 仅有单元
- **WHEN** 卡片中无章节信息
- **THEN** 统计栏保持原有显示"加入现有单元 X 张 · 新单元 X 张"