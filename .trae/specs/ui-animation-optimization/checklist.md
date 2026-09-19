# 全局 UI 与动效优化 —— 验证清单 (Checklist)

## 基础 CSS 系统（Task 1）

- [ ] 1.1 `index.css` 中包含 `--ease-quick` / `--ease-standard` / `--ease-emphasized` / `--ease-bounce` 四个曲线变量
- [ ] 1.2 `index.css` 中包含 `--duration-quick` / `--duration-standard` / `--duration-slow` / `--duration-page` 四个时长变量
- [ ] 1.3 `index.css` 中包含 `--shadow-rest` / `--shadow-elevated` / `--shadow-pressed` / `--shadow-glow-success` / `--shadow-glow-danger` / `--shadow-glow-primary` 六个阴影变量
- [ ] 1.4 `index.css` 包含 16 个新关键帧（slideInUp / gentleBreathe / badgePulse / progressFill / ringFill / celebrateIn / cardContentIn / masteredOut / reviewOut / listFadeIn / iconRipple / segmentSlide / badgePop / swipeMenuReveal / toastIn / pulse）
- [ ] 1.5 `index.css` 包含 18 个 `.anim-*` 类（slide-in-up / slide-in-up-slow / slide-in-up-bounce / card-content-in / mastered-out / review-out / list-fade-in / celebrate-in / badge-pulse / gentle-breathe / badge-pop / segment-slide / icon-ripple / progress-fill / ring-fill / fade-in / fade-in-slow / toast-in-success / toast-in-info / toast-in-error）
- [ ] 1.6 `index.css` 包含 `btn-interactive` / `card-interactive` / `ring-focus` / `text-number-animate` / `row-pressable` 五个状态增强类
- [ ] 1.7 `.btn` 的 transition 声明使用新变量系统且 `:active { transform: scale(0.97); box-shadow: var(--shadow-pressed); }`
- [ ] 1.8 `.btn:focus-visible` 有明显的 glow-ring（`var(--shadow-glow-primary)`）
- [ ] 1.9 `.card` 的 transition 使用 `--ease-standard`，`:active` 有 translateY + shadow 变化
- [ ] 1.10 `.card-flip-inner` 的 transition 为 `450ms var(--ease-emphasized)`
- [ ] 1.11 `.bottom-sheet` 的 animation 为 `slideUp 350ms var(--ease-bounce)`
- [ ] 1.12 `.icon-btn` 的 `:active` 有 scale(0.94) + shadow-pressed
- [ ] 1.13 `.settings-segmented-item.active` 有 `anim-segment-slide` + `shadow-elevated`
- [ ] 1.14 `.fab:active` 为 `scale(0.94) + shadow-pressed`，入场有 slide-in-up-slow（300ms delay）
- [ ] 1.15 `.empty-state-icon` 有 `anim-gentle-breathe`
- [ ] 1.16 `.badge-new` 有 `anim-badge-pulse`
- [ ] 1.17 `toast-success/info/error` 使用不同的 `anim-toast-in-*` 与 `shadow-glow-*`
- [ ] 1.18 `.progress-fill` 的 transition 为 `width var(--duration-slow) var(--ease-emphasized)`
- [ ] 1.19 `@media (prefers-reduced-motion: reduce)` 禁用了所有 `*.anim-*` 类的动画

## Home 首页（Task 2）

- [ ] 2.1 进入 Home 页，顶部标题区 `h1` 与子标题 `p` 有 slide-in-up 渐入
- [ ] 2.2 分类卡片列表 staggered entrance：每张卡片延迟递增（约 60ms/张），从下方滑入
- [ ] 2.3 分类卡片（`.card.card-interactive`）在 pressed 时有 translateY(1px) + shadow-pressed 反馈
- [ ] 2.4 FAB 按钮 pressed 有明显的 scale(0.94) + shadow-pressed + 背景色变化
- [ ] 2.5 FAB 首次进入有 slide-in-up-slow 入场（300ms delay）
- [ ] 2.6 空状态插画有 gentle-breathe 呼吸动画，不抢注意力
- [ ] 2.7 长按菜单 spring-in（350ms, bounce）从底部弹出，关闭时反向 slide-down
- [ ] 2.8 长按菜单的选项依次 fade-in（staggered 40ms/项）
- [ ] 2.9 分类卡片左侧色条有 `transition: background-color`

## Memorize 背诵页（Task 3，核心页面）

### 顶部分类栏
- [ ] 3.1 每个分类按钮 pressed 有 scale 反馈（`btn-interactive`）
- [ ] 3.2 切换分类后，内容区 `list-fade-in` 重新渲染（无瞬时跳跃）
- [ ] 3.3 轮数数字徽标变化时有 `anim-badge-pop`（scale pop）

### 模式选择弹窗
- [ ] 3.4 背景遮罩 `fadeIn 250ms var(--ease-standard)`
- [ ] 3.5 弹窗内容 `slideUp 350ms var(--ease-bounce)`
- [ ] 3.6 每个模式选项选中时有轻微弹入效果

### 卡片翻转
- [ ] 3.7 卡片翻转时长 ≈ 450ms，曲线为 emphasized（有弹性感）
- [ ] 3.8 翻转完成后，问题/答案文字 `card-content-in` 淡入（不与翻转冲突）
- [ ] 3.9 翻转期间防抖（225ms 内禁止重复翻转）

### 卡片标记后动画
- [ ] 3.10 点击「已掌握」 → 卡片向左滑出并淡出（mastered-out 350ms）
- [ ] 3.11 点击「待复习」 → 卡片向右滑出并淡出（review-out 350ms）
- [ ] 3.12 上一张滑出后，下一张卡片从对应方向滑入（slide-in）
- [ ] 3.13 标记期间无重复点击 bug（防抖 / animating 标志位）

### 卡片左滑菜单
- [ ] 3.14 左滑时背景遮罩透明度随手指位置渐变（swipeX/150 线性映射）
- [ ] 3.15 左滑菜单的操作按钮 staggered 出现（80ms/项）
- [ ] 3.16 取消或完成操作后，菜单平滑滑下消失

### 进度与统计
- [ ] 3.17 顶部进度条宽度变化 400ms ease-emphasized（无瞬时跳跃）
- [ ] 3.18 首次加载或切换分类时，进度条从 0 填充到目标值（progress-fill 动画）
- [ ] 3.19 "第 M / N 张" 数字变化时有 `text-number-animate` scale pop
- [ ] 3.20 底部掌握率环形图从 0 填充到目标值（ring-fill 800ms）
- [ ] 3.21 中心百分比数字有数值动画（从 0 递增到目标值）
- [ ] 3.22 已掌握 / 待复习 / 新卡片数字变化时有 `text-number-animate`

### 今日目标
- [ ] 3.23 今日完成数字变化时 `text-number-animate`
- [ ] 3.24 目标进度条与顶部进度条风格一致
- [ ] 3.25 输入框 focus 时有 ring-focus glow

### 完成庆祝弹窗
- [ ] 3.26 弹窗 `celebrate-in` 弹入（带 spring bounce）
- [ ] 3.27 背景遮罩 fade-in
- [ ] 3.28 确认按钮 pressed 有 spring-back

### 确认/移动/删除/编辑弹窗
- [ ] 3.29 所有此类弹窗统一：fade-in 遮罩 + slide-up-bounce 内容
- [ ] 3.30 危险操作（删除/重置）的图标有 pulse 呼吸 + danger color
- [ ] 3.31 弹窗内输入框 focus 有 ring-focus glow

### 新卡片徽章
- [ ] 3.32 新卡片（newCardIds 内）的徽章有 `anim-badge-pulse`

### 加载与错误
- [ ] 3.33 loading 状态有 spinner + 文字 fade-in
- [ ] 3.34 error 状态触发 toast-in-error 动画

### 手动翻卡（上下一张）
- [ ] 3.35 点击上一张 → 当前卡 right-out + 上一张 right-in
- [ ] 3.36 点击下一张 → 当前卡 left-out + 下一张 left-in
- [ ] 3.37 动画期间按钮有视觉反馈（与标记时不冲突）

### 分类切换整体
- [ ] 3.38 切换分类时卡片区整体 list-fade-in（通过 key 触发）
- [ ] 3.39 顶部数字徽标 badge-pop 更新

## Category 分类详情页（Task 4）

- [ ] 4.1 进入页面，顶部分类信息 slide-in-up
- [ ] 4.2 每个 Unit 组 slide-in-up + staggered（50ms/组）
- [ ] 4.3 Unit 展开/折叠有 max-height + opacity 过渡
- [ ] 4.4 卡片内容区 card-interactive + row-pressable
- [ ] 4.5 新卡片徽章 anim-badge-pulse
- [ ] 4.6 编辑/删除确认弹框 slide-up-bounce
- [ ] 4.7 FloatingInputBar 打开时从右侧 spring-in
- [ ] 4.8 FloatingInputBar 关闭时反向滑出
- [ ] 4.9 FloatingInputBar 背景遮罩 fade-in
- [ ] 4.10 FloatingInputBar 输入焦点 ring-focus glow
- [ ] 4.11 FloatingInputBar 内按钮 btn-interactive pressed 反馈

## 设置页面组（Task 5）

- [ ] 5.1 分段控件（segmented）的选中项切换时 `anim-segment-slide` 滑入动画
- [ ] 5.2 分段控件未选中项 pressed 时有 scale(0.96) + shadow-pressed
- [ ] 5.3 分段控件选中项 `shadow-elevated` 阴影
- [ ] 5.4 所有 `settings-row-clickable` 行加入 `row-pressable`，pressed 背景色明显过渡
- [ ] 5.5 行内箭头在 pressed 时轻微 translateX(2px)
- [ ] 5.6 切换开关 `.switch-slider::before` 的 transition 使用 `--ease-bounce`
- [ ] 5.7 切换开关按下瞬间 scale(0.9)
- [ ] 5.8 返回按钮 `settings-back-btn` 有 btn-interactive pressed 状态
- [ ] 5.9 SettingsMain 分类卡片 slide-in-up + staggered 入场
- [ ] 5.10 分类卡片 card-interactive pressed 反馈
- [ ] 5.11 连接成功状态的小圆点 `.connected` 触发 `pulse 2s ease-in-out infinite` 呼吸
- [ ] 5.12 settings-status 条加入 row-pressable
- [ ] 5.13 settings-input focus 有 ring-focus glow + border-color 过渡到 primary
- [ ] 5.14 眼睛按钮（密码显示/隐藏）加入 btn-interactive + 圆形点击区
- [ ] 5.15 管理面板展开/收起时长 400ms ease-emphasized
- [ ] 5.16 管理面板展开时内容同时 fade-in（opacity 0→1）

## Account / CloudData / StatsDetail（Task 6）

- [ ] 6.1 Account / CloudData 中的可点击 row 加入 row-pressable
- [ ] 6.2 行内操作按钮加入 btn-interactive
- [ ] 6.3 上传/下载中有进度条 progress-fill 动画（从 0 增长）
- [ ] 6.4 操作完成后进度条淡出 + 成功图标淡入（fadeIn 300ms）
- [ ] 6.5 空数据状态插画 gentle-breathe + 文字 slide-in-up
- [ ] 6.6 空数据状态的操作按钮 btn-primary + btn-interactive
- [ ] 6.7 列表 loading 时显示 skeleton 或 spinner（pulse 闪烁）
- [ ] 6.8 StatsDetail 柱状图首次渲染从 0 增长到目标高度
- [ ] 6.9 StatsDetail 饼图/圆环从 0 填充到目标值（ring-fill 风格）
- [ ] 6.10 StatsDetail 数字统计 text-number-animate（scale pop）
- [ ] 6.11 成功操作 Toast 触发 toast-in-success
- [ ] 6.12 失败操作 Toast 触发 toast-in-error
- [ ] 6.13 信息提示 Toast 触发 toast-in-info

## 可访问性与适配

- [ ] 7.1 在系统设置中开启「减少动态效果」后，页面无持续动画（pulse / breathe 等被禁用）
- [ ] 7.2 单次操作动画（slide-in / fade-in）仍保留但时长被压缩至 0.01ms（即瞬时完成）
- [ ] 7.3 320px 小屏下所有元素无横向溢出（浏览器 DevTools 320px 宽度检查）
- [ ] 7.4 320px 屏下按钮文字完整不被截断；徽章数字不溢出
- [ ] 7.5 横屏模式下（768px 内）所有内容可见可点
- [ ] 7.6 所有主要按钮 focus-visible 时显示明显的 glow-ring
- [ ] 7.7 触控目标 ≥ 44×44px（或等效可点击区）

## 功能一致性与性能

- [ ] 8.1 所有页面的 Toast 反馈风格统一（success/info/error 三种）
- [ ] 8.2 所有 `.card` 的阴影层次统一（rest → elevated → pressed）
- [ ] 8.3 所有按钮 pressed 状态均为 scale(0.96~0.97) + shadow-pressed 级别
- [ ] 8.4 无视觉冲突：两个高优先级动画（如 FAB + 卡片）不会同时运行超过 1 秒
- [ ] 8.5 低端设备上（可手动模拟慢速）动画仍流畅（无明显掉帧）
- [ ] 8.6 CSS 变量在所有使用场景下均能正确解析（无 undefined 颜色）
- [ ] 8.7 所有新样式不破坏现有功能（卡片翻转仍工作、标记仍工作、弹窗仍工作）
- [ ] 8.8 构建/打包无 CSS 语法错误
