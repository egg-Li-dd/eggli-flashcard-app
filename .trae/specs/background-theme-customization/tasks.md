# 背景自定义与界面风格调节 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 新增状态管理与存储键（数据层）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 `constants.js` 的 `STORAGE_KEYS` 中新增背景风格相关存储键：
    - `BG_PRESET`、`BG_IMAGE`、`BG_IMAGE_MODE`、`BG_BLUR`、`BG_MASK_OPACITY`
    - `CARD_RADIUS`、`CARD_SHADOW`、`CARD_BORDER`、`CARD_OPACITY`
    - `BTN_PRIMARY_OPACITY`、`BTN_SECONDARY_OPACITY`
    - `STYLE_SCHEMES`（保存的风格方案列表）、`ACTIVE_STYLE_SCHEME`（当前应用的方案ID）
  - 在 `AppContext.jsx` 中新增 state 字段和对应的 dispatch action、setter 函数
  - 新增 `useEffect` 将状态同步到 CSS 变量（`--card-radius`、`--card-shadow`、`--card-opacity`、`--btn-primary-opacity`、`--btn-secondary-opacity`、`--bg-image`、`--bg-blur`、`--bg-mask` 等）
  - 新增风格方案管理函数：`saveStyleScheme`、`deleteStyleScheme`、`renameStyleScheme`、`applyStyleScheme`
- **Acceptance Criteria Addressed**: AC-6, AC-10, AC-11, AC-12, AC-13
- **Test Requirements**:
  - `programmatic` TR-1.1: AppContext 初始化时正确从 localStorage 读取所有新字段，缺省值为默认值
  - `programmatic` TR-1.2: 调用 setter 函数后，state 更新且 localStorage 同步写入
  - `programmatic` TR-1.3: 刷新页面后，设置保持不变
  - `programmatic` TR-1.4: 风格方案 CRUD 函数工作正常
- **Files**:
  - Modify: `src/utils/constants.js`（STORAGE_KEYS 新增）
  - Modify: `src/context/AppContext.jsx`（state、reducer、actions、setters、CSS 变量同步、方案管理函数）

## [x] Task 2: CSS 变量与样式适配（样式层）
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在 `index.css` 的 `:root` 中新增背景与风格相关 CSS 变量（默认值与当前一致）
  - 新增 6 套预设主题的 CSS 类（通过 `data-bg-preset` 属性切换）
    - 默认浅色 / 默认深色 / 护眼米色 / 清新蓝调 / 柔和紫霞 / 极简灰白
  - 修改 `.card`、`.card-flip-container`、`.card-flip-container` 等卡片样式，使用新的 CSS 变量控制圆角、阴影、边框、透明度
  - 修改 `.btn`、`.btn-primary`、`.btn-secondary`、`.btn-ghost` 等按钮样式，支持透明度变量
  - 新增背景图片相关样式（`--bg-image`、`--bg-blur`、`--bg-mask`），通过 `::before` 伪元素实现背景图层
  - 确保深色模式（`data-theme="dark"`）和护眼模式（`data-eye-protection="true"`）下变量正确适配
  - 背景图片层级：背景图在最底层，然后是遮罩，然后是内容
- **Acceptance Criteria Addressed**: AC-2, AC-4, AC-5, AC-7, AC-10
- **Test Requirements**:
  - `programmatic` TR-2.1: 设置 `data-bg-preset` 为各预设值时，`--color-bg` 等变量正确变化
  - `human-judgement` TR-2.2: 卡片圆角/阴影/边框/透明度变量修改后视觉效果正确
  - `human-judgement` TR-2.3: 按钮透明度变量修改后视觉效果正确
  - `human-judgement` TR-2.4: 深色模式 + 自定义风格组合下文字清晰可读
  - `human-judgement` TR-2.5: 背景图片正确显示，遮罩和模糊效果正确
- **Files**:
  - Modify: `src/index.css`（CSS 变量、预设主题类、卡片/按钮样式适配、背景图层）

## [x] Task 3: 「背景与风格」页面 UI（界面层）
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在 `SettingsDisplay.jsx` 「显示与偏好」页面新增「背景与风格」入口行，显示当前方案名称
  - 创建新页面 `SettingsBackground.jsx`（背景与风格设置页）
  - 页面结构：顶部返回栏 + 滚动内容区
  - 内容分区：
    1. 我的方案（风格方案列表 + 保存按钮）
    2. 预设背景
    3. 自定义背景
    4. 卡片风格
    5. 按钮透明度
    6. 恢复默认
  - 在 `App.jsx` 中注册新路由 `/settings/display/background`
  - 在设置主列表中更新「显示与偏好」的描述文案
- **Acceptance Criteria Addressed**: AC-1, AC-9
- **Test Requirements**:
  - `human-judgement` TR-3.1: 「显示与偏好」页面能看到「背景与风格」入口，显示当前方案名，点击正确跳转
  - `human-judgement` TR-3.2: 新页面布局清晰，分区明确，移动端适配良好
  - `programmatic` TR-3.3: 路由 `/settings/display/background` 可正确访问
- **Files**:
  - Modify: `src/pages/SettingsDisplay.jsx`（新增入口行）
  - Create: `src/pages/SettingsBackground.jsx`（新页面骨架）
  - Modify: `src/App.jsx`（注册新路由）
  - Modify: `src/pages/SettingsMain.jsx`（更新描述）

## [x] Task 4: 预设背景主题选择功能
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Description**:
  - 在 `SettingsBackground.jsx` 中实现预设主题选择区域
  - 6 个预设主题以卡片网格形式展示（2列）
  - 每个卡片显示预览色块 + 主题名称
  - 当前选中项有边框高亮标识
  - 点击即调用 `setBgPreset` 应用主题
  - 选择自定义图片时，预设项显示为「自定义」
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-4.1: 6 个预设主题卡片以网格形式展示，样式美观
  - `human-judgement` TR-4.2: 点击任一预设，背景即时切换，效果正确
  - `human-judgement` TR-4.3: 当前选中项有清晰的视觉标识
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（预设主题选择区）

## [x] Task 5: 自定义背景图片功能（Web 端）
- **Priority**: high
- **Depends On**: Task 2, Task 4
- **Description**:
  - 实现图片选择上传功能（`<input type="file">` 触发）
  - 图片读取为 base64 存入 state 和 localStorage
  - 图片显示模式选择：填充 / 适应 / 平铺 / 居中（Segmented 控件）
  - 背景模糊度滑块：0 - 20px
  - 背景遮罩透明度滑块：0% - 60%（保证文字可读）
  - 「清除背景」按钮，恢复为预设背景
  - 实时预览背景效果（预览区域）
- **Acceptance Criteria Addressed**: AC-3, AC-7
- **Test Requirements**:
  - `human-judgement` TR-5.1: 选择图片后背景立即显示，效果正确
  - `human-judgement` TR-5.2: 图片模式切换（填充/适应/平铺/居中）效果正确
  - `human-judgement` TR-5.3: 模糊度和遮罩透明度调节即时生效
  - `programmatic` TR-5.4: 清除背景后，bgImage 清空，恢复预设主题
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（自定义背景区）
  - Modify: `src/index.css`（背景图片相关样式细节）

## [ ] Task 6: 移动端拍照/相册选图
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - 检查项目是否已安装 `@capacitor/camera` 插件，如未安装则安装
  - 实现移动端图片选择：底部弹出 ActionSheet（拍照 / 从相册选择 / 取消）
  - 使用 `@capacitor/camera` 的 `getPhoto` 方法
  - 拍照和相册选择结果统一转为 base64
  - Web 端保持原文件选择方式不变
  - 平台判断：`Capacitor.isNativePlatform()`
- **Acceptance Criteria Addressed**: AC-3b
- **Test Requirements**:
  - `human-judgement` TR-6.1: 移动端点击「选择图片」弹出底部菜单，有拍照/相册/取消三个选项
  - `human-judgement` TR-6.2: 拍照成功后图片应用为背景
  - `human-judgement` TR-6.3: 从相册选择图片后应用为背景
  - `programmatic` TR-6.4: Web 端仍使用文件选择，不受影响
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（移动端图片选择逻辑）
  - 检查: `package.json`（@capacitor/camera 依赖）

## [x] Task 7: 卡片风格调节功能
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Description**:
  - 卡片圆角滑块：0 - 24px，步长 2px
  - 卡片阴影选择：无 / 轻微 / 中等 / 明显（4 个按钮 Segmented）
  - 卡片边框选择：无 / 细线 / 粗线（3 个按钮 Segmented）
  - 卡片透明度滑块：70% - 100%，步长 5%
  - 实时预览卡片：显示标题、正文、按钮的模拟卡片
  - 滑块拖动时实时更新 CSS 变量
- **Acceptance Criteria Addressed**: AC-4, AC-6
- **Test Requirements**:
  - `human-judgement` TR-7.1: 卡片圆角调节效果明显，范围正确
  - `human-judgement` TR-7.2: 卡片阴影 4 档差异清晰可见
  - `human-judgement` TR-7.3: 卡片边框 3 档差异清晰可见
  - `human-judgement` TR-7.4: 卡片透明度调节效果正确
  - `human-judgement` TR-7.5: 预览卡片能准确反映当前设置
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（卡片风格调节区 + 预览）

## [x] Task 8: 按钮透明度调节功能
- **Priority**: medium
- **Depends On**: Task 2, Task 3
- **Description**:
  - 主按钮透明度滑块：80% - 100%，步长 5%
  - 次按钮/幽灵按钮透明度滑块：70% - 100%，步长 5%
  - 实时预览：并排显示主按钮和次按钮
  - 滑块拖动时实时更新 CSS 变量
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `human-judgement` TR-8.1: 主按钮透明度调节效果正确
  - `human-judgement` TR-8.2: 次按钮透明度调节效果正确
  - `human-judgement` TR-8.3: 预览按钮能准确反映当前设置
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（按钮透明度调节区 + 预览）

## [x] Task 9: 多套风格方案管理
- **Priority**: high
- **Depends On**: Task 1, Task 3, Task 4, Task 7, Task 8
- **Description**:
  - 页面顶部「我的方案」区域，展示已保存的风格方案列表（横向滚动卡片）
  - 每个方案卡片显示：方案名称、缩略预览色块
  - 当前应用的方案有「使用中」标识
  - 点击方案卡片即应用该方案
  - 「保存当前风格」按钮：弹出输入框，输入名称后保存
  - 方案卡片长按或点击「...」菜单：重命名 / 删除（删除需二次确认）
  - 预设主题也显示在方案列表的前面（不可删除）
  - 至少支持保存 10 套自定义方案
- **Acceptance Criteria Addressed**: AC-11, AC-12, AC-13
- **Test Requirements**:
  - `human-judgement` TR-9.1: 已保存的方案以卡片形式横向排列展示
  - `human-judgement` TR-9.2: 点击方案卡片后立即应用，背景和卡片风格切换
  - `programmatic` TR-9.3: 保存方案成功，localStorage 中方案列表更新
  - `programmatic` TR-9.4: 删除方案成功，需二次确认
  - `programmatic` TR-9.5: 重命名方案成功
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（我的方案区域 + 保存/重命名/删除逻辑）

## [x] Task 10: 一键恢复默认与确认弹窗
- **Priority**: medium
- **Depends On**: Task 1, Task 3
- **Description**:
  - 页面底部添加「恢复默认设置」按钮
  - 点击后弹出确认对话框（二次确认）
  - 确认后调用统一的 reset 函数恢复所有背景风格设置
  - 恢复后显示 Toast 提示
  - 注意：恢复默认不删除已保存的风格方案，仅重置当前应用的设置
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `human-judgement` TR-10.1: 点击「恢复默认」弹出确认对话框
  - `programmatic` TR-10.2: 确认后所有状态字段恢复为默认值，localStorage 对应项清除
  - `human-judgement` TR-10.3: 恢复后视觉效果回到初始状态
  - `programmatic` TR-10.4: 已保存的风格方案不被删除
- **Files**:
  - Modify: `src/pages/SettingsBackground.jsx`（恢复默认按钮 + 确认逻辑）
  - Modify: `src/context/AppContext.jsx`（resetBackgroundStyle 函数）

## [x] Task 11: 全局样式验证与兼容性测试
- **Priority**: high
- **Depends On**: Task 2, Task 4, Task 5, Task 7, Task 8, Task 9
- **Description**:
  - 遍历主要页面（首页、分类页、背诵页、设置页），验证卡片和按钮样式正确应用
  - 测试浅色/深色/自动主题切换与自定义风格的兼容性
  - 测试护眼模式与自定义风格的兼容性
  - 测试移动端适配（375px 宽度）
  - 检查 prefers-reduced-motion 下动画不受影响（仅颜色变化）
  - 测试风格方案切换的流畅性
- **Acceptance Criteria Addressed**: AC-7, AC-9, AC-10, AC-12
- **Test Requirements**:
  - `human-judgement` TR-11.1: 首页、分类页、背诵页的卡片和按钮样式正确应用自定义设置
  - `human-judgement` TR-11.2: 切换浅色/深色主题时，自定义风格正确适配
  - `human-judgement` TR-11.3: 护眼模式开启后，背景风格与护眼效果兼容
  - `human-judgement` TR-11.4: 375px 宽度下页面布局正常，无溢出
  - `programmatic` TR-11.5: 构建成功，无报错
  - `human-judgement` TR-11.6: 风格方案切换流畅，无明显闪烁
- **Files**:
  - 验证：全页面视觉检查
  - 构建：`npm run build`
