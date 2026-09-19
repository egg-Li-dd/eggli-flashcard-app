# 语音长按录音按钮交互重构 - Product Requirement Document

## Overview
- **Summary**: 重新设计 InputBar 组件中麦克风按钮的交互逻辑与视觉表现，解决长按录音/松手停止这一操作在移动端体验不佳的问题，让按钮更美观自然、触控反馈明确。
- **Purpose**: 用户反馈"语音长按录音松手停止录音的效果不好"，现有实现存在以下问题：长按延迟启动（50ms hold timer）、触控事件与鼠标事件混用导致 PC 端行为异常、松手后停止录音的反馈不够清晰。
- **Target Users**: 所有使用 App 语音录入功能的手机用户，尤其是 Android 移动端用户。

## Goals
- 麦克风按钮交互逻辑简化：移除 `holdTimer`，改为"点击开始/再次点击停止"作为主交互（tap-to-toggle），同时保留长按作为辅助手势
- 按钮视觉状态清晰：空闲 / 按下 / 录音中 / 录音结束 四种状态样式差异明显
- 录音中视觉反馈丰富：按钮内图标随状态变化、背景色随状态变化、录音时长实时显示
- 取消录音操作便捷：支持在录音中长安按钮显式取消
- 移动端触控无延迟、无误触

## Non-Goals (Out of Scope)
- 不改变底层录音引擎（recorder.js / nativeRecorder 保持不变）
- 不改变语音识别后处理逻辑（cleaning / transcribing 状态不变）
- 不改变发送按钮和其他辅助工具栏按钮的样式
- 不新增自动暂停/断句检测（已有 AUTO_PAUSE_THRESHOLD 逻辑保留）

## Background & Context
- 现有实现的交互问题：
  1. `handleMicTouchStart` 中有 50ms `holdTimerRef` 延迟，导致点击时需等待才启动录音，用户感知"迟钝"
  2. `onClick`、`onTouchStart`、`onTouchEnd`、`onMouseDown`、`onMouseUp` 同时绑定，在 PC 上容易触发多次启动/停止
  3. `isHolding` 状态只控制按下时的缩放和颜色，与真正的"正在录音"（`recording`）混淆
  4. 录音中的反馈仅靠下方状态条和 input 内的小波形，麦克风按钮本身变化不够明显
  5. 没有录音时长显示，用户不知道录了多久

## Functional Requirements

### FR-1: 简化交互为主 tap-to-toggle
- 点击麦克风按钮：若空闲 → 开始录音；若正在录音 → 停止录音
- 移除 `holdTimerRef` 带来的 50ms 启动延迟，点击即开始
- 长按（>500ms 无松手）视为"录音中长安取消"：停止录音并清空本次录音内容
- `handleMicClick` 作为主交互处理器，移除与 `handleMicTouch*` / `handleMicMouse*` 的功能重叠

### FR-2: 录音状态按钮视觉重构
- **空闲态**：深色圆形按钮，麦克风图标，白色，背景 `var(--color-surface)` 带阴影
- **录音中态**：红色圆形按钮，停止图标（方形），背景 `var(--color-danger)` 带脉冲光晕动画
- **录音中长安取消态**：红色变暗，图标闪烁（1s 内清空并恢复空闲）
- 按钮尺寸保持 44×44px，图标大小 22px，圆角 50%（正圆）
- 录音中按钮持续脉冲动画（scale 1→1.08 循环，约 1.2s），停止时平滑收回

### FR-3: 录音时长显示
- 录音中在麦克风按钮下方（或右上方）显示实时计时器：`MM:SS` 格式
- 计时器样式：红色小字（12px），位于按钮外侧，不遮挡按钮本身
- 超过 60 秒时计时器变为橙色并闪烁提示（MAX_RECORDING_DURATION = 60s）

### FR-4: 录音中底部状态条增强
- 保留现有的忙碌状态条，但增加录音时长显示
- 录音中显示：`🔴 正在录音 XX:XX`（红色主题）
- 去掉冗余的内嵌小波形（已在按钮旁显示）

### FR-5: 事件处理去重
- 麦克风按钮仅绑定 `onClick`
- 移除所有 `onTouchStart` / `onTouchEnd` / `onTouchCancel` / `onMouseDown` / `onMouseUp` / `onMouseLeave`
- `disabled` 状态下按钮 `pointer-events: none`，视觉灰化

## Design Language

### 颜色
- 麦克风按钮空闲背景：`var(--color-surface)`（白色/浅色）
- 麦克风按钮录音背景：`var(--color-danger)`（红色）
- 录音时长文字：`var(--color-danger)`
- 超时提醒文字：`var(--color-warning)`

### 字体
- 录音计时器：12px，font-weight: 600，等宽数字（`font-variant-numeric: tabular-nums`）

### 动效
- 录音中按钮脉冲：`transform: scale(1→1.08)`，`animation: mic-pulse 1.2s ease-in-out infinite`
- 超时闪烁：`opacity: 0.5→1`，`animation: blink 0.6s ease-in-out infinite`
- 状态切换过渡：`transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`

## Acceptance Criteria

### AC-1: 录音启动无延迟
- **Given**: 麦克风按钮处于空闲状态
- **When**: 点击按钮
- **Then**: 50ms 内录音启动（无 holdTimer 延迟），下方状态条立即显示"正在录音"
- **Verification**: programmatic

### AC-2: 点击停止录音
- **Given**: 正在录音
- **When**: 再次点击麦克风按钮
- **Then**: 立即停止录音，状态恢复空闲，识别结果写入输入框
- **Verification**: programmatic

### AC-3: 长安取消录音
- **Given**: 正在录音
- **When**: 长按（>500ms）后松手
- **Then**: 停止录音，清空本次内容，输入框不变，短暂提示"已取消录音"
- **Verification**: programmatic

### AC-4: 录音中时长实时显示
- **Given**: 正在录音
- **When**: 录音进行中
- **Then**: 计时器 MM:SS 每秒更新；60s 时变为橙色闪烁
- **Verification**: human-judgment

### AC-5: 按钮视觉状态正确
- **Given**: 麦克风按钮状态分别为空闲 / 录音中
- **When**: 观察按钮外观
- **Then**: 空闲时为白底麦克风图标；录音中为红色正圆停止图标+脉冲动画
- **Verification**: human-judgment

### AC-6: 移动端无误触
- **Given**: 在 Android 手机上操作
- **When**: 快速点击 / 滑动时不触发意外录音
- **Then**: 不会在用户非预期时开始或停止录音
- **Verification**: human-judgment

### AC-7: PC 端行为正常
- **Given**: 在桌面浏览器打开
- **When**: 单击/双击麦克风按钮
- **Then**: 每次单击触发一次 start/stop，不会有双击误触发两次
- **Verification**: human-judgment

## Open Questions
- [ ] 是否需要支持"录音中上滑取消"（类微信语音条滑动取消）作为第三个交互选项？
- [ ] 录音中是否需要显示"说话中"文字提示（替代或补充时长显示）？
- [ ] 按钮脉冲动画是否会影响用户操作区域的视觉判断（建议实测确认）？
