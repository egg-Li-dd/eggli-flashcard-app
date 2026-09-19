# 背诵功能专项优化 - 实施计划

## [x] Task 1: 实现艾宾浩斯算法工具类
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 创建 `src/utils/ebbinghaus.js` 工具类
  - 实现 `calculateNextReview()` 计算下次复习时间
  - 实现 `getCardsForReview()` 筛选待复习卡片
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: 新卡片应在24小时后标记为待复习
  - `programmatic` TR-1.2: 已掌握卡片应按[1,2,4,7,15,30]天间隔递增
  - `human-judgment` TR-1.3: 算法逻辑清晰，注释完整
- **Notes**: 基于艾宾浩斯遗忘曲线理论，复习间隔随掌握程度递增

## [x] Task 2: 实现艾宾浩斯背诵模式逻辑
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 修改 `Memorize.jsx` 中 `handleSelectMode()` 函数
  - 实现 `ebbinghaus` 模式下的卡片筛选逻辑
  - 根据复习时间排序待复习卡片
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 艾宾浩斯模式应只显示待复习卡片
  - `programmatic` TR-2.2: 卡片应按到期时间排序
  - `human-judgment` TR-2.3: UI显示"艾宾浩斯模式"标识
- **Notes**: 需要更新数据库表结构，增加 `reviewCount` 字段

## [x] Task 3: 新增复习提醒功能
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 在 `Memorize.jsx` 顶部添加待复习卡片提示组件
  - 实时计算待复习卡片数量
  - 使用警告样式突出显示
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 有到期卡片时显示提醒
  - `programmatic` TR-3.2: 到期卡片数量计算准确
  - `human-judgment` TR-3.3: 提醒样式醒目但不突兀
- **Notes**: 使用艾宾浩斯工具类计算待复习卡片

## [x] Task 4: 新增错题本功能
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 在 `db.js` 中新增 `wrongAnswers` 表
  - 实现 `addWrongAnswer()` 和 `getWrongAnswersByCategory()` 函数
  - 在 `Memorize.jsx` 中添加错题记录逻辑
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 标记待复习时自动记录错误
  - `programmatic` TR-4.2: 错误次数递增正确
  - `human-judgment` TR-4.3: 错题数据持久化正常
- **Notes**: 需要升级数据库版本

## [x] Task 5: 新增每日目标功能
- **Priority**: P1
- **Depends On**: None
- **Description**: 
  - 在 `Memorize.jsx` 中添加每日目标设置
  - 展示今日已完成数量
  - 添加进度条可视化
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: 每日目标存储到localStorage
  - `programmatic` TR-5.2: 今日完成数量统计准确
  - `human-judgment` TR-5.3: 进度条动画流畅
- **Notes**: 复用现有的 `getTodayStudiedCount()` 函数

## [x] Task 6: 增强数据可视化展示
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - 在 `Memorize.jsx` 中添加环形进度图
  - 展示已掌握/待复习/新卡片数量
  - 优化卡片统计展示样式
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 环形图百分比计算正确
  - `human-judgment` TR-6.2: 视觉效果美观清晰
  - `human-judgment` TR-6.3: 响应式布局适配移动端
- **Notes**: 使用CSS conic-gradient实现环形图

## [x] Task 7: 优化交互动画与手势
- **Priority**: P2
- **Depends On**: None
- **Description**: 
  - 优化 `handleFlip()` 添加触觉反馈
  - 改进 `handleSwipeMove()` 降低触发阈值
  - 添加滑动阻尼效果
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `human-judgment` TR-7.1: 翻卡时有触觉反馈
  - `human-judgment` TR-7.2: 滑动手势识别灵敏
  - `human-judgment` TR-7.3: 动画流畅无卡顿
- **Notes**: 使用 `navigator.vibrate()` API

## [x] Task 8: 更新数据库表结构
- **Priority**: P0
- **Depends On**: Task 1, Task 4
- **Description**: 
  - 升级 `db.js` 数据库版本
  - 添加 `reviewCount` 字段到 `cardStatus` 表
  - 创建 `wrongAnswers` 表
- **Acceptance Criteria Addressed**: AC-1, AC-4
- **Test Requirements**:
  - `programmatic` TR-8.1: 数据库升级成功无数据丢失
  - `programmatic` TR-8.2: 新字段可正常读写
  - `human-judgment` TR-8.3: 迁移逻辑正确
- **Notes**: 使用 Dexie.js 的版本升级机制

---

## 任务依赖关系图

```
Task 8 (数据库升级)
    │
    ├── Task 1 (艾宾浩斯算法)
    │       │
    │       └── Task 2 (艾宾浩斯模式)
    │       └── Task 3 (复习提醒)
    │
    └── Task 4 (错题本)

Task 5 (每日目标)
Task 6 (数据可视化)
Task 7 (交互动画)
```

## 实施顺序建议

1. **Phase 1 (核心功能)**: Task 8 → Task 1 → Task 2 → Task 3
2. **Phase 2 (增强功能)**: Task 4 → Task 5
3. **Phase 3 (体验优化)**: Task 6 → Task 7

---

## 测试环境要求

- 浏览器：Chrome 90+, Safari 14+
- 移动端：Android 8+, iOS 14+
- 数据库：IndexedDB (Dexie.js 3.x)