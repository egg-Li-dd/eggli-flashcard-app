# 背诵页弹窗动画平滑化 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 在 index.css 中集中声明弹窗动画类
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 在 `src/index.css` 中新增「弹窗动画」区段（放在现有 `@keyframes` 之后，`.modal-backdrop`/`.modal-panel`/`.modal-panel.closing`/`.modal-backdrop.closing`），集中声明所有弹窗的打开/关闭动画 CSS 类。
  - 打开：`.modal-backdrop` 用 `fadeIn 0.22s cubic-bezier(0.32, 0.72, 0, 1)`；`.modal-panel` 用 `modalSlideUp 0.30s cubic-bezier(0.32, 0.72, 0, 1)`。
  - 关闭：`.modal-backdrop.closing` 用 `fadeOut 0.22s ease-out forwards`；`.modal-panel.closing` 用 `modalSlideDown 0.28s ease-in forwards`。
  - 新增 `@media (prefers-reduced-motion: reduce)` 规则，`.modal-backdrop/.modal-panel` 的动画 duration 统一压缩至 `60ms`。
  - 复用现有 `fadeIn/fadeOut/modalSlideUp/modalSlideDown` 关键帧（已存在于 L616/L636/L626/L631），**不重复定义**。
- **Acceptance Criteria Addressed**: AC-1~AC-5（基础），AC-7，AC-9
- **Test Requirements**:
  - `programmatic` TR-1.1: `grep -E "@keyframes fadeIn|@keyframes fadeOut|@keyframes modalSlideUp|@keyframes modalSlideDown" src/index.css` 每类 keyframes 仅有 1 处定义。
  - `programmatic` TR-1.2: `.modal-backdrop`、`.modal-panel`、`.modal-backdrop.closing`、`.modal-panel.closing` 均能在 `src/index.css` 中找到定义，且各自包含 `animation:` 声明。
  - `programmatic` TR-1.3: `prefers-reduced-motion` 媒体查询中存在对 `.modal-backdrop/.modal-panel` 的 `animation-duration: 60ms` 或等效覆盖。
  - `human-judgement` TR-1.4: 代码审阅者认为命名直观（backdrop=遮罩，panel=面板），且与项目其它 CSS 命名风格一致；无混用 snake_case/camelCase。
- **Notes**: 本任务只改 CSS，Memorize.jsx 保持不动，便于先审查动画定义再引入使用。

## [ ] Task 2: 为编辑弹窗增加关闭动画（closingEdit）
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 在 `Memorize.jsx` 顶部 state 区新增 `const [closingEdit, setClosingEdit] = useState(false)`。
  - `handleCancelEdit` 与 `handleConfirmEdit` 的末尾（在 `setShowEditModal(false)` 之前）改为：
    1. 若 `closingEdit=true`，直接 return（避免重复关闭）。
    2. `setClosingEdit(true)` → 启动 CSS 的 `.closing` 动画。
    3. `setTimeout` 280ms 后同时 `setClosingEdit(false); setShowEditModal(false)`。
  - `showEditModal` 的 JSX 渲染条件改为 `{showEditModal && ( ... )}`；遮罩与面板 `className` 分别引入 `modal-backdrop${closingEdit ? ' closing' : ''}` 与 `modal-panel${closingEdit ? ' closing' : ''}`；**移除**内联的 `animation: ...`，仅保留 className 驱动。
  - `showEditModal=false → true` 时需确保 `closingEdit=false`（打开时 reset），在 `handleOpenEditModal` 开始处 `setClosingEdit(false)`。
- **Acceptance Criteria Addressed**: AC-1，AC-8
- **Test Requirements**:
  - `programmatic` TR-2.1: 编辑弹窗的 JSX 中不再包含字面量 `animation:` 内联样式。
  - `programmatic` TR-2.2: `handleCancelEdit` 中存在 `setClosingEdit(true)` + `setTimeout(...,280)` 的关闭序列。
  - `human-judgement` TR-2.3: 真机操作：打开编辑 → 点击"取消"→ 目测面板下滑 + 遮罩淡出 → 弹窗消失，无跳闪。
  - `human-judgement` TR-2.4: "保存"按钮触发关闭时，卡片内容更新为新内容不被动画阻塞（动画与状态更新异步进行）。
- **Notes**: 选择 280ms 略小于 modalSlideDown 的实际 duration（若 CSS 中是 280ms 可精确相等），避免动画还没做完就消失。

## [ ] Task 3: 为移动弹窗、滑动操作菜单增加关闭动画（closingMove / closingSwipe）
- **Priority**: P0
- **Depends On**: Task 2
- **Description**:
  - 按 Task 2 的同样范式为 `showMoveModal` → `closingMove`，`showSwipeMenu` → `closingSwipe`，实现关闭动画 + 延迟卸载。
  - 移动弹窗的关闭入口：`handleCancelMove` 以及遮罩点击（注意有些地方用 `onClick={(e) => e.stopPropagation()}` 阻止冒泡，需确认遮罩点击可正确触发关闭）。
  - 滑动操作菜单的关闭入口：遮罩点击、任一项按钮点击后触发；需在关闭动画中禁止再次点击（可通过 `closingSwipe=true` 让按钮 return）。
- **Acceptance Criteria Addressed**: AC-2，AC-3，AC-8
- **Test Requirements**:
  - `programmatic` TR-3.1: `handleCancelMove` 与滑动菜单的关闭逻辑中均存在 `setClosingXxx(true)` + `setTimeout` 序列。
  - `human-judgement` TR-3.2: 移动弹窗点击"取消/确认移动"时，面板下滑消失而非瞬间消失。
  - `human-judgement` TR-3.3: 滑动操作菜单点击任一菜单项（收藏/移动/删除）后，面板先滑出再消失；动画期间再次点击遮罩不会引发额外状态变更。
- **Notes**: 保持代码结构一致，建议抽取一个小工具 `useModalAnimation(showState, closeState, setClose, setShow)` 或简单复制-粘贴相同模式（后一种更简单直观且避免引入新抽象）。

## [ ] Task 4: 统一模式选择弹窗的缓动曲线并确保双边动画（closingMode）
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 模式选择弹窗当前已有 `closingModal` 状态与 `anim-slide-down`/`anim-fade-out` CSS 类，但缓动曲线、持续时间与其他弹窗不一致。
  - 改造：打开时使用统一的 `modal-backdrop`/`modal-panel` className；关闭时使用 `.modal-backdrop.closing`/`.modal-panel.closing`。
  - 若 `closingModal` 状态目前通过 CSS 类 `anim-slide-down`/`anim-fade-out` 驱动，可保留或替换为统一的 `.closing`（两者择一，不混用）。
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: 对比模式选择弹窗与编辑弹窗的打开/关闭速度，肉眼感知一致（±20ms 以内可接受）。
  - `programmatic` TR-4.2: 模式选择弹窗 JSX 的 `animation:` 内联字符串不超过 0 处（目标为全用 className）。
- **Notes**: 保持现有 `closingModal` → 卸载流程不变，但动画时间与曲线与其他弹窗对齐。

## [ ] Task 5: 完成祝贺 / 重置确认弹窗的动画
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - `showCongrats`：当前是中心式弹窗，保持中心样式，但新增 `closingCongrats` 状态，打开使用 `fadeIn`（遮罩）+ 自定义 `scaleIn` 或 `modalSlideUp`（中心面板），关闭使用 `fadeOut` + `scaleOut` 或 `modalSlideDown`。
  - `showResetConfirm`：同样增加 `closingResetConfirm`。
  - 这两个弹窗相对低频，但交互一致性原则上必须覆盖。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgement` TR-5.1: 完成一轮后自动弹出的祝贺弹窗，关闭时平滑消失（非瞬间）。
  - `human-judgement` TR-5.2: 长按分类触发「取消第 N 轮」对话框的关闭平滑。

## [ ] Task 6: 检查 ConfirmDialog 组件并补齐动画（删除确认）
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 查看 `src/components/ConfirmDialog.jsx` 或 `src/pages/Memorize.jsx` 中 `ConfirmDialog` 的实现；如果它缺少关闭动画，添加 `closing` 状态 + 延迟卸载。
  - 若该组件在多处复用（Category / Memorize 等），需确保不影响其它页面（通过条件 className 或默认关闭动画）。
- **Acceptance Criteria Addressed**: AC-6，AC-8
- **Test Requirements**:
  - `human-judgement` TR-6.1: 删除卡片时，确认对话框打开/关闭平滑。
  - `programmatic` TR-6.2: ConfirmDialog 或其调用处存在 `setTimeout(...,220~300)` 等待关闭动画后卸载。

## [ ] Task 7: 防止"关闭中"状态下重复触发操作（按钮防抖）
- **Priority**: P1
- **Depends On**: Task 2, Task 3, Task 4, Task 5, Task 6
- **Description**:
  - 在每个弹窗的 `handleXxxConfirm` / `handleXxxCancel` 中，判断 `closingXxx` 为 true 时直接 return。
  - 遮罩点击关闭时（如编辑弹窗）同样在 handle 里判断。
  - 目标：任何用户在 300ms 内连点两次关闭按钮都不会造成状态异常或动画打断。
- **Acceptance Criteria Addressed**: FR-2（隐式依赖 AC-8）
- **Test Requirements**:
  - `programmatic` TR-7.1: `handleCancelEdit` 中存在 `if (closingEdit) return` 守卫。
  - `human-judgement` TR-7.2: 手动在手机上快速点击"编辑→取消"再立刻点"编辑"，不出现双层弹窗或编辑无法再次打开。

## [ ] Task 8: 代码清理与一致性检查
- **Priority**: P2
- **Depends On**: Task 1~7
- **Description**:
  - 检查 `Memorize.jsx` 中仍残存的内联 `animation:` 样式，全部改为 className 引用。
  - 删除未使用的冗余状态（如 `closingModal` 可与 Task 4 模式选择窗口复用）。
  - 更新 `背诵功能实现.txt` 文档，新增「弹窗动画」小节，描述状态命名规范 / 动画时长 / 曲线，便于后续维护。
- **Acceptance Criteria Addressed**: AC-9，NFR-3
- **Test Requirements**:
  - `programmatic` TR-8.1: `grep -n "animation:" src/pages/Memorize.jsx | wc -l` 返回 0（或仅保留 ≤1 处且有注释说明例外）。
  - `human-judgement` TR-8.2: 审阅 `背诵功能实现.txt` 中新增的动画章节内容完整、可指导后续开发者复用该模式。
