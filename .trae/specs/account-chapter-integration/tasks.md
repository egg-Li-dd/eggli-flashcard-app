# 账号页章节联动与背诵计划入口 - 实施任务

## 依赖关系图
```
Task 1 (Account.jsx 统计面板调整 + 章节数统计)
    │
    ├─→ Task 2 (连续学习天数条 + 背诵计划入口)
    │
    └─→ Task 3 (云端说明简化 + 界面布局.txt更新)
```

---

## [x] Task 1: Account.jsx 统计面板调整（新增章节数、替换收藏数）
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 修改 `src/pages/Account.jsx` 的 `loadStats` 函数：
    - 新增 `db.getChapterCount()` 调用（需先确认 db.js 是否有此函数，若无则新增）
    - 使用 `Promise.allSettled` 保证单个失败不影响其他
  - 修改 stats state：
    - 新增 `chapters: 0` 字段
    - 移除 `bookmarks` 字段（或保留但不展示）
  - 修改 2×3 统计网格：
    - 将最后一项"收藏数⭐"替换为"章节数📖"
    - 点击跳转目标：首页 `/`
    - 颜色使用 `var(--color-primary)`
  - 确保移动端按钮最小高度 44px，卡片间距 10px
  - **注意**：先检查 db.js 是否有 `getChapterCount` 函数，若无则新增
- **Acceptance Criteria**:
  - 账号页 2×3 网格显示：总卡片数、今日已学、已掌握、到期复习、长期记忆、章节数
  - 章节数 = 所有分类下 chapters 表记录总数
  - 收藏数不再在统计面板中展示
  - 原有功能（个人资料编辑、退出登录等）不受影响

---

## [x] Task 2: 连续学习天数条可点击 + 背诵计划入口按钮
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 修改连续学习天数条：
    - 包裹为 `<button>` 元素，添加 `onClick={() => navigate('/memorize/plan')}`
    - 右侧添加箭头图标 → 暗示可点击
    - 有学习记录时：显示"🔥 已连续学习 N 天 →"
    - 无学习记录时：显示"今日还未学习，去看看背诵计划 →"
    - 添加 hover/active 态反馈
  - 在统计面板下方（连续学习天数条之后）新增"背诵计划"入口按钮：
    - 使用 `btn btn-secondary btn-block` 样式
    - 带 📋 图标 + "背诵计划" + 箭头 →
    - 点击跳转到 `/memorize/plan`
    - minHeight 44px
  - 确保移动端按钮可点击，间距合理
- **Acceptance Criteria**:
  - 连续学习天数条可点击，跳转到 /memorize/plan
  - 无学习记录时显示引导文案且可点击
  - 背诵计划入口按钮存在且可点击
  - 按钮最小高度 44px

---

## [x] Task 3: 云端数据处理说明简化 + 界面布局.txt更新
- **Priority**: P1
- **Depends On**: Task 1
- **Description**:
  - 简化云端数据处理按钮下方的说明文字：
    - 将多行说明 "查看与管理云端存储数据，支持全量一键上传/同步，或按分类精细化控制。" 简化为 "查看与管理云端数据"
  - 更新 `界面布局.txt` 中账号页描述（第143-153行）：
    - 更新统计面板项为：总卡片数、今日已学、已掌握、到期复习、长期记忆、章节数
    - 添加连续学习天数条可点击跳转描述
    - 添加背诵计划入口描述
    - 更新路由跳转关系
- **Acceptance Criteria**:
  - 云端数据处理说明文字简化为一行
  - 界面布局.txt 中账号页描述与实际一致
  - npm run build 通过