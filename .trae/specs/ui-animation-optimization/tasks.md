# 全局 UI 与动效优化 —— 实施计划 (Tasks)

根据规格文档 `spec.md`，本项目拆分为 **6 个独立任务**，依赖关系为 `Task1 → Task2 → Task3/4/5/6`。

---

## [ ] Task 1：CSS 系统扩展（Design Tokens + 关键帧 + 通用类）

- **优先级**：P0
- **依赖**：无
- **核心目标**：在 `index.css` 中建立完整的动效 token、新关键帧、状态增强类，后续任务全部依赖这些新 token。
- **修改文件**：`src/index.css`
- **实现要点**：

  1.1 在 `@theme { ... }` 块中**追加**以下 CSS 变量（保留原有不变）：
  ```
  --ease-quick: cubic-bezier(0.2, 0, 0.2, 1);
  --ease-standard: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-quick: 120ms;
  --duration-standard: 250ms;
  --duration-slow: 400ms;
  --duration-page: 350ms;
  --shadow-rest: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06);
  --shadow-elevated: 0 4px 8px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
  --shadow-pressed: 0 2px 4px rgba(15, 23, 42, 0.04);
  --shadow-glow-success: 0 0 0 3px rgba(16, 185, 129, 0.15);
  --shadow-glow-danger: 0 0 0 3px rgba(239, 68, 68, 0.15);
  --shadow-glow-primary: 0 0 0 3px rgba(59, 130, 246, 0.15);
  ```

  1.2 在文件末尾（`prefers-reduced-motion` 块之前）追加 16 个新关键帧（参见 spec 3.3 列表）。

  1.3 在关键帧之后追加通用动画类（参见 spec 5.1）：`.anim-slide-in-up` 等 18 个类。

  1.4 在动画类之后追加状态增强类（参见 spec 5.2）：`.btn-interactive`、`.card-interactive`、`.ring-focus`、`.text-number-animate`、`.row-pressable`。

  1.5 **重写** `.btn` 的 transition 声明（保留原有 `:active` / `:disabled`）：
  ```
  transition: transform var(--duration-quick) var(--ease-quick),
              box-shadow var(--duration-standard) var(--ease-standard),
              background-color var(--duration-quick) var(--ease-quick),
              color var(--duration-quick) var(--ease-quick),
              border-color var(--duration-quick) var(--ease-quick),
              opacity var(--duration-quick) var(--ease-quick);
  ```

  1.6 `.btn:active` 改为 `transform: scale(0.97); box-shadow: var(--shadow-pressed);`（比之前更轻）。

  1.7 `.btn:focus-visible { box-shadow: var(--shadow-glow-primary); outline: none; }`（新增，所有按钮都有）。

  1.8 `.card` 的 transition 改为使用 `--ease-standard`；加入 `:active { transform: translateY(1px) scale(0.995); box-shadow: var(--shadow-pressed); }`。

  1.9 `.card-flip-inner` 的 transition 改为 `450ms var(--ease-emphasized)`（更有弹性）。

  1.10 `.bottom-sheet` 的 animation 改为 `slideUp 350ms var(--ease-bounce)`。

  1.11 `.icon-btn` 加入 `:active { transform: scale(0.94); box-shadow: var(--shadow-pressed); }`；加入 `:focus-visible` 环。

  1.12 `.settings-segmented-item.active` 加入 `anim-segment-slide` 并加 `shadow-elevated`。

  1.13 `.fab:active` 改为 `scale(0.94) + shadow-pressed`；加入入场动画 `.anim-slide-in-up-slow`（延迟 300ms）。

  1.14 `.empty-state-icon` 加入 `anim-gentle-breathe`。

  1.15 `.badge-new` 加入 `anim-badge-pulse` 并轻微加大尺寸（`padding: 6px 14px`）。

  1.16 `toast-container` 的 3 种子类（success/info/error）分别使用不同的 `anim-toast-in-*` 动画与 `shadow-glow-*`。

  1.17 `.progress-fill` 的 transition 改为 `width var(--duration-slow) var(--ease-emphasized)`。

  1.18 `.settings-conn-dot.connected` 加入 `pulse 2s ease-in-out infinite` 呼吸动画（类名由 JS 动态添加）。

  1.19 `.switch-slider::before` 按下态加入 `transform: scale(0.9)`（在 pressed 瞬间）。

  1.20 `@media (prefers-reduced-motion: reduce)` 块保留并扩展，确保 `*.anim-*` 系列类也在此被禁用（animation-duration: 0.01ms !important）。

- **验收标准**：`index.css` 通过浏览器解析无误；在 DevTools Elements 面板中可看到新类被应用（后续任务验证）。

---

## [ ] Task 2：Home 首页动效优化

- **优先级**：P1
- **依赖**：Task 1
- **核心目标**：让首页分类列表有更生动的入场、按下、空状态表现。
- **修改文件**：`src/pages/Home.jsx`
- **实现要点**：

  2.1 顶部标题区（h1 + 子标题）加入 `anim-slide-in-up` 动画。

  2.2 分类卡片列表**交错入场**：将 `state.categories.map((cat) => ...)` 中每张卡片的根 `<div className="card">` 改为：
  ```
  className="card card-interactive"
  style={{
    ...(原 style),
    animationDelay: `${index * 60}ms`,
    animation: 'slideInUp var(--duration-standard) var(--ease-standard) both',
    animationDelay: `${index * 60}ms`,
  }}
  ```
  提示：在 React 中通常直接使用 className 加 inline style 设置 `animationDelay` 即可。

  2.3 分类卡片加入 `row-pressable` 语义（`onTouchStart/Move` 保留已有交互逻辑），长按菜单出现时卡片轻微变暗（`opacity: 0.85`）。

  2.4 空状态引导按钮（若有）采用 `.btn-primary` + `btn-interactive`。

  2.5 FAB 加入 `btn-interactive`，确保按下态有明显 scale 变化。

  2.6 长按菜单从底部弹出使用 `slideUp 350ms var(--ease-bounce) both`，选项依次 fade-in（延迟 `index * 40ms`）。

  2.7 分类卡片左侧色条加入 `transition: background-color 0.3s var(--ease-standard)`。

- **验收标准**：
  - 进入 Home 页，分类卡片依次从下方淡入，延迟合理不卡顿
  - 点击分类卡片有 pressed 状态（轻微下压与阴影变化）
  - 长按菜单弹出带 spring 反馈，关闭时反向滑出
  - 空状态插画呼吸，不干扰注意力

---

## [ ] Task 3：Memorize 背诵页动效优化（最关键页面）

- **优先级**：P1
- **依赖**：Task 1
- **核心目标**：让卡片翻转、标记、切换、进度、弹窗等所有交互都带有恰当的过渡动画。
- **修改文件**：`src/pages/Memorize.jsx`（核心）
- **实现要点**：

  3.1 **顶部分类栏动效**：
  - 每个分类按钮根元素加入 `btn-interactive`；`:active` 自动获得 scale(0.97)
  - 分类切换时，整个栏的内容使用 `list-fade-in` 重新渲染（通过 key prop 控制）
  - 轮数数字徽标在 `round` 变化时加 `anim-badge-pop`（通过 key 强制重新挂载或 CSS class toggle）

  3.2 **模式选择弹窗**：
  - 背景遮罩：`fadeIn 250ms var(--ease-standard)`
  - 弹框内容：`slideUp 350ms var(--ease-bounce)`
  - 每个模式选项在选择时加入 `anim-celebrate-in` 效果（轻微弹入）

  3.3 **卡片翻转动画增强**：
  - 翻转后，**卡片正面 / 背面的文字内容**根 `<div>` 加入 `anim-card-content-in`（在翻转完成后触发）
  - 在 `handleFlip` 中加入 225ms 延迟后 `setTimeout(() => { /* 允许下一次翻转 */ }, 225)` 防抖
  - 艾宾浩斯信息卡片底部文字：数字变化时加 `text-number-animate`

  3.4 **卡片标记后动画（masteredOut / reviewOut）**：
  - 点击「已掌握」按钮 → 在 200ms 延迟后对当前卡片容器加 `anim-mastered-out` 类，然后在下一张卡片滑入时自动清除
  - 点击「待复习」 → `anim-review-out`
  - 下一张卡片根据上一张的滑出方向：若上一张向左滑出，下一张从右侧 `card-slide-in-left` 进入；反之亦然
  - 此逻辑需要新状态 `const [cardAnimClass, setCardAnimClass] = useState('')` 和 `const [nextCardAnimClass, setNextCardAnimClass] = useState('')`
  - 在 `handleMark` 的 setTimeout 之后：
    ```javascript
    if (status === 'mastered') {
      setCardAnimClass('anim-mastered-out');
      setNextCardAnimClass('card-slide-in-right');
    } else {
      setCardAnimClass('anim-review-out');
      setNextCardAnimClass('card-slide-in-left');
    }
    // 380ms 后重置为空
    setTimeout(() => { setCardAnimClass(''); setNextCardAnimClass(''); }, 380);
    ```

  3.5 **卡片左滑菜单动效**：
  - 滑动过程中背景遮罩透明度随 `swipeX` 渐变（`opacity: Math.abs(swipeX) / 150`）
  - 操作按钮从卡片右侧滑入时 staggered（`index * 80ms` delay + `slideInUp`）
  - 取消点击后菜单 `slideDown 250ms var(--ease-standard)`

  3.6 **顶部进度条动效**：
  - 进度条容器保留 `.progress-track`，填充 `.progress-fill` 的宽度数值变化过渡 `350ms var(--ease-emphasized)`
  - "第 M / N 张" 文字使用 `text-number-animate`（数值变化时微小 scale pop）
  - 每次切换分类时强制从 0 开始（通过 key 重置 DOM，使 `anim-progress-fill` 从 0 动画到目标宽度）

  3.7 **底部掌握率环形图动效**：
  - 构建 SVG 环形进度：`r=40, circumference=2*π*40≈251`，`stroke-dasharray: "251"`, `stroke-dashoffset: (100 - masteryPercent) / 100 * 251`
  - 首次渲染或分类切换时：`anim-ring-fill` 从空环填到目标值
  - 中心数字：`useEffect` 在 masteryPercent 变化时触发 `text-number-animate`（scale pop）
  - 底部统计数字（已掌握 / 待复习 / 新）每次变化时加 `text-number-animate`

  3.8 **今日目标输入动效**：
  - 今日完成数字变化：`text-number-animate`
  - 进度条：`progress-fill` 与顶部一致
  - 输入框 focus：`ring-focus` glow

  3.9 **完成庆祝弹窗动效**：
  - 弹窗：`anim-celebrate-in`
  - 🎉 emoji 或图标：`anim-badge-pop` + 轻微 `gentle-breathe`
  - 背景遮罩：`fadeIn 250ms var(--ease-standard)`
  - 「开始新一轮」按钮 pressed spring-back

  3.10 **重置确认 / 移动 / 删除 / 编辑弹窗**：
  - 统一：遮罩 `fadeIn 250ms var(--ease-standard)` + 内容 `slideUp 350ms var(--ease-bounce)`
  - 危险操作（删除/重置）图标加入 `pulse` 呼吸 + danger color
  - 输入框 focus：`ring-focus` glow

  3.11 **新卡片徽章动效**：
  - 对 `newCardIds` 中的卡片：在徽章处加入 `anim-badge-pulse` + `badge-new`

  3.12 **加载与错误状态动效**：
  - loading：spinner `anim-spin` + 文字 `anim-fade-in`
  - error：Toast `anim-toast-in-error`

  3.13 **卡片滑入滑出一致性**：
  - 手动切换上一张/下一张按钮时：保持与标记逻辑一致的方向动画
  - 点击「上一张」 → 当前卡片 `card-slide-out-right` + 上一张 `card-slide-in-right`
  - 点击「下一张」 → 当前卡片 `card-slide-out-left` + 下一张 `card-slide-in-left`
  - 注意：需要一个新的 `slidePhase` 状态变量与 `animating` 防抖控制

  3.14 **分类切换动效**：
  - 切换分类时，卡片区整体 `anim-list-fade-in`（通过 React key 控制重新触发）
  - 顶部栏文字数字徽标 `anim-badge-pop`

- **验收标准**：
  - 翻转卡片有弹性曲线；翻转后文字平滑淡入
  - 标记掌握/复习时卡片从对应方向滑出，下一张从另一侧滑入
  - 进度条与环形图从 0 过渡到目标值，无跳跃
  - 庆祝弹窗有明显 spring bounce 入场
  - 数字徽章变化时有 pop 动画
  - 所有动效在 `prefers-reduced-motion` 下被禁用

---

## [ ] Task 4：分类详情页（Category.jsx）动效优化

- **优先级**：P2
- **依赖**：Task 1
- **核心目标**：单元组 + 卡片列表的展示与悬浮输入栏动效。
- **修改文件**：`src/pages/Category.jsx`、`src/components/FloatingInputBar.jsx`、`src/components/UnitGroup.jsx`
- **实现要点**：

  4.1 **顶部信息**：分类名 + 卡片数 `anim-slide-in-up` 入场。

  4.2 **UnitGroup 组件**：
  - 每个 Unit 卡片 `anim-slide-in-up` + `animationDelay: ${index * 50}ms`
  - 单元折叠/展开：保持原 max-height 过渡，加入内容 opacity fade（折叠时 1→0）

  4.3 **卡片列表**：
  - 卡片内容区：`card-interactive` + `row-pressable`
  - 新卡片徽章：`anim-badge-pulse` + `badge-new`
  - 长按/编辑/删除确认弹框：统一 `slideUp 350ms var(--ease-bounce)`

  4.4 **FloatingInputBar 悬浮输入栏**：
  - 打开时：从右侧 `translateX(100%)` → `translateX(0)`，`350ms var(--ease-bounce)`
  - 关闭时：反向滑出 `250ms var(--ease-standard)`
  - 背景遮罩：`fadeIn 150ms var(--ease-standard)`
  - 输入焦点：`ring-focus` glow
  - 发送/取消按钮：`btn-interactive`

- **验收标准**：
  - 进入 Category 页：单元组依次 fade-in-up
  - 展开/收起单元：有平滑过渡，无闪烁
  - 打开悬浮输入栏：spring-in 自右边缘弹入
  - 按钮均有 pressed 状态

---

## [ ] Task 5：设置页面组动效优化

- **优先级**：P2
- **依赖**：Task 1
- **核心目标**：统一设置类页面的行、分段控件、开关、返回按钮等交互。
- **修改文件**：
  - `src/pages/Settings.jsx`
  - `src/pages/SettingsMain.jsx`
  - `src/pages/SettingsAiService.jsx`
  - `src/pages/SettingsSpeech.jsx`
  - `src/pages/SettingsDisplay.jsx`
  - `src/components/*`（必要时）
- **实现要点**：

  5.1 **分段控件**：
  - `.settings-segmented-item` 加入 `btn-interactive` 基础样式
  - 选中项切换时：`anim-segment-slide` + `shadow-elevated`（通过 key 控制 class toggle）

  5.2 **设置行（row）**：
  - 所有 `settings-row-clickable` 加入 `row-pressable`
  - 行内箭头：`transition: transform var(--duration-quick) var(--ease-quick)`；按下时 `translateX(2px)`

  5.3 **切换开关**：
  - `.switch-slider` 的 transition 改为 `background-color var(--duration-quick) var(--ease-quick)`
  - `.switch-slider::before` 的 transition 改为 `transform var(--duration-quick) var(--ease-bounce)`
  - 按下瞬间（`:active`）滑块 `scale(0.9)`

  5.4 **返回按钮**：
  - `.settings-back-btn` 加入 `btn-interactive`；保持圆形点击区域

  5.5 **设置主页面分类卡片**：
  - 每张分类卡片 `anim-slide-in-up` + staggered `index * 50ms`
  - 卡片内容根容器 `card-interactive`

  5.6 **连接状态指示点**：
  - 连接成功时在 `settings-conn-dot` 上加入 `.connected` 类
  - `.settings-conn-dot.connected` 触发呼吸动画：`animation: pulse 2s ease-in-out infinite`

  5.7 **状态条**：
  - `settings-status` 容器加入 `row-pressable`
  - 内部图标与文字加入 `anim-slide-in-up`（首次渲染时）

  5.8 **输入框**：
  - `settings-input` 的 focus 加入 `ring-focus` glow
  - 输入焦点时 border-color 过渡到 `--color-primary`

  5.9 **眼睛按钮（显示/隐藏密码）**：
  - 加入 `btn-interactive` + 圆形点击区域

  5.10 **管理面板展开/收起**：
  - max-height 曲线改为 `var(--ease-emphasized)`，时长 `400ms`
  - 内容同时有 opacity 0 → 1 淡入

- **验收标准**：
  - 所有按下操作有视觉反馈（scale / shadow / color）
  - 切换 segmented control 有方向感滑入动画
  - 返回/切换开关有 spring 反馈
  - 连接成功的小圆点持续呼吸（不干扰阅读）

---

## [ ] Task 6：Account、CloudData、StatsDetail 等页面动效

- **优先级**：P2
- **依赖**：Task 1
- **核心目标**：让其它页面也保持一致的动效风格（数据行、按钮、列表、空状态）。
- **修改文件**：
  - `src/pages/Account.jsx`
  - `src/pages/CloudData.jsx`
  - `src/pages/CloudDataDetail.jsx`
  - `src/pages/StatsDetail.jsx`
- **实现要点**：

  6.1 **数据行（row）统一**：
  - 所有可点击 row 加入 `row-pressable`
  - 行内操作按钮加入 `btn-interactive`（primary / secondary / danger 视情况）

  6.2 **进度指示行（上传/下载）**：
  - 操作中显示微型进度条 `progress-fill`（从 0 到 100%，曲线 `--ease-standard`）
  - 完成后进度条淡出 + 成功图标淡入（`fadeIn 300ms`）

  6.3 **空数据状态**：
  - 与 Home 页一致：插画 `anim-gentle-breathe` + 文字 `anim-slide-in-up`
  - 提供的操作按钮 `btn-primary` + `btn-interactive`

  6.4 **列表 loading**：
  - 显示 skeleton 占位或 spinner（保持简洁，避免过度装饰）
  - skeleton 使用闪烁动画 `pulse 1.8s ease-in-out infinite` 背景

  6.5 **StatsDetail 统计图表**：
  - 柱状图：首次渲染从 0 增长到目标高度
  - 分类饼图：圆环分段从 0 填充到目标值（类似 Memorize 的 ring-fill）
  - 数字统计：`text-number-animate`（scale pop）

  6.6 **Toast 反馈**：
  - 成功操作 Toast 调用 `showToast({ type: 'success', ... })` → `anim-toast-in-success`
  - 失败操作 → `anim-toast-in-error`
  - 信息提示 → `anim-toast-in-info`

  6.7 **按钮统一样式**：
  - 所有 `<button>` 或可点击元素加入 `btn-interactive`（若是 .btn 类则已自动获得）
  - 危险操作（删除数据、断开连接）使用 `.btn-danger` 而非默认主题

- **验收标准**：
  - 各页面的列表、空状态、按钮、Toast 风格与 Home/Memorize/Settings 一致
  - 统计页图表与数字有入场动效，不干扰阅读
  - 操作中与完成后的反馈清晰可见

---

## [ ] 整体验收清单

- [ ] Task 1 已完成：`index.css` 中的新 token / 关键帧 / 类存在且通过浏览器解析
- [ ] Task 2 已完成：Home 页分类卡片 staggered entrance、长按菜单 spring-in、空状态呼吸、FAB pressed
- [ ] Task 3 已完成：Memorize 卡片翻转 + 标记滑出滑入 + 进度条/环形图过渡 + 各类弹窗 spring-in + 徽章 pulse/pop
- [ ] Task 4 已完成：Category 页单元组 entrance、FloatingInputBar 右侧 spring-in
- [ ] Task 5 已完成：Settings 页 segmented control 动画、行 pressed、开关 spring、返回按钮 pressed、连接点呼吸
- [ ] Task 6 已完成：Account / CloudData / StatsDetail 数据行/图表/空状态/Toast 统一风格
- [ ] 所有新动画在 `prefers-reduced-motion` 下被禁用
- [ ] 320px 小屏下无溢出
- [ ] 交互反馈（pressed / focus-visible）覆盖所有主要按钮
