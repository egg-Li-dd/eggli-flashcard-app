# 强模型与弱模型分类系统 - 实施计划

## 项目概述
本项目旨在为考研知识点记忆应用构建完整的智能分类系统，涵盖智能单元整理、AI全权分类和指定分类归类三大核心功能。项目分为五个阶段：基础架构重构、核心功能实现、异常处理完善、UI优化和测试验证。

---

## 阶段一：基础架构重构（第1-2天）

### [x] Task 1.1: 统一AI服务接口抽象层
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 创建统一的AI服务接口层 `AiServiceInterface`，定义标准方法签名
  - 实现强模型适配器（DeepSeekAdapter、DashscopeAdapter、VolcanoAdapter）
  - 实现弱模型适配器（SparkLiteAdapter）
  - 建立模型选择策略模式，根据配置自动选择适配器
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-1.1.1: 验证所有模型适配器实现统一接口
  - `programmatic` TR-1.1.2: 验证模型选择策略正确选择适配器
- **Notes**: 确保接口层支持知识点提取、主题聚类、单元规划等核心操作

### [x] Task 1.2: 分类流程状态机设计
- **Priority**: P0
- **Depends On**: Task 1.1
- **Description**:
  - 设计分类流程状态机（IDLE → EXTRACTING → CLUSTERING → GENERATING → MERGING → COMPLETED）
  - 实现状态转换逻辑和状态管理
  - 添加状态监听机制，支持UI响应式更新
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-1.2.1: 验证状态机正确转换
  - `programmatic` TR-1.2.2: 验证状态监听机制工作正常
- **Notes**: 状态机需支持中断和恢复机制

### [x] Task 1.3: 数据传递模型标准化
- **Priority**: P0
- **Depends On**: Task 1.1
- **Description**:
  - 定义标准化数据模型（KnowledgePoint、Topic、Unit、Chapter、CardAssignment）
  - 实现数据模型的序列化/反序列化
  - 建立数据校验器，确保数据完整性
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-1.3.1: 验证数据模型完整性校验
  - `programmatic` TR-1.3.2: 验证序列化/反序列化正确性
- **Notes**: 数据模型需兼容新旧两种格式

---

## 阶段二：核心功能实现（第3-5天）

### [x] Task 2.1: 智能单元整理功能实现
- **Priority**: P0
- **Depends On**: Task 1.1, Task 1.2, Task 1.3
- **Description**:
  - 实现 `reorganizeUnits` 函数，支持章节上下文
  - 强模型路径：单次调用完成单元重新规划
  - 弱模型路径：分批调用，合并结果
  - 添加返回结构验证，确保所有卡片被分配
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1.1: 验证强模型路径返回有效单元结构
  - `programmatic` TR-2.1.2: 验证弱模型路径返回有效单元结构
  - `programmatic` TR-2.1.3: 验证所有卡片都被分配（无丢失）
- **Notes**: 参考现有的 `reorganizeUnits` 实现

### [x] Task 2.2: AI全权分类功能实现
- **Priority**: P0
- **Depends On**: Task 1.1, Task 1.2, Task 1.3
- **Description**:
  - 实现知识点提取功能（强/弱模型双路径）
  - 实现主题聚类功能，支持三种粒度
  - 实现新主题/单元生成功能
  - 实现合并判断功能（主题合并、单元替换）
  - 实现循环合并控制（最多2轮）
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-2.2.1: 验证知识点提取数量合理（5-50个）
  - `programmatic` TR-2.2.2: 验证主题聚类生成4-8个主题
  - `programmatic` TR-2.2.3: 验证合并判断正确识别相似主题
- **Notes**: 参考现有的 `clusterKnowledgePointsByTopic` 和 `loopMergeControl` 实现

### [x] Task 2.3: 指定分类归类功能实现
- **Priority**: P1
- **Depends On**: Task 1.1, Task 1.2, Task 1.3
- **Description**:
  - 实现用户确认主题后的卡片分配逻辑
  - 支持手动调整主题分组（编辑、删除、新增）
  - 支持重新聚类（简模式/详模式）
  - 添加超时降级：AI无响应时使用用户确认的主题
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgment` TR-2.3.1: 验证主题分组编辑功能正常
  - `programmatic` TR-2.3.2: 验证超时降级机制触发
- **Notes**: 参考现有的 `handleTopicConfirm` 实现

---

## 阶段三：异常处理完善（第6-7天）

### [x] Task 3.1: JSON解析异常处理增强
- **Priority**: P0
- **Depends On**: Task 1.1
- **Description**:
  - 实现多种JSON解析策略：直接解析、边界提取、尾部逗号修复、组合策略
  - 添加markdown代码块自动移除功能
  - 实现解析失败时的降级策略（正则提取关键信息）
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-3.1.1: 验证包含代码块的响应正确解析
  - `programmatic` TR-3.1.2: 验证尾部逗号响应正确解析
- **Notes**: 参考现有的 `parseSparkResponse` 实现

### [x] Task 3.2: 超时处理机制实现
- **Priority**: P0
- **Depends On**: Task 1.2
- **Description**:
  - 为所有AI调用添加超时控制（强模型30秒，弱模型60秒）
  - 实现超时触发机制（AbortController）
  - 实现超时降级策略：使用用户确认的主题进行分类
  - 添加用户确认对话框，支持"使用默认分组"或"重试"
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-3.2.1: 验证超时触发AbortController
  - `human-judgment` TR-3.2.2: 验证超时后弹出确认对话框
- **Notes**: 参考现有的超时处理逻辑

### [x] Task 3.3: 卡片丢失防护机制
- **Priority**: P0
- **Depends On**: Task 1.3, Task 2.1, Task 2.2
- **Description**:
  - 在每个处理阶段添加卡片数量检查
  - 实现未覆盖卡片的自动分配机制
  - 添加卡片分配完整性验证
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-3.3.1: 验证卡片丢失率为0%
  - `programmatic` TR-3.3.2: 验证未覆盖卡片自动分配
- **Notes**: 参考现有的卡片分配后处理逻辑

### [x] Task 3.4: 网络异常处理
- **Priority**: P1
- **Depends On**: Task 1.1
- **Description**:
  - 添加网络请求失败时的重试机制（最多3次）
  - 实现网络异常时的明确错误提示
  - 添加网络状态检测，在离线时禁用AI功能
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgment` TR-3.4.1: 验证网络异常时错误提示清晰
  - `programmatic` TR-3.4.2: 验证离线时AI功能禁用
- **Notes**: 需考虑移动端网络不稳定的情况

---

## 阶段四：UI界面优化（第8-9天）

### [x] Task 4.1: 主题分组确认界面优化
- **Priority**: P1
- **Depends On**: Task 2.2, Task 2.3
- **Description**:
  - 重构主题分组确认界面，采用三级结构（主题——单元——知识点）
  - 添加知识点数量统计显示
  - 支持折叠/展开主题
  - 添加批量操作功能（全选、反选）
- **Acceptance Criteria Addressed**: AC-4, AC-7
- **Test Requirements**:
  - `human-judgment` TR-4.1.1: 验证三级结构清晰展示
  - `human-judgment` TR-4.1.2: 验证移动端显示正常
- **Notes**: 参考现有的 `KnowledgePointConfirm` 组件

### [x] Task 4.2: 结构变化弹窗实现
- **Priority**: P1
- **Depends On**: Task 2.2
- **Description**:
  - 实现结构变化弹窗组件
  - 展示章节分布、单元分布、结构变化说明
  - 添加前后对比功能
  - 支持确认或取消结构变更
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `human-judgment` TR-4.2.1: 验证弹窗展示完整信息
  - `human-judgment` TR-4.2.2: 验证移动端适配
- **Notes**: 需确保弹窗内容清晰易懂

### [x] Task 4.3: 操作流程优化
- **Priority**: P1
- **Depends On**: Task 1.2
- **Description**:
  - 添加每个步骤的进度提示
  - 优化按钮布局，确保移动端可见可用
  - 添加操作确认机制，防止误操作
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `human-judgment` TR-4.3.1: 验证进度提示及时显示
  - `human-judgment` TR-4.3.2: 验证按钮在移动端可见可用
- **Notes**: 参考现有的 `Category.jsx` 页面

---

## 阶段五：测试验证（第10天）

### [x] Task 5.1: 单元测试编写
- **Priority**: P0
- **Depends On**: Task 1.1, Task 1.3, Task 3.1, Task 3.3
- **Description**:
  - 编写数据模型校验单元测试
  - 编写JSON解析策略单元测试
  - 编写卡片丢失防护单元测试
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1.1: 所有单元测试通过
- **Notes**: 使用Jest或类似测试框架

### [x] Task 5.2: 集成测试编写
- **Priority**: P0
- **Depends On**: Task 2.1, Task 2.2, Task 3.2
- **Description**:
  - 编写智能单元整理功能集成测试
  - 编写AI全权分类功能集成测试
  - 编写超时降级机制集成测试
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-5
- **Test Requirements**:
  - `programmatic` TR-5.2.1: 所有集成测试通过
- **Notes**: 使用Mock AI服务响应进行测试

### [ ] Task 5.3: UI测试和手动验证
- **Priority**: P1
- **Depends On**: Task 4.1, Task 4.2, Task 4.3
- **Description**:
  - 在移动端设备上测试分类流程
  - 验证所有按钮可见可用
  - 验证弹窗自适应屏幕
  - 验证操作流程清晰
- **Acceptance Criteria Addressed**: AC-4, AC-7, AC-8
- **Test Requirements**:
  - `human-judgment` TR-5.3.1: 移动端测试通过
  - `human-judgment` TR-5.3.2: UI界面符合移动端标准

---

## 资源分配

| 资源类型 | 分配详情 |
|---------|---------|
| 开发人员 | 1名全栈开发工程师 |
| 测试人员 | 1名测试工程师（第10天） |
| AI资源 | DeepSeek、Spark Lite、Dashscope、Volcano（测试用） |
| 设备资源 | Android手机（用于移动端测试） |

---

## 风险评估与应对措施

| 风险等级 | 风险描述 | 应对措施 |
|---------|---------|---------|
| 高 | AI服务响应不稳定导致分类失败 | 实现超时降级机制，支持重试，使用Mock数据进行测试 |
| 高 | 弱模型返回格式异常导致解析失败 | 实现多种JSON解析策略，添加代码块自动移除功能 |
| 中 | 卡片数量过大导致处理超时 | 实现分批处理，每批不超过30个知识点 |
| 中 | 移动端网络不稳定 | 添加网络状态检测，实现离线模式（禁用AI功能） |
| 低 | 用户操作不熟悉导致误操作 | 添加操作确认机制，优化操作流程提示 |

---

## 质量验收标准

### 功能验收
- [ ] 智能单元整理功能：所有卡片正确分配，无丢失，支持强/弱模型
- [ ] AI全权分类功能：生成4-8个主题，每个主题2-5个单元，卡片无丢失
- [ ] 指定分类归类功能：支持手动调整主题分组，支持超时降级
- [ ] 异常处理机制：JSON解析异常、超时、网络异常都有处理方案

### 性能验收
- [ ] AI分类响应时间不超过60秒
- [ ] 卡片丢失率为0%
- [ ] 降级策略覆盖率100%

### UI验收
- [ ] 移动端所有按钮可见可用
- [ ] 弹窗自适应屏幕
- [ ] 操作流程清晰，进度提示及时

### 代码质量验收
- [ ] 代码符合项目代码规范
- [ ] 单元测试覆盖率≥70%
- [ ] 无未处理的错误和