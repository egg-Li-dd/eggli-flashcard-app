# Vosk 模型下载连接问题修复 - 任务列表

## [x] Task 1: 增加连接阶段实时状态反馈（倒计时 + 重试次数）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在原生下载线程中增加连接阶段的进度事件（每秒发送一次）
  - 事件中包含剩余超时时间、当前重试次数、总共重试次数
  - 前端监听并显示倒计时和重试状态
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 连接阶段每秒发送一次进度事件，包含 countdown/retryCount 字段
  - `programmatic` TR-1.2: 前端 UI 显示 "正在连接服务器...（5s / 第 1 次重试）" 格式
  - `human-judgement` TR-1.3: 倒计时数字变化流畅，状态切换自然
- **Notes**: 倒计时从 10 秒开始，每次重试重置

## [x] Task 2: 实现多下载源自动 fallback 机制
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 原生端新增 downloadModelWithFallback 方法，接收多个下载 URL 数组
  - 按顺序尝试每个下载源，失败自动切换下一个
  - 切换时发送 sourceChanged 事件通知前端
  - 前端增加下载源切换状态显示
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 第一个源失败后自动切换到第二个源
  - `programmatic` TR-2.2: 切换时发送 sourceChanged 事件，包含 fromSource/toSource
  - `human-judgement` TR-2.3: 用户可以看到 "正在切换到 xxx 下载源" 提示
- **Notes**: 切换顺序：主源 → GitHub → 蓝奏云

## [x] Task 3: 增加网络连通性预检查
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 下载前使用 ConnectivityManager 检查网络连接状态
  - 无网络时立即返回错误，不进入下载流程
  - 网络类型提示（Wi-Fi / 移动数据）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 飞行模式下点击下载立即提示"无网络连接"
  - `programmatic` TR-3.2: Wi-Fi 和移动网络均可正常进入下载流程
  - `human-judgement` TR-3.3: 错误提示清晰，包含"请检查网络连接"建议
- **Notes**: 需要 ACCESS_NETWORK_STATE 权限

## [x] Task 4: 断点续传异常自动恢复
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - Range 请求返回 416 时自动删除旧文件并重新下载
  - 下载前检查临时文件完整性（简单校验）
  - 文件大小异常（大于预期）时自动清理
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 损坏的临时文件会被自动删除并重新下载
  - `programmatic` TR-4.2: Range 416 错误时自动回退到完整下载
  - `human-judgement` TR-4.3: 用户看到 "检测到不完整文件，重新开始下载" 提示
- **Notes**: 避免用户因中断下载后无法继续而困惑

## [x] Task 5: 错误诊断信息增强
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 细化错误类型分类（网络断开、DNS失败、超时、服务器错误、蓝奏云解析失败）
  - 每种错误提供具体的解决建议
  - 前端错误显示包含"原因 + 建议"两部分
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: 不同错误类型返回不同的 errorCode 和 errorMessage
  - `programmatic` TR-5.2: 错误对象包含 suggestion 字段
  - `human-judgement` TR-5.3: 用户能看懂错误原因并知道下一步怎么做
- **Notes**: 错误信息要友好，避免技术性太强的术语

## [x] Task 6: 蓝奏云解析超时保护
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 蓝奏云解析设置独立的 15 秒超时
  - 解析超时报特定错误码，提示切换下载源
  - 解析阶段也有状态反馈
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 蓝奏云解析超时 15 秒后返回特定错误
  - `programmatic` TR-6.2: 错误信息包含"蓝奏云解析超时"字样
  - `human-judgement` TR-6.3: 用户知道可以切换到其他下载源
- **Notes**: 解析失败不触发 fallback 到主源（因为主源可能更慢）

## 任务依赖关系图

```
Task 1 (连接状态反馈) ──┐
                        ├─→ Task 2 (多源 fallback) ──→ Task 5 (错误增强)
Task 3 (网络检查) ──────┤
Task 4 (断点续传恢复) ───┤
Task 6 (蓝奏云超时) ─────┘
```

可并行执行：Task 1, 3, 4, 6 互不依赖，可并行处理
