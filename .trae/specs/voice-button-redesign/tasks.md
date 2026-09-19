# 语音长按录音按钮重构 - 实现计划

## [ ] Task 1: 简化麦克风按钮事件处理 — tap-to-toggle 为主交互
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 移除 `holdTimerRef` 和 `isHolding` 状态（已无用）
  - 麦克风按钮仅保留 `onClick`，绑定到重构后的 `handleMicClick`（纯 tap-to-toggle：空闲→开始，录音中→停止）
  - 移除所有 `onTouchStart` / `onTouchEnd` / `onTouchCancel` / `onMouseDown` / `onMouseUp` / `onMouseLeave` 绑定
  - `handleMicClick` 内部：先判断状态（`recording` → stopRecognition，`!recording && !starting` → startRecognition），不再有 50ms hold 延迟
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-6, AC-7

## [ ] Task 2: 新增长按取消录音逻辑（>500ms 无松手视为取消）
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 引入 `longPressStartRef`（记录长按开始时间），在录音开始时（`recording` 变为 true 时）记录 `Date.now()`
  - 录音开始时同时启动 `cancelTimerRef`（500ms 后若 `recording` 仍为 true 则标记"已取消"，在 stopRecognition 后执行清空逻辑）
  - 若用户在 500ms 内松开（正常 stopRecognition）→ 清除 `cancelTimerRef`，正常结束录音
  - 若用户超过 500ms 才松手（调用 stopRecognition）→ `cancelTimerRef` 检测到 `recording` 已为 false，忽略取消逻辑
  - （实际更简单的方案：录音中如果 `transcriptRef.current` 长度为 0（无识别结果）则视为取消，不写输入框）
- **Acceptance Criteria Addressed**: AC-3

## [ ] Task 3: 重构麦克风按钮 UI — 四种视觉状态
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - **空闲态**：`borderRadius: '50%'`，背景 `var(--color-surface)`，白色麦克风 SVG 图标，box-shadow 轻微阴影
  - **录音中态**：`borderRadius: '50%'`，背景 `var(--color-danger)`，红色停止 SVG 图标（方形），`animation: mic-pulse` 脉冲（scale 1→1.08 循环 1.2s），box-shadow 红色光晕
  - **disabled 态**：透明度 0.5，`cursor: not-allowed`，无交互
  - 按钮尺寸严格 44×44px，图标 22px，CSS transition 0.2s 平滑切换
  - 在按钮旁添加录音计时器（详见 Task 4）
- **Acceptance Criteria Addressed**: AC-5

## [ ] Task 4: 录音时长实时显示
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 引入 `recordingDuration` state（秒数）和 `recordingStartTimeRef`（Date.now()）
  - 录音开始时设置 `recordingStartTimeRef = Date.now()`，同时启动 `durationTimerRef`（setInterval 每秒更新 `recordingDuration`）
  - 停止录音时清除 `durationTimerRef`，重置 `recordingDuration = 0`
  - 计时器显示格式：`MM:SS`（超过 60s 显示橙色闪烁提示）
  - 计时器 DOM 位置：麦克风按钮右侧（`position: relative` 父容器内，绝对定位）
- **Acceptance Criteria Addressed**: AC-4

## [ ] Task 5: 增强底部状态条录音提示
- **Priority**: P1
- **Depends On**: Task 1, Task 4
- **Description**:
  - 录音中状态条改为：`🔴 正在录音 MM:SS`（含实时计时）
  - 去掉 input 内的内嵌小波形动画（现已多余）
  - 保留 `cleaning` / `starting` / `ocrLoading` 状态条不变
- **Acceptance Criteria Addressed**: AC-4（计时器在状态条中也可见）

## [ ] Task 6: 添加 CSS 动效
- **Priority**: P1
- **Depends On**: Task 3
- **Description**:
  - 在 `index.css` 中新增：
    - `.mic-pulse`：`@keyframes mic-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.08) } }`
    - `.recording-timer` 样式：12px，等宽数字，红色
    - `.recording-timer.warn` 样式：橙色，闪烁动画
- **Acceptance Criteria Addressed**: AC-5

## [ ] Task 7: 清理无用 refs 和 state
- **Priority**: P2
- **Depends On**: Task 1, Task 2
- **Description**:
  - 移除不再使用的 `holdTimerRef`（原 50ms hold timer）
  - 移除 `isHolding` state（视觉反馈已由录音脉冲动画替代）
  - 移除 `handleMicTouchStart` / `handleMicTouchEnd` / `handleMicTouchCancel` / `handleMicMouseDown` / `handleMicMouseUp` / `handleMicMouseLeave` 回调函数
- **Acceptance Criteria Addressed**: 无（代码清理）
