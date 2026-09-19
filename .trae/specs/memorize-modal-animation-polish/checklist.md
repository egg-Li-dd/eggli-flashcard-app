# 背诵页弹窗动画平滑化 - Verification Checklist

## CSS 层（Task 1）
- [ ] `.modal-backdrop` 类存在于 `src/index.css`，且含 `fadeIn` 打开动画（遮罩层）。
- [ ] `.modal-panel` 类存在，且含 `modalSlideUp` 打开动画（底部面板）。
- [ ] `.modal-backdrop.closing` 类存在，含 `fadeOut 0.22s ease-out forwards`。
- [ ] `.modal-panel.closing` 类存在，含 `modalSlideDown 0.28s ease-in forwards`。
- [ ] `@media (prefers-reduced-motion: reduce)` 规则中对 `.modal-backdrop` 与 `.modal-panel` 覆盖 `animation-duration: 60ms` 或等效跳过。
- [ ] 无重复 keyframes 定义：`fadeIn / fadeOut / modalSlideUp / modalSlideDown` 每种仅有一处。

## 编辑弹窗（Task 2，AC-1）
- [ ] 打开编辑弹窗时：遮罩自下而上淡入覆盖页面，面板自底部滑入屏幕（目测无跳闪）。
- [ ] 点击「取消」/ 遮罩：面板下滑、遮罩淡出后再从 DOM 卸载。
- [ ] 点击「保存」：保存成功后触发同样的关闭动画，随后新内容出现在卡片上。
- [ ] `closingEdit` 状态被正确使用；在 setTimeout 中与 `showEditModal` 一同清除。
- [ ] 编辑弹窗的 JSX 不再有内联 `animation:` 样式字符串。

## 移动弹窗 & 滑动操作菜单（Task 3，AC-2/AC-3）
- [ ] 打开移动弹窗：底部滑入 + 遮罩淡入。
- [ ] 点击「取消」或「确认移动」：面板下滑 + 遮罩淡出 + DOM 卸载。
- [ ] 左滑卡片 → 出现「卡片操作」菜单：底部滑入；点击任意项或遮罩：底部滑出。
- [ ] 滑出期间，菜单项点击被忽略（不会重复触发）。

## 模式选择弹窗（Task 4，AC-4）
- [ ] 模式选择弹窗打开动画与编辑弹窗视觉一致（缓动、时长）。
- [ ] 模式选择弹窗关闭时：面板下滑 + 遮罩淡出，非瞬间消失。
- [ ] 打开时点击模式按钮 / 取消按钮后流程不变，只是动画更流畅。

## 完成祝贺 & 重置确认（Task 5，AC-5）
- [ ] 完成一轮后的「🎉 完成」弹窗打开平滑（非瞬间出现）。
- [ ] 点击完成弹窗上的按钮后，弹窗先淡出再卸载。
- [ ] 长按分类触发「取消第 N 轮」对话框：打开/关闭都有平滑动画。

## 删除确认 - ConfirmDialog（Task 6，AC-6）
- [ ] 从滑动菜单点击「删除卡片」→ 弹出删除确认对话框有动画。
- [ ] 点击「确认删除」/「取消」→ 对话框关闭有动画；删除结果 toast 正常显示。

## 关闭中状态锁定（Task 7，NFR-2）
- [ ] 任何弹窗处于「closingXxx=true」期间，再次点击打开/关闭不会造成状态错乱。
- [ ] 手机端快速连点「编辑 → 取消 → 编辑」至少 3 次不会出错。
- [ ] 所有 `handleXxxCancel`/`handleXxxConfirm` 开头处有 `if (closingXxx) return` 守卫。

## 业务逻辑回归（AC-8）
- [ ] 编辑保存卡片后，新内容立刻显示；再次打开编辑弹窗显示新内容。
- [ ] 移动卡片到其他分类/单元后，从该分类卡片列表正常能看到；原分类不再出现。
- [ ] 删除卡片后，卡片从列表消失，卡片计数减少。
- [ ] 选择不同模式后，卡片列表按模式筛选正常。
- [ ] 完成一轮后轮数加 1，并自动重置所有卡片到「待复习」。

## 代码 & 文档一致性（Task 8，AC-9）
- [ ] `src/pages/Memorize.jsx` 中不再残留内联 `animation:` 样式（0 处或有明确例外理由）。
- [ ] 所有弹窗使用 `modal-backdrop / modal-panel / closing` 统一命名，结构可被新开发者读懂。
- [ ] `背诵功能实现.txt` 已更新含「弹窗动画」小节，记录状态命名与动画时长。
- [ ] Android 真机 / Chrome 开发者工具切换 `prefers-reduced-motion` 后，动画显著缩短或跳过重播。

## 手机端体验验证
- [ ] 在 Android debug apk 安装后，进入背诵页，打开/关闭所有弹窗各 5 次，未出现任何视觉跳闪/错位。
- [ ] 小屏手机（<6.0"）上面板顶部不超出状态栏，底部安全区已纳入（`padding-bottom: calc(env(safe-area-inset-bottom) + 20px)` 类似形式仍保留）。
- [ ] 动画帧率目测保持流畅，无明显卡顿（≥30fps）。
