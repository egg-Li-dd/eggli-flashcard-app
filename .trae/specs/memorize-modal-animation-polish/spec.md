# 背诵页弹窗动画平滑化 - Product Requirement Document

## Overview
- **Summary**: 对背诵页（src/pages/Memorize.jsx）中所有底部弹窗（编辑、移动、滑动操作菜单、模式选择、完成祝贺、重置确认、删除确认）做打开/关闭的双边动画统一化，让关闭过程也有平滑淡出/下滑，替换当前的生硬消失。
- **Purpose**: 用户在手机端进行卡片编辑、移动等高频操作时，点击按钮后弹窗瞬间消失带来"顿挫感"，与整个应用的轻盈动效风格不一致。加上双边动画后，操作反馈更自然，符合移动端 App 交互标准。
- **Target Users**: 考研速记卡 APP 的所有背诵用户（移动端 Android 为主）。

## Goals
- **G-1**: 所有背诵页弹窗具备一致的打开动画与一致的关闭动画（遮罩淡出 + 面板下滑），持续时间与缓动曲线统一。
- **G-2**: 关闭动画结束后再从 DOM 移除弹窗，期间用户点击遮罩/按钮不再触发重复操作（状态机"关闭中"锁定）。
- **G-3**: 打开与关闭动画均尊重用户的「减少动画 / 低性能机」场景——`prefers-reduced-motion` 时，动画跳过或显著缩短。
- **G-4**: 不破坏现有业务逻辑（编辑保存、移动、删除、模式选择、完成祝贺的回调保持原有行为）。

## Non-Goals (Out of Scope)
- 不改变弹窗的布局、文案、点击区域大小（热区 ≥44px 已满足）。
- 不调整卡片翻转、卡片滑入滑出的切换动画。
- 不重写 Category 页或其他页面的弹窗（聚焦背诵页），其他页面可后续类似模式推广。
- 不新增外部动画库；使用已有 CSS `@keyframes` + React state + `setTimeout` 保持依赖零增长。

## Background & Context
当前 `src/pages/Memorize.jsx` 中的弹窗结构分析（基于 2026-06-12 的代码快照）：

| 弹窗 | 打开动画 | 关闭动画 | 问题 |
|------|---------|---------|------|
| 模式选择（showModeModal） | `fadeIn 0.2s ease-out` 遮罩 + `modalSlideUp 0.35s cubic-bezier(0.22,0.61,0.36,1)` 面板 | 有 `closingModal` → `anim-slide-down`/`anim-fade-out`（已实现）但持续时间与其他弹窗不统一 | 唯一已实现双边动画的弹窗，但缓动曲线与其它弹窗的 `cubic-bezier(0.32,0.72,0,1)` 不一致 |
| 编辑卡片（showEditModal） | `fadeIn 0.2s ease-out` + `slideUp 0.3s cubic-bezier(0.32,0.72,0,1)` | ❌ 无，`showEditModal=false` 瞬间 DOM 移除 | 关闭生硬 |
| 移动卡片（showMoveModal） | `fadeIn 0.2s ease-out` + `slideUp 0.3s cubic-bezier(0.32,0.72,0,1)` | ❌ 无，瞬间移除 | 同上 |
| 左滑操作菜单（showSwipeMenu） | `fadeIn 0.2s ease-out` + `slideUp 0.25s cubic-bezier(0.32,0.72,0,1)` | ❌ 无，瞬间移除 | 同上 |
| 完成祝贺（showCongrats） | 内联 CSS，无 `@keyframes` | ❌ 无 | 关闭体验生硬 |
| 重置确认（showResetConfirm） | ❌ 无（可能走 ConfirmDialog）| ❌ 无 | 打开/关闭均无动画 |
| 删除确认（showDeleteConfirm） | 走 ConfirmDialog 组件 | 走 ConfirmDialog 组件 | 需检查 ConfirmDialog |

`src/index.css` 中已有以下关键帧与类可用（避免重复定义）：
- `@keyframes fadeIn { 0% { opacity: 0 } 100% { opacity: 1 } }` (L616)
- `@keyframes slideUp { 0% { transform: translateY(100%); opacity: 0.5 } 100% { transform: translateY(0); opacity: 1 } }` (L621)
- `@keyframes modalSlideUp { 0% { transform: translateY(100%); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }` (L626)
- `@keyframes modalSlideDown { 0% { transform: translateY(0); opacity: 1 } 100% { transform: translateY(100%); opacity: 0 } }` (L631)
- `@keyframes fadeOut { 0% { opacity: 1 } 100% { opacity: 0 } }` (L636)
- `.anim-slide-down { animation: modalSlideDown 0.3s ease-in forwards }` (L748)
- `.anim-fade-out { animation: fadeOut 0.25s ease-out forwards }` (L752)

**技术约束**: React 渲染是即时的；要实现"先动画再卸载"，必须让 `showXModal → false` 走一个中间态 `closingX=true`，由 CSS 动画触发，然后 `animationend` 或 `setTimeout` 后再真正卸载。

## Functional Requirements
- **FR-1**: 每个弹窗（编辑/移动/滑动菜单/模式选择/完成/重置确认/删除确认）维护自己的 `closingXxx` 状态（布尔），并在「关闭请求」时先设置「关闭中」，在动画结束时再置 `showXxx=false`、`closingXxx=false`。
- **FR-2**: 弹窗在「关闭中」状态期间，所有触发打开/再次关闭的操作应当被忽略（避免用户在动画中重复点击造成状态错乱）。
- **FR-3**: 遮罩（蒙层）和面板的关闭动画必须并行：遮罩 `fadeOut 0.22s ease-out`，面板 `modalSlideDown 0.28s ease-in forwards`；两者时间差使得面板先下滑再遮罩最后消失，层次清晰。
- **FR-4**: 弹窗打开与关闭的总时长 ≤ 350ms（打开 ~300ms，关闭 ~280ms），避免用户等待。
- **FR-5**: `prefers-reduced-motion: reduce` 时，所有动画 duration 强制 ≤60ms 或直接跳过（仅 opacity/位移快速切换）。
- **FR-6**: 底部安全区（`env(safe-area-inset-bottom)`）在动画起始位置即纳入计算，避免动画结束瞬间跳动。
- **FR-7**: 所有弹窗动画统一使用 CSS 类（`.modal-backdrop`/`.modal-panel`/`.modal-backdrop.closing`/`.modal-panel.closing`），减少内联 `animation: xxx` 样式，提高可读性与维护性。
- **FR-8**: `ConfirmDialog`（删除确认）组件如果缺少关闭动画，也需纳入改造范围。

## Non-Functional Requirements
- **NFR-1 (Performance)**: 动画使用 `transform: translateY()` 与 `opacity`，避免触发布局重排；不使用 `top/bottom/margin` 做动画。
- **NFR-2 (Accessibility)**: 弹窗在动画期间仍保持可点击区域 ≥44px；`onClick={handleCancelXxx}` 仍能正常工作。
- **NFR-3 (Maintainability)**: 新增 CSS 类与状态命名遵循 `showEditModal → closingEdit`、`showMoveModal → closingMove` 的配对规则，逻辑集中在顶部状态区；避免业务函数内散落内联动画字符串。
- **NFR-4 (Compatibility)**: 仅使用标准 CSS `@keyframes` + React hooks，无需引入 framer-motion、animate.css 等新依赖。

## Constraints
- **Technical**: React 18 + plain CSS（`src/index.css`），已存在 `modalSlideUp/modalSlideDown/fadeIn/fadeOut` 关键帧；禁止引入第三方动画库。
- **Platform**: Android（Capacitor 打包的 WebView）与桌面浏览器均需正常展示；动画时间以手机端体验为准。
- **Dependencies**: 无新增依赖。

## Assumptions
- 用户在 1.5~2.5 秒内完成「打开弹窗 → 关闭」的连续操作是常见场景（尤其选择分类/模式的探索期），需要该场景下动画自然不冲突。
- `animationend` 事件在 Android WebView 上可靠，但为了稳健性使用 `setTimeout` 作为兜底（以 CSS duration +10~20ms 为超时）。
- 背诵页以外的弹窗不在本次范围内，后续 PRD 可复用本次抽象。

## Acceptance Criteria

### AC-1: 编辑弹窗的双边动画
- **Given**: 用户已选择分类与模式，背诵页显示一张卡片
- **When**: 点击卡片右上角「编辑」按钮 → 弹窗自底部滑入；随后点击遮罩/取消/保存
- **Then**: 打开时遮罩淡入 + 面板滑入（~300ms）；关闭时面板下滑消失 + 遮罩淡出（~280ms）；动画结束后弹窗才真正卸载；整个过程无跳变、无闪烁。
- **Verification**: `human-judgment`
- **Notes**: 保存后卡片内容更新的 toast 与弹窗关闭动画不冲突。

### AC-2: 移动弹窗的双边动画
- **Given**: 用户在一张卡片上点击「移动」或从滑动菜单选择移动
- **When**: 移动弹窗出现 → 用户选择分类/单元后「确认移动」或「取消」
- **Then**: 打开与关闭动画与编辑弹窗一致；分类/单元选择按钮本身的过渡（`transition: background-color 0.15s ease`）保持不变。
- **Verification**: `human-judgment`

### AC-3: 左滑操作菜单的双边动画
- **Given**: 用户在卡片上左滑手势触发「卡片操作」菜单
- **When**: 点击「加入收藏/移动/删除」或点击遮罩关闭
- **Then**: 菜单底部滑入/滑出动画平滑；滑出期间菜单项不可点击（避免关闭中再次触发操作）。
- **Verification**: `human-judgment`

### AC-4: 模式选择弹窗动画与其他弹窗一致化
- **Given**: 用户刚选择完分类
- **When**: 模式选择弹窗打开 → 点击某个模式或「取消」
- **Then**: 打开动画 `modalSlideUp`，关闭时使用 `modalSlideDown + fadeOut`，缓动曲线与编辑/移动弹窗保持一致（统一为 `cubic-bezier(0.32, 0.72, 0, 1)` 或 iOS 标准曲线）；持续时间 300ms。
- **Verification**: `human-judgment`

### AC-5: 完成祝贺与重置确认弹窗的双边动画
- **Given**: 用户完成一轮或长按分类触发「取消第 N 轮」
- **When**: 对应弹窗出现 → 用户点击按钮或遮罩关闭
- **Then**: 均有滑入/滑出 + 淡入/淡出；完成弹窗的 emoji 庆祝内容不被动画破坏。
- **Verification**: `human-judgment`

### AC-6: 删除确认(ConfirmDialog) 如有缺失要补齐动画
- **Given**: 用户在「卡片操作」菜单点删除
- **When**: 触发删除确认对话框 → 用户点击「确认删除」或「取消」
- **Then**: 对话框打开/关闭均有动画；保持原有阻塞语义（不可点击外部关闭）。
- **Verification**: `human-judgment`

### AC-7: 减少动画系统偏好生效
- **Given**: 用户系统开启「减少动画/减弱动态效果」
- **When**: 在 APP 内触发任意弹窗打开/关闭
- **Then**: 动画时间缩短至 ≤60ms 或直接跳过；视觉变为即时切换但不生硬。
- **Verification**: `human-judgment`（通过浏览器 DevTools 的 "Emulate CSS media feature prefers-reduced-motion" 也可验证）

### AC-8: 业务逻辑无回归
- **Given**: 动效改造完成后
- **When**: 用户执行「编辑保存/移动卡片/删除卡片/选择模式/完成一轮/取消一轮」
- **Then**: 业务结果与改造前完全一致；状态不可重复触发。
- **Verification**: `programmatic` + `human-judgment`（代码走查确认所有 `setShowX(true)` 调用点与 `handleXxx` 回调未被改动）

### AC-9: CSS 集中化 & 命名规范
- **Given**: 代码审阅者查看 `Memorize.jsx` 与 `index.css`
- **When**: 查找弹窗动画相关实现
- **Then**: 能在 `index.css` 顶部「弹窗动画」区域看到 `.modal-backdrop/.modal-panel/.closing` 等类定义；组件内通过 `className` 引用；不存在重复 `animation:` 内联字符串。
- **Verification**: `programmatic`（代码 grep 检查：内联 `animation:` 数量为 0）

## Open Questions
- [ ] 是否需要把本次弹窗动画抽象扩展到 Category（分类页）的相同编辑/移动弹窗？（默认：本次仅聚焦背诵页，留作后续 PRD）
- [ ] 是否要把「完成祝贺弹窗」从中心弹窗改成底部滑入样式以与其他弹窗一致？（默认：保持中心弹出样式，仅增加动画）
- [ ] 是否希望为面板的顶部抓手（44×5 的横条）添加轻微呼吸动效，暗示"可下滑关闭"手势？（默认：不启用，保留未来交互扩展）
