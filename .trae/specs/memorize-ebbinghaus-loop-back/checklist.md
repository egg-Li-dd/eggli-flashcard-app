# 艾宾浩斯模式循环复习验收清单

## 阶段一：循环复习弹窗实现

- [x] CP-1.1: 新增 `showLoopBackModal` 状态
- [x] CP-1.2: 新增 `closingLoopBack` 状态用于动画
- [x] CP-1.3: 新增 `loopBackRemainingCount` 状态记录剩余未掌握卡片数量

- [x] CP-2.1: `handleMark` 中艾宾浩斯模式 + `nextFilteredLen > 0` + 最后一张卡片时，显示循环复习弹窗
- [x] CP-2.2: 其他模式（sequential/active/weak）的切换逻辑不受影响（isEbbinghausMode 判断隔离）
- [x] CP-2.3: `nextFilteredLen === 0` 时仍直接调用 `handleComplete()`（显示完成弹窗）

- [x] CP-3.1: `handleCloseLoopBackModal` 函数带动画（复用 closing 模式，200ms 延迟）
- [x] CP-3.2: 弹窗标题显示"还有 X 张未掌握卡片"（X 为剩余数量）
- [x] CP-3.3: 弹窗内容显示"是否重新复习到期卡片？"
- [x] CP-3.4: "重新复习"按钮：关闭弹窗 + `setCurrentIndex(0)` + `setFlipped(false)`
- [x] CP-3.5: "结束复习"按钮：关闭弹窗 + 延迟 200ms 调用 `handleComplete()`（显示完成弹窗）
- [x] CP-3.6: 弹窗使用 `modal-center` + `closing` 动画类名
- [x] CP-3.7: 按钮触控区域 ≥ 44px（minHeight: 48px）
- [x] CP-3.8: 弹窗点击背景可关闭（onClick={handleCloseLoopBackModal}）

## 阶段二：验证

- [x] CP-4.1: `npm run build` 生产构建通过（成功，1.13s）
- [x] CP-4.2: GetDiagnostics 检查 Memorize.jsx 无语法错误（返回空数组）
- [x] CP-4.3: sequential 模式完成逻辑不受影响（isEbbinghausMode = false）
- [x] CP-4.4: active 模式完成逻辑不受影响（isEbbinghausMode = false）
- [x] CP-4.5: weak 模式完成逻辑不受影响（isEbbinghausMode = false）
- [x] CP-4.6: 从计划页来（`fromPlan`）的完成逻辑不受影响（handleComplete 优先判断 fromPlan）

## 回归测试场景

- [ ] RT-1: 艾宾浩斯模式标记最后一张到期卡片（仍有未掌握）→ 显示循环复习弹窗（需热更新预览）
- [ ] RT-2: 点击"重新复习" → 跳回第一张到期卡片，可继续复习（需热更新预览）
- [ ] RT-3: 点击"结束复习" → 显示"🎉 今日复习已完成"完成弹窗（需热更新预览）
- [ ] RT-4: 艾宾浩斯模式标记最后一张到期卡片（全部已掌握）→ 直接显示完成弹窗（需热更新预览）
- [ ] RT-5: 艾宾浩斯模式非最后一张卡片标记 → 正常推进到下一张（需热更新预览）
- [ ] RT-6: sequential 模式标记最后一张 → 显示"🎉 恭喜完成"弹窗（需热更新预览）
- [ ] RT-7: weak 模式标记最后一张 → 显示"🎉 恭喜完成"弹窗（需热更新预览）
- [ ] RT-8: 从计划页来 + 艾宾浩斯模式 + 最后一张 → 直接跳转 `/memorize/plan`（需热更新预览）
- [ ] RT-9: 弹窗动画流畅（无闪烁、无卡顿）（需热更新预览）
- [ ] RT-10: 移动端按钮触控区域 ≥ 44px（需热更新预览）
