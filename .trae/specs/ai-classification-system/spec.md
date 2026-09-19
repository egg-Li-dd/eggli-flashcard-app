# 强模型与弱模型分类系统 - 产品需求文档

## Overview
- **Summary**: 为考研知识点记忆应用制定完整的智能分类系统PRD，涵盖智能单元整理、AI全权分类和指定分类归类三大核心功能，支持强模型（DeepSeek/Dashscope/Volcano）和弱模型（讯飞Spark Lite）双路径，确保分类准确性、稳定性和用户体验。
- **Purpose**: 解决现有分类系统存在的主题聚类不准确、卡片丢失、弱模型兼容性差等问题，建立标准化的分类流程和异常处理机制。
- **Target Users**: 考研学生、知识学习用户、应用管理员

## Goals
- 建立完整的智能分类系统架构，支持三大核心功能模块
- 实现强模型与弱模型的统一接口和差异化处理策略
- 建立完善的异常处理和降级机制，确保分类流程的稳定性
- 优化UI界面和用户交互流程，提升分类体验
- 制定可执行的详细规划方案，支持 `/spec` 命令执行

## Non-Goals (Out of Scope)
- 不涉及新AI模型的集成（现有模型：DeepSeek、Spark Lite、Dashscope、Volcano）
- 不涉及数据库schema变更
- 不涉及后端服务开发（纯前端实现）
- 不涉及移动端原生代码修改

## Background & Context
当前系统已实现基础的卡片分类功能，但存在以下问题：
1. 弱模型（Spark Lite）主题聚类准确率低
2. AI分类过程中存在卡片丢失现象
3. 缺乏统一的分类流程和异常处理机制
4. 用户交互流程不够清晰

已有的核心代码文件：
- [aiService.js](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/aiService.js) - AI服务核心逻辑
- [iflytekAi.js](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/services/iflytekAi.js) - 讯飞Spark专用逻辑
- [Category.jsx](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx) - 分类页面UI

## Functional Requirements

### FR-1: 智能单元整理功能
- **FR-1.1**: 根据分类下所有卡片内容，AI自动重新规划单元结构
- **FR-1.2**: 支持章节上下文：传入existingChapters时考虑章节-单元关系
- **FR-1.3**: 支持强模型（单次调用）和弱模型（分批调用）双路径
- **FR-1.4**: 返回结构验证：确保所有卡片都被分配到某个单元/章节

### FR-2: AI全权分类功能
- **FR-2.1**: 知识点提取：从输入文本中提取原始知识点
- **FR-2.2**: 主题聚类：AI自主决定主题数量，支持简/标准/详三种粒度
- **FR-2.3**: 新主题/单元生成：仅生成新结构，不关联已有体系
- **FR-2.4**: 合并判断：判断新主题是否应合并到已有主题，新单元是否应替换已有单元
- **FR-2.5**: 循环合并控制：最多2轮合并分析，防止单元过大

### FR-3: 指定分类归类功能
- **FR-3.1**: 用户确认主题分组后，将卡片分配到指定章节/单元
- **FR-3.2**: 支持手动调整主题分组（编辑、删除、新增）
- **FR-3.3**: 支持重新聚类（简模式/详模式）
- **FR-3.4**: 超时降级：AI无响应时使用用户确认的主题进行分类

### FR-4: 异常处理机制
- **FR-4.1**: JSON解析异常处理：支持多种解析策略（直接解析、边界提取、尾部逗号修复、组合策略）
- **FR-4.2**: 超时处理：AI响应超时时自动触发降级策略
- **FR-4.3**: 卡片丢失防护：确保所有卡片都被处理，未覆盖卡片自动分配
- **FR-4.4**: 网络异常处理：网络请求失败时提供明确错误提示

### FR-5: UI界面优化
- **FR-5.1**: 主题分组确认界面采用三级结构（主题——单元——知识点）
- **FR-5.2**: 显示知识点数量统计
- **FR-5.3**: 结构变化弹窗：AI生成新主题后自动弹出，展示章节/单元分布
- **FR-5.4**: 移动端适配：确保按钮可见可用，自适应手机界面

## Non-Functional Requirements

### NFR-1: 性能要求
- **NFR-1.1**: AI分类响应时间不超过60秒（含多轮调用）
- **NFR-1.2**: 弱模型批量处理每批不超过30个知识点
- **NFR-1.3**: 卡片生成每批不超过30个知识点，支持分批处理

### NFR-2: 可靠性要求
- **NFR-2.1**: 卡片丢失率为0%（所有卡片必须被分配）
- **NFR-2.2**: 降级策略覆盖率100%（所有异常路径都有兜底方案）
- **NFR-2.3**: 并发请求控制：防止重复点击导致多次调用

### NFR-3: 用户体验要求
- **NFR-3.1**: 操作反馈及时：每个步骤显示进度提示
- **NFR-3.2**: 错误信息清晰：明确指示错误原因和解决方案
- **NFR-3.3**: 操作可撤销：支持数据快照和恢复

### NFR-4: 兼容性要求
- **NFR-4.1**: 支持强模型（DeepSeek、Dashscope、Volcano）和弱模型（Spark Lite）
- **NFR-4.2**: 兼容新旧两种数据格式（带units字段和不带units字段）
- **NFR-4.3**: 支持三种分类深度模式（chapter-and-unit、chapter-only、unit-only）

## Constraints

### Technical
- **约束1**: 弱模型（Spark Lite）上下文窗口限制：单批文本不超过3000字符
- **约束2**: 章节数限制：1-10个章节
- **约束3**: 单元数限制：每章节2-10个单元
- **约束4**: 单元卡片数限制：2-50张卡片/单元
- **约束5**: 章节名称限制：不超过12字
- **约束6**: 单元名称限制：不超过16字

### Business
- **约束1**: AI调用成本控制：优先使用已有生成内容，避免重复调用
- **约束2**: 用户体验优先：分类失败时必须有清晰的错误提示和降级方案

### Dependencies
- **依赖1**: AI服务配置（API Key、模型选择）
- **依赖2**: 本地数据库（IndexedDB）
- **依赖3**: 网络连接（用于AI API调用）

## Assumptions
- **假设1**: 用户已配置有效的AI服务API Key
- **假设2**: 设备具备网络连接能力
- **假设3**: 用户理解分类流程和操作步骤

## Acceptance Criteria

### AC-1: 智能单元整理功能验证
- **Given**: 用户在分类页面点击"智能整理"按钮，分类下有20张卡片
- **When**: AI完成单元重新规划
- **Then**: 返回有效的单元结构，所有卡片都被分配到某个单元，无重复分配
- **Verification**: `programmatic`
- **Notes**: 支持强模型和弱模型路径

### AC-2: AI全权分类功能验证（强模型）
- **Given**: 用户输入30个知识点，使用强模型（DeepSeek）
- **When**: 执行完整分类流程（知识点提取→主题聚类→新主题/单元生成→合并判断）
- **Then**: 生成4-8个主题，每个主题2-5个单元，所有卡片正确分配，无丢失
- **Verification**: `programmatic`

### AC-3: AI全权分类功能验证（弱模型）
- **Given**: 用户输入30个知识点，使用弱模型（Spark Lite）
- **When**: 执行完整分类流程（多轮分批处理）
- **Then**: 生成4-8个主题，所有卡片正确分配，无丢失，支持降级策略
- **Verification**: `programmatic`

### AC-4: 指定分类归类功能验证
- **Given**: 用户在主题确认界面调整主题分组
- **When**: 点击"确认"按钮
- **Then**: 卡片按用户确认的主题分配到对应的章节/单元，主题数量符合用户选择
- **Verification**: `human-judgment`

### AC-5: 超时降级机制验证
- **Given**: AI服务响应超时（60秒）
- **When**: 系统触发超时处理
- **Then**: 自动使用用户确认的主题进行降级分配，显示确认对话框，用户可选择"使用默认分组"或"重试"
- **Verification**: `programmatic`

### AC-6: JSON解析异常处理验证
- **Given**: AI返回包含markdown代码块的JSON响应（弱模型常见）
- **When**: 系统解析响应
- **Then**: 自动移除代码块标记，正确解析JSON内容
- **Verification**: `programmatic`

### AC-7: UI界面验证（移动端）
- **Given**: 在手机端打开分类页面
- **When**: 执行分类操作
- **Then**: 所有按钮可见可用，弹窗自适应屏幕，操作流程清晰
- **Verification**: `human-judgment`

### AC-8: 结构变化弹窗验证
- **Given**: AI生成新主题完成
- **When**: 合并判断完成后
- **Then**: 自动弹出结构变化弹窗，展示章节分布、单元分布、结构变化说明和前后对比
- **Verification**: `human-judgment`

## Open Questions
- [ ] 是否需要支持跨分类的单元整理功能？
- [ ] 是否需要增加分类结果的编辑和调整功能？
- [ ] 是否需要增加分类历史记录功能？
- [ ] 是否需要支持批量导入分类结构？