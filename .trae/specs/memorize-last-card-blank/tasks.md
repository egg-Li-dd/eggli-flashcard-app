# Tasks

- [x] Task 1: 修复 handleMark 中 nextFilteredLen === 0 的逻辑
  - [x] SubTask 1.1: 在 nextFilteredLen === 0 时调用 handleComplete() 而不是仅 setCurrentIndex(0)
  - [x] SubTask 1.2: 确保 handleComplete 的错误被 try-catch 保护

- [x] Task 2: 构建测试验证
  - [x] SubTask 2.1: 构建测试通过，无语法错误

# 分析说明
- **weak模式**: filteredCards = allCards.filter(c => cardStatuses[c.id] === 'review')，标记为mastered会从列表移除 → 触发 nextFilteredLen === 0 → handleComplete ✅
- **艾宾浩斯模式**: filteredCards = getCardsForReview()，标记为mastered(下次复习在未来)会从列表移除 → 触发 nextFilteredLen === 0 → handleComplete ✅
- **普通模式**: filteredCards = allCards，标记为mastered不会从列表移除 → 不会触发 nextFilteredLen === 0 → 用户需手动点击"完成"按钮