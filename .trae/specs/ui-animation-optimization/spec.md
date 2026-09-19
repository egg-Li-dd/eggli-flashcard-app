# 全局 UI 与动效优化 —— 规格文档 (Specification)

## 1. 现状评估

本应用采用「CSS 变量 + Tailwind 类名 + 内联样式」的混合实现方式。现有架构包含：

- **设计系统**（`index.css` L6-L67）：定义了颜色、圆角、字号、阴影、边框等基础 token
- **动效系统**（`index.css` L576-L695）：fadeIn、slideUp、modalSlideUp/Down、pageIn、spin、pulse、wave、mic-pulse、toastIn、cardSlideOutLeft/InLeft/OutRight/InRight
- **按钮系统**（`index.css` L182-L300）：btn-primary/secondary/ghost/danger/success/accent/sm/lg/block
- **卡片组件**（`index.css` L301-L347）：card 与 card-flip（3D翻转）
- **弹窗系统**（`index.css` L465-L571）：bottom-sheet 与 confirm-dialog
- **响应式断点**（`index.css` L1655-L1754）：360px / 768px 两档断点
- **无障碍支持**（`index.css` L1896-L1909）：prefers-reduced-motion、safe-area

### 1.1 已识别的问题

| 问题编号 | 问题描述 | 影响页面 |
|---|---|---|
| UI-01 | **样式实现不统一**：同一类组件同时使用 CSS 类、内联样式、CSS 变量，视觉风格与交互反馈不一致 | 全页面 |
| UI-02 | **动效曲线不统一**：不同按钮/弹窗/卡片使用不同的 cubic-bezier 曲线与时长，整体手感不协调 | 全页面 |
| UI-03 | **缺少微交互反馈**：重要按钮 hover / pressed 状态不明显，状态切换无过渡 | Home / Memorize / Settings |
| UI-04 | **背诵页卡片动画单一**：卡片翻转只有 3D rotateY，没有根据标记状态（已掌握 / 待复习）产生不同的滑出方向与视觉反馈 | Memorize |
| UI-05 | **分类切换生硬**：选择不同分类时，卡片列表瞬时替换，无过渡动画 | Memorize |
| UI-06 | **进度条与环形图变化无过渡**：`masteryPercent` / 今日完成进度更新时直接突变，无视觉过渡 | Memorize |
| UI-07 | **首页卡片入场无动画**：分类列表无 staggered entrance 动画，首次加载与后续变化都只是静态显示 | Home |
| UI-08 | **底部抽屉动画可优化**：当前的 slideUp 动画有效但可加入 spring 曲线与弹性反馈 | Category / Home (长按菜单) |
| UI-09 | **设置页分段控件按下反馈弱**：settings-segmented-item 的按下态仅改变背景色，无缩放反馈 | Settings* |
| UI-10 | **Toast 进入动画可强化**：已有 toastIn，但未区分 success/info/error 的差异化进入动效 | 全站 |
| UI-11 | **FAB 按钮点击反馈**：按下态只有 background-color，可增加 scale + shadow 变化 | Home |
| UI-12 | **空状态插画无动画**：empty-state 仅静态显示，缺少轻微呼吸动画（呼吸感） | 各空状态 |
| UI-13 | **新卡片徽章无动画**："新" badge 应带有 pulse 闪烁效果以吸引注意 | Memorize / Category |
| UI-14 | **单元概览展开/收起生硬**：max-height transition 有效但无 easing，也无内容淡出-淡入 | Memorize |
| UI-15 | **悬浮输入栏动画**：打开/关闭动画仅依赖简单 transform，缺乏 spring-back 弹性感 | Category / CloudData 等 |
| UI-16 | **卡片滑动交互**：左滑显示操作菜单只有 transform，无阴影跟随与阻尼变化的视觉反馈 | Memorize |

## 2. 设计目标

### 2.1 动效原则

1. **自然（Easing）**：优先使用 spring/cubic-bezier 曲线，避免匀速 linear
   - 快速反应（按钮按下）：`cubic-bezier(0.2, 0, 0.2, 1)` 120-200ms
   - 中等过渡（元素显现）：`cubic-bezier(0.32, 0.72, 0, 1)` 250-350ms
   - 大型动画（页面/抽屉）：`cubic-bezier(0.16, 1, 0.3, 1)` 350-500ms
2. **响应（Feedback）**：每个可交互元素必须有 3 种视觉状态：idle / pressed / disabled
3. **克制（Restraint）**：避免同时出现 3+ 个动画元素；使用 prefers-reduced-motion 尊重用户偏好
4. **一致性（Consistency）**：同类型组件使用同款曲线与时长（在 CSS 变量中统一）

### 2.2 视觉目标

1. 统一的卡片阴影层次：rest（1 层）/ hover（2 层）/ active（1 层 + scale）
2. 统一的文字信息层级：标题 / 正文 / 辅助文本三档明确区分
3. 统一的间距系统：4 / 8 / 12 / 16 / 20 / 24 px 为基础单位
4. 明确的语义色：primary（操作）/ success（已掌握）/ danger（错误）/ accent（强调）

## 3. CSS 变量系统扩展（index.css）

### 3.1 动效 token（新增）

```css
/* 新增：统一动效曲线与时长 */
--ease-quick: cubic-bezier(0.2, 0, 0.2, 1);
--ease-standard: cubic-bezier(0.32, 0.72, 0, 1);
--ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

--duration-quick: 120ms;
--duration-standard: 250ms;
--duration-slow: 400ms;
--duration-page: 350ms;
```

### 3.2 阴影层次扩展（新增）

```css
--shadow-rest: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06);
--shadow-elevated: 0 4px 8px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
--shadow-pressed: 0 2px 4px rgba(15, 23, 42, 0.04);
--shadow-glow-success: 0 0 0 3px rgba(16, 185, 129, 0.15);
--shadow-glow-danger: 0 0 0 3px rgba(239, 68, 68, 0.15);
--shadow-glow-primary: 0 0 0 3px rgba(59, 130, 246, 0.15);
```

### 3.3 新增关键帧动画

```css
/* 1. 元素滑入（带轻微上升，用于首页分类卡片入场） */
@keyframes slideInUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 2. 元素交错滑入延迟（配合 .stagger-* 使用） */
/* 在 JS 中使用 style.animationDelay 设置 */

/* 3. 轻呼吸（用于空状态插画） */
@keyframes gentleBreathe {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50%      { transform: scale(1.04); opacity: 1; }
}

/* 4. 新卡片徽章闪烁 */
@keyframes badgePulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50%      { transform: scale(1.05); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}

/* 5. 进度条填充（从0到目标宽度，替代纯transition） */
@keyframes progressFill {
  from { width: 0; }
}

/* 6. 环形进度填充（SVG 动画） */
@keyframes ringFill {
  from { stroke-dashoffset: var(--ring-total, 283); }
}

/* 7. 庆祝弹窗弹入（用于完成新一轮） */
@keyframes celebrateIn {
  0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
  60%  { opacity: 1; transform: scale(1.05) translateY(-4px); }
  100% { transform: scale(1) translateY(0); }
}

/* 8. 卡片内容淡入（翻转后内容显现） */
@keyframes cardContentIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 9. 掌握标记滑出（右侧滑出并淡化） */
@keyframes masteredOut {
  from { opacity: 1; transform: translateX(0) rotate(0); }
  to   { opacity: 0; transform: translateX(-60px) rotate(-4deg); }
}

/* 10. 待复习标记滑出（左侧滑出并淡化） */
@keyframes reviewOut {
  from { opacity: 1; transform: translateX(0) rotate(0); }
  to   { opacity: 0; transform: translateX(60px) rotate(4deg); }
}

/* 11. 分类切换时卡片列表淡入 */
@keyframes listFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 12. 图标按钮 Ripple（用于 SVG 按钮按下反馈） */
@keyframes iconRipple {
  from { transform: scale(0.9); opacity: 0.3; }
  to   { transform: scale(1.0); opacity: 1; }
}

/* 13. 分段控件选中项滑入 */
@keyframes segmentSlide {
  from { transform: translateX(-4px); opacity: 0.7; }
  to   { transform: translateX(0); opacity: 1; }
}

/* 14. 数字徽章缩放（轮数变化） */
@keyframes badgePop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}

/* 15. 左滑菜单背景渐进 */
@keyframes swipeMenuReveal {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### 3.4 现有动画与组件的重构

#### 3.4.1 按钮 `.btn` 重构

- **当前**：`:active` 下 `transform: scale(0.96)` + shadow 不变
- **优化后**：
  - `transition: transform var(--duration-quick) var(--ease-quick), box-shadow var(--duration-standard) var(--ease-standard), background-color var(--duration-quick) var(--ease-quick), opacity var(--duration-quick) var(--ease-quick)`
  - `:active` → `scale(0.97)` + `shadow-pressed`
  - `:disabled` → `opacity 0.45` + `pointer-events: none`
  - **新增**：`:focus-visible` 环形聚焦（`box-shadow: var(--shadow-glow-primary)`）

#### 3.4.2 卡片 `.card` 重构

- **当前**：固定阴影 + 边框
- **优化后**：
  - `transition: transform var(--duration-standard) var(--ease-standard), box-shadow var(--duration-standard) var(--ease-standard), border-color var(--duration-quick) var(--ease-quick)`
  - 交互时（`:active`）：`translateY(1px)` + `shadow-pressed`
  - 卡片内容出现：`animation: cardContentIn var(--duration-standard) var(--ease-standard) both`

#### 3.4.3 底部抽屉 `.bottom-sheet` 重构

- **当前**：`animation: slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)`
- **优化后**：保持曲线但**时长改为 350ms** + **加入 2px bounce**（使用 `--ease-bounce`）
- 新增关闭动画：`slideDown 0.3s var(--ease-standard) forwards`

#### 3.4.4 Toast 样式重构

- **当前**：统一的 `animate-toast-in`
- **优化后**：
  - **成功类 Toast**：`animation: toastIn 0.3s var(--ease-bounce) both; box-shadow: var(--shadow-glow-success)`
  - **信息类 Toast**：`animation: toastIn 0.25s var(--ease-standard) both; box-shadow: var(--shadow-glow-primary)`
  - **错误类 Toast**：`animation: toastIn 0.3s var(--ease-bounce) both; box-shadow: var(--shadow-glow-danger)`
  - 新增关闭动画：淡出 200ms 后自动消失（由 ToastView 组件控制）

#### 3.4.5 FAB 按钮优化

- **当前**：`:active` → `scale(0.92)` + 暗色背景
- **优化后**：
  - `transition: transform var(--duration-quick) var(--ease-quick), box-shadow var(--duration-standard) var(--ease-standard), background-color var(--duration-quick) var(--ease-quick)`
  - `:active` → `scale(0.94)` + `shadow-pressed` + `background-color: var(--color-primary-dark)`
  - 首次进入页面时有轻微 entrance 动画（`slideInUp 0.5s var(--ease-emphasized) 0.2s both`）

#### 3.4.6 进度条优化

- **当前**：`transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1)`
- **优化后**：保持时长但**曲线改为 `var(--ease-emphasized)`**
- 首次渲染的 **progress-fill** 加入 `animation: progressFill 0.6s var(--ease-emphasized)`（从 0 填充到目标宽度）

#### 3.4.7 空状态 `.empty-state` 优化

- 插画容器加入 `gentleBreathe` 动画（6s 周期，非常轻微，不吸引过度注意力）
- 空状态文字改为更柔和的渐入：`animation: slideInUp 0.5s var(--ease-standard) both`
- 确保空状态按钮（若有）有明确的 pressed 状态反馈

#### 3.4.8 徽章 `.badge-new` 优化

- 加入 `badgePulse` 动画（2s 周期）突出新卡片
- 其他徽章（`.badge-primary` / `.badge-success` / `.badge-danger`）保持静态

#### 3.4.9 分段控件 `.settings-segmented-item` 优化

- **当前**：`:active:not(.active)` 只有背景色变化
- **优化后**：`:active:not(.active)` → `scale(0.96)` + `shadow-pressed`
- `.active` 项切换时加入 `segmentSlide 0.25s var(--ease-standard) both` 动画
- 背景容器加入 `transition: background-color var(--duration-quick) var(--ease-quick)`

#### 3.4.10 分类栏导航（Memorize 顶部）优化

- **当前**：选中态只有高亮背景
- **优化后**：
  - 选中项的背景色从 0 → 100% 过渡（`transition: background-color var(--duration-quick) var(--ease-quick), color var(--duration-quick) var(--ease-quick), transform var(--duration-quick) var(--ease-quick)`）
  - `:active` → `scale(0.97)`
  - 数字徽章变化时加入 `badgePop 0.3s var(--ease-bounce)`

#### 3.4.11 卡片翻转（Memorize）优化

- **当前**：`card-flip-inner` + `transform: rotateY(180deg)` + `400ms cubic-bezier(0.4, 0, 0.2, 1)`
- **优化后**：
  - 翻转动画时长改为 **450ms** + **曲线为 `var(--ease-emphasized)`**，更有弹性
  - 翻转后的**内容区域**（问题/答案文字）在翻转完成后加入 `cardContentIn 0.3s var(--ease-standard)` 的淡入
  - 卡片在 marked（已掌握 / 待复习）后，加入 `masteredOut` / `reviewOut` 的滑出动画，随后下一张卡片从对应方向滑入
  - 左滑菜单的**操作按钮**从右向左滑入，具有渐进式展开效果

#### 3.4.12 模态对话框重构

- **当前**：`animation: dialogIn 0.25s cubic-bezier(0.32, 0.72, 0, 1)`
- **优化后**：
  - 普通确认框：`dialogIn 0.3s var(--ease-standard) both`
  - 庆祝/完成弹窗：`celebrateIn 0.5s var(--ease-bounce) both`
  - 背景遮罩：`fadeIn 0.25s var(--ease-standard) both`
  - 关闭时加入反向淡出动画（通过 CSS class toggle）

#### 3.4.13 列表 / 分类切换动画

- 分类切换时，新的卡片列表使用 `listFadeIn 0.35s var(--ease-standard) both` 从上方淡入
- 首页分类卡片使用 staggered entrance（`animation-delay: index * 60ms`）

#### 3.4.14 悬浮输入栏（FloatingInputBar）动画优化

- 当前动画比较简单，优化为：
  - 打开时：从屏幕右侧水平滑入（起始位置 `translateX(100%)` → `translateX(0)`），350ms `var(--ease-bounce)`
  - 关闭时：反向滑出，250ms `var(--ease-standard)`
  - 背景遮罩：淡入 150ms

#### 3.4.15 环形掌握率图（SVG）动画

- 当前只有静态显示
- 优化后：环形 stroke-dashoffset 从 `2πr`（空环）过渡到实际值（填充），使用 `ringFill 0.8s var(--ease-emphasized)`
- 中心百分比数字也有数值动画（从 0 → 目标值递增）

#### 3.4.16 图标按钮（`.icon-btn`）优化

- `:active` → `scale(0.94)` + `shadow-pressed`
- `transition: transform var(--duration-quick) var(--ease-quick), background-color var(--duration-quick) var(--ease-quick), color var(--duration-quick) var(--ease-quick), box-shadow var(--duration-quick) var(--ease-quick)`
- 焦点可见环：`:focus-visible { box-shadow: var(--shadow-glow-primary); outline: none; }`

#### 3.4.17 键盘可访问性增强

- 所有按钮/链接加入 `:focus-visible` 状态环
- Tab 键顺序正确（自然 DOM 顺序或 `tabindex`）
- 关键交互可通过 Enter/Space 触发（已有，保持）

## 4. 页面级优化要点

### 4.1 Home 首页（分类列表页）

| 元素 | 优化内容 |
|---|---|
| 顶部标题区 | 加入轻微 slideInUp 动画，页面进入时渐显 |
| 分类卡片列表 | staggered entrance：每张卡片延迟 `index * 60ms` 后 `slideInUp` |
| 分类卡片 | `:active` → `translateY(2px)` + `shadow-pressed` + `border-color: var(--color-primary-alpha)` |
| 卡片侧边色条 | 颜色可根据分类进行随机化（保留固定色），但加入 `transition: background-color 0.3s var(--ease-standard)` |
| FAB | 入场动画 `slideInUp 0.6s var(--ease-emphasized) 0.3s both`；pressed `scale(0.94)` |
| 空状态 | 插画 gentleBreathe 6s；文字 slideInUp；引导按钮更明显 |
| 长按菜单 | bounce-in 动画；选项间加入 1px 分割线和背景色过渡 |

### 4.2 Memorize 背诵页（最复杂的页面）

| 元素 | 优化内容 |
|---|---|
| 顶部分类栏 | 选中项高亮过渡；数字徽标 `badgePop` 变化；`:active` 缩放反馈 |
| 模式选择弹窗 | 每个模式选项加入图标 + 标题 + 描述的垂直布局；选中态有 scale-in 反馈；关闭按钮动画 |
| 卡片翻转内容 | 翻转后内容 `cardContentIn` 淡入；问题/答案使用不同字号层级；艾宾浩斯信息加入渐显 |
| 卡片标记后动画 | 标记「已掌握」 → `masteredOut`（左滑出）；标记「待复习」→ `reviewOut`（右滑出）；下一张卡片从对应方向 `card-slide-in` 进入 |
| 卡片切换 | 上一张/下一张按钮加入 pressed 状态；卡片滑入滑出方向与按钮语义一致 |
| 卡片左滑菜单 | 背景遮罩随手指移动渐暗；操作按钮从屏幕右侧依次滑入（staggered） |
| 顶部进度条 | 百分比数值动画 + 进度条填充 `progressFill`（新分类首次加载时从 0 开始） |
| 底部掌握率环形图 | SVG 圆环 `ringFill` 填充动画；中心数字递增动画 |
| 今日目标输入 | 数值变化时 `badgePop` 小反馈；进度条 `progress-fill` 过渡 |
| 完成庆祝弹窗 | `celebrateIn` 弹入动画；🎉 emoji 轻微浮动；按钮按下 spring-back |
| 重置确认弹窗 | 警告图标使用 danger color 呼吸动画；确认按钮 danger-themed |
| 移动/编辑弹窗 | 弹窗内容 slideInUp 渐入；输入框 focus 时加 glow-ring |
| 加载状态 | 骨架屏加载（替代空白）或 spinner + 文字 |
| 错误状态 | Toast + 图标，有 pulse 呼吸提示 |
| 新卡片徽章 | `badge-new` + `badgePulse` 2s 动画 |

### 4.3 Category 分类详情页

| 元素 | 优化内容 |
|---|---|
| 顶部分类信息 | 分类名 + 卡片数显示，slideInUp 入场 |
| 单元分组（UnitGroup） | 每个单元卡片 staggered entrance；折叠/展开动画更流畅 |
| 卡片列表 | 与首页分类卡片类似的 pressed 状态；新卡片 `badge-new` 徽章 pulse |
| 卡片悬浮操作 | 长按或滑动时的操作面板动画 |
| 悬浮输入栏（FloatingInputBar） | 从右侧 spring-in；内容区域输入焦点时的 glow-ring |

### 4.4 Settings 设置页面组

| 元素 | 优化内容 |
|---|---|
| 分组标题行 | 轻微 fade-in；图标与文字间有微动画 |
| 分段控件（segmented） | 选中项滑入动画 `segmentSlide`；pressed 状态缩放 |
| 设置行（row） | `:active` 背景色过渡更明显（从 `--color-surface` 到 `rgba(0,0,0,0.06)`）；箭头图标轻微位移 |
| 切换开关（switch） | 保持现有动画；按下态滑块轻微 scale(0.9)；状态变化时背景色 `--duration-quick --ease-quick` 过渡 |
| 连接状态指示点 | 状态为「已连接」时加入 `pulse 2s ease-in-out infinite` 呼吸动画 |
| 设置主页面分类卡片 | 每张卡片 staggered entrance；pressed 状态阴影+pressed 过渡 |
| 返回按钮 | 圆形背景 pressed 状态；旋转 180 度进入（或简单 fade） |

### 4.5 StatsDetail 统计详情页

| 元素 | 优化内容 |
|---|---|
| 统计数字 | 数值从 0 递增到目标值（数字动画） |
| 条形/饼图 | 首次渲染从 0 填充到目标值（带缓动） |
| 分类统计列表 | staggered entrance |
| 图表项 hover/pressed | 高亮当前项，放大 1.02 |

### 4.6 Account / CloudData 等数据页

| 元素 | 优化内容 |
|---|---|
| 数据行（row） | 内容变化时（如上传/下载）有进度指示；完成后 success 图标 + 颜色变绿 |
| 操作按钮 | 统一 btn-primary/secondary/danger 样式；按下态 scale(0.97) + shadow-pressed |
| 列表 loading | Skeleton 或 spinner |
| 空数据状态 | gentleBreathe 插画 + 引导文案 |
| Toast 反馈 | 成功/失败使用不同 glow ring 与 bounce 曲线 |

## 5. 新增 CSS 类（便于在 JSX 中引用）

### 5.1 动画类

```css
.anim-slide-in-up { animation: slideInUp var(--duration-standard) var(--ease-standard) both; }
.anim-slide-in-up-slow { animation: slideInUp var(--duration-slow) var(--ease-emphasized) both; }
.anim-slide-in-up-bounce { animation: slideInUp var(--duration-slow) var(--ease-bounce) both; }

.anim-card-content-in { animation: cardContentIn var(--duration-standard) var(--ease-standard) both; }
.anim-mastered-out { animation: masteredOut 0.35s var(--ease-standard) forwards; }
.anim-review-out { animation: reviewOut 0.35s var(--ease-standard) forwards; }

.anim-list-fade-in { animation: listFadeIn 0.35s var(--ease-standard) both; }
.anim-celebrate-in { animation: celebrateIn 0.5s var(--ease-bounce) both; }
.anim-badge-pulse { animation: badgePulse 2s ease-in-out infinite; }
.anim-gentle-breathe { animation: gentleBreathe 6s ease-in-out infinite; }
.anim-badge-pop { animation: badgePop 0.3s var(--ease-bounce) both; }
.anim-segment-slide { animation: segmentSlide 0.25s var(--ease-standard) both; }
.anim-icon-ripple { animation: iconRipple 0.15s var(--ease-quick) both; }
.anim-progress-fill { animation: progressFill 0.6s var(--ease-emphasized) both; }
.anim-ring-fill { animation: ringFill 0.8s var(--ease-emphasized) both; }

.anim-fade-in { animation: fadeIn var(--duration-standard) var(--ease-standard) both; }
.anim-fade-in-slow { animation: fadeIn var(--duration-slow) var(--ease-standard) both; }
.anim-toast-in-success { animation: toastIn 0.3s var(--ease-bounce) both; }
.anim-toast-in-info { animation: toastIn 0.25s var(--ease-standard) both; }
.anim-toast-in-error { animation: toastIn 0.3s var(--ease-bounce) both; }
```

### 5.2 状态增强类

```css
.btn-interactive { transition: transform var(--duration-quick) var(--ease-quick), box-shadow var(--duration-standard) var(--ease-standard), background-color var(--duration-quick) var(--ease-quick), color var(--duration-quick) var(--ease-quick), border-color var(--duration-quick) var(--ease-quick), opacity var(--duration-quick) var(--ease-quick); }
.btn-interactive:active:not(:disabled) { transform: scale(0.97); box-shadow: var(--shadow-pressed); }
.btn-interactive:focus-visible { box-shadow: var(--shadow-glow-primary), 0 4px 6px -1px rgba(0,0,0,0.1); outline: none; }
.btn-interactive:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

.card-interactive { transition: transform var(--duration-standard) var(--ease-standard), box-shadow var(--duration-standard) var(--ease-standard), border-color var(--duration-quick) var(--ease-quick); }
.card-interactive:active { transform: translateY(1px) scale(0.995); box-shadow: var(--shadow-pressed); }

.ring-focus { transition: box-shadow var(--duration-quick) var(--ease-quick); }
.ring-focus:focus-visible { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); outline: none; }

.text-number-animate { transition: transform var(--duration-quick) var(--ease-bounce); }

/* pressed pressed 统一状态（用于非按钮但可点击的行） */
.row-pressable { transition: background-color var(--duration-quick) var(--ease-quick); }
.row-pressable:active { background-color: rgba(0, 0, 0, 0.04) !important; }
```

## 6. 实现策略（摘要）

### 6.1 第一阶段：CSS 系统扩展
- 在 `index.css` 中加入新的 token（动效/阴影）
- 重构现有关键帧与组件样式
- 新增动画类与状态增强类

### 6.2 第二阶段：页面组件样式替换
- 将各页面中**仅使用内联样式**的交互元素改为**使用 CSS 类 + 少量变量**
- 保持视觉风格与当前一致，但统一曲线与时长

### 6.3 第三阶段：新增动效的 JS 支持
- 在 Memorize 页加入卡片标记后的动画状态管理
- 在 Home 页加入 staggered entrance 动画（React state 控制）
- 在 Settings 页加入 segmented control 的选中动画
- 在环形掌握率中加入 stroke-dashoffset 的 CSS 变量驱动

### 6.4 第四阶段：无障碍与边缘情况
- 验证 `prefers-reduced-motion` 在所有关键动画上生效
- 验证 320px 小屏适配
- 验证深色/护眼模式下动画不受影响

## 7. 验收标准摘要

| 标准 | 验证方式 |
|---|---|
| 所有按钮有 idle / active / disabled 三种视觉状态 | 人工检查各页面按钮 |
| 背诵页卡片翻转带有弹性曲线与内容淡入 | 打开 Memorize 翻转卡片 |
| 标记「已掌握」/「待复习」后卡片从对应方向滑出，下一张滑入 | 在 Memorize 中连续标记 |
| 数字徽章（轮数）变化时有 pop 动画 | 点击数字徽标重置轮数 |
| 首页分类卡片 staggered entrance | 初次进入 Home 或切换路由回到 Home |
| 底部抽屉 / 模态框有 bounce-in 弹入 | 打开长按菜单 / 模式选择弹窗 |
| 环形掌握率图从 0 开始填充动画 | 切换到新分类 |
| 分段控件选中项有 slide 动画 | 打开 Settings 切换选项 |
| 所有动画在 prefers-reduced-motion 下被禁用 | 系统设置中开启"减少动画"后检查 |
| 320px 屏宽下所有元素不溢出 | 浏览器 DevTools 切换 320px 宽度 |
