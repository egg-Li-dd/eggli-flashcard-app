# 账号页美化与章节/背诵计划联动 - 实施任务

## 依赖关系图
```
Task 1 (Account.jsx 统计面板重构)
    │
    ├─→ Task 2 (新增 StatsLongTerm.jsx + 路由)
    │
    └─→ Task 3 (UI 美化与细节打磨)
```

---

## [x] Task 1: Account.jsx 统计面板重构
- **Priority**: P0
- **Depends On**: None（db.js 函数已存在）
- **Description**:
  - 修改 `src/pages/Account.jsx` 的 `renderLoggedIn` 函数：
    - **移除**进度环形图（`stats.total > 0` 那段 conic-gradient 进度环）
    - **替换** 2×3 统计网格：
      - 保留：总卡片数、今日已学、已掌握、收藏数
      - 替换"学习中"→"到期复习"（调用 `db.getDueCardsCount()`，点击跳转 `/memorize/plan`）
      - 替换"待开始"→"长期记忆"（调用 `db.getLongTermCardsCount()`，点击跳转 `/stats/longterm`）
    - **新增**连续学习天数条（在 2×3 网格下方）：
      - 调用 `db.getStreakDays()`
      - N > 0：显示"已连续学习 N 天"，暖色背景 + 火焰图标
      - N = 0：显示"今日还未学习哦"，灰色文字
  - 修改 `loadStats` 函数：
    - 新增 `db.getDueCardsCount()`、`db.getLongTermCardsCount()`、`db.getStreakDays()` 调用
    - 使用 `Promise.allSettled` 保证单个失败不影响其他
  - 修改 `renderStatCard` 函数：
    - 新增 `icon` 参数（emoji 字符串）
    - 新增 `subtitle` 参数（已有，但需确保到期复习和长期记忆卡片使用）
    - 图标在上方、数字居中、标签在下方
  - 确保移动端按钮最小高度 44px，卡片间距 10px
- **Acceptance Criteria**:
  - 账号页 2×3 网格显示 6 张统计卡：总卡片数、今日已学、已掌握、到期复习、长期记忆、收藏数
  - 到期复习数 = getDueCardsCount() 返回值
  - 长期记忆数 = getLongTermCardsCount() 返回值
  - 点击"到期复习"跳转到 /memorize/plan
  - 点击"长期记忆"跳转到 /stats/longterm
  - 连续学习天数条正确显示
  - 原有功能（个人资料编辑、退出登录等）不受影响

---

## [x] Task 2: 新增 StatsLongTerm.jsx 长期记忆卡片列表页
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 创建 `src/pages/StatsLongTerm.jsx`：
    - 顶部 Header：返回按钮 + "长期记忆卡片" + 总数
    - 卡片列表：从 `db.getAllCardStatuses()` 筛选 `repetitions >= 5` 的记录
    - 每条卡片显示：问题(front)摘要、答案(back)摘要、所属分类名（通过 categoryId 查找）、当前复习间隔(interval 天)
    - 卡片点击弹出详情（可选，复用 CardItem 或简单弹窗显示完整内容）
    - 空状态：无长期记忆卡片时显示"还没有长期记忆卡片，坚持艾宾浩斯复习吧！"
  - 在 `src/App.jsx` 中注册路由：
    - `<Route path="/stats/longterm" element={<RequireAuth><StatsLongTerm /></RequireAuth>}>`
    - 放在 `/stats/:type` 路由之前（避免被通配符匹配）
  - 样式：复用现有 CSS 变量和卡片类，移动端适配
- **Acceptance Criteria**:
  - 路由 /stats/longterm 可正常访问
  - 页面显示 reps>=5 的卡片列表，与 getLongTermCardsCount() 数量一致
  - 每条显示 front/back/分类名/interval
  - 返回按钮正常工作
  - 空状态提示正确

---

## [x] Task 3: UI 美化与细节打磨
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - **统计卡片美化**：
    - 每张卡片增加 emoji 图标（总卡片数📚、今日已学📅、已掌握✅、到期复习⏰、长期记忆🧠、收藏数⭐）
    - 图标在上方 20px 大小，数字 22px 加粗，标签 12px
    - 每张卡片使用对应主题色（总卡片=primary、今日=success、已掌握=success、到期=warning、长期=accent、收藏=accent）
    - 点击卡片有微妙的缩放反馈（transform: scale(0.97)）
  - **用户信息卡片美化**：
    - 头像增大到 72px，居中显示
    - 昵称字号增大到 16px
    - 登录模式标签改为圆角胶囊样式（primary-light 背景）
    - "点击编辑资料"增加虚线边框引导
    - 标签（tags）间距增大到 8px
  - **云端数据处理卡片简化**：
    - 改为紧凑按钮（图标 + "云端数据处理" + 箭头），去掉独立卡片容器
    - 放在数据管理卡片上方
  - **数据管理区美化**：
    - 导出/导入按钮增加间距
    - 清除按钮增加警告色边框
  - **退出登录按钮**：增加顶部间距，确保与上方内容有视觉分隔
- **Acceptance Criteria**:
  - 所有统计卡片有图标和主题色
  - 用户信息卡片头像 72px、昵称 16px
  - 云端数据处理入口为紧凑按钮
  - 移动端 375px 宽度下无溢出，按钮可点击
  - npm run build 通过