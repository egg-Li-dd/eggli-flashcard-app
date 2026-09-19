# Tasks

## 阶段一：实现循环复习弹窗

- [x] Task 1: 新增循环复习弹窗状态
  - [x] SubTask 1.1: 新增 `showLoopBackModal` 状态（useState(false)）
  - [x] SubTask 1.2: 新增 `closingLoopBack` 状态用于动画（useState(false)）
  - [x] SubTask 1.3: 新增 `loopBackRemainingCount` 状态记录剩余未掌握卡片数量（useState(0)）

- [x] Task 2: 修改 handleMark 的卡片切换逻辑
  - [x] SubTask 2.1: 在 `handleMark` 中，当艾宾浩斯模式 + `nextFilteredLen > 0` + `currentIndex >= filteredCards.length - 1` 时，不执行原有的 `setCurrentIndex(nextFilteredLen - 1)`
  - [x] SubTask 2.2: 改为设置 `setLoopBackRemainingCount(nextFilteredLen)` 和 `setShowLoopBackModal(true)`
  - [x] SubTask 2.3: 保持其他模式（sequential/active/weak）的切换逻辑不变
  - [x] SubTask 2.4: 保持 `nextFilteredLen === 0` 时直接 `handleComplete()` 的逻辑不变

- [x] Task 3: 实现循环复习弹窗 UI
  - [x] SubTask 3.1: 新增 `handleCloseLoopBackModal` 函数（带动画，复用 closing 模式）
  - [x] SubTask 3.2: 实现弹窗 JSX：标题"还有 X 张未掌握卡片"，内容"是否重新复习到期卡片？"
  - [x] SubTask 3.3: 实现"重新复习"按钮：关闭弹窗 + `setCurrentIndex(0)` + `setFlipped(false)`
  - [x] SubTask 3.4: 实现"结束复习"按钮：关闭弹窗 + 调用 `handleComplete()`（显示完成弹窗）
  - [x] SubTask 3.5: 复用 `modal-center` + `closing` 动画类名
  - [x] SubTask 3.6: 按钮触控区域 ≥ 44px，符合移动端标准

## 阶段二：验证

- [x] Task 4: 代码验证
  - [x] SubTask 4.1: 运行 `npm run build` 验证生产构建（成功，1.13s）
  - [x] SubTask 4.2: GetDiagnostics 检查 Memorize.jsx 无语法错误（返回空数组）
  - [x] SubTask 4.3: 验证其他模式（sequential/active/weak）的完成逻辑不受影响（isEbbinghausMode 判断隔离）

# Task Dependencies

- Task 2 依赖 Task 1（需要使用新增的 state）
- Task 3 依赖 Task 1 和 Task 2（需要 state 和 handleMark 修改）
- Task 4 依赖 Task 1-3

# 并行执行建议

- Task 1、Task 2、Task 3 可由单个 sub-agent 顺序执行（同一文件，避免冲突）
- Task 4 在 Task 1-3 完成后执行
