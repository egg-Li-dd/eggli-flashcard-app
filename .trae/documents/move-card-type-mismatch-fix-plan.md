# 移动卡片失败修复计划

## 根因

移动操作全线失败，原因是数据流中存在类型断裂：

**CardItem.handleMove**（[CardItem.jsx L105](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/CardItem.jsx#L105)）传入的是 `card.id`（字符串），但 **UnitGroup.handleMove**（[UnitGroup.jsx L43](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/components/UnitGroup.jsx#L43)）直接将其传给 `onMoveCard(card)`，导致 `Category.handleMoveCard` 收到的 `card` 是一个**字符串而非对象**。

最终在 **Category.handleConfirmMove**（[Category.jsx L302](file:///c:/creategame/Quick%20Note%20Memorization%20Specialized%20for%20Postgraduate%20Entrance%20Exam/ai-flashcard-app/src/pages/Category.jsx#L302)）中：
```javascript
await moveCardToCategory(cardToMove.id, ...)
```
此时 `cardToMove` 是字符串 `"mq6k4j8ekk1qp14s"`，`cardToMove.id` 为 `undefined`，`db.cards.get(undefined)` 返回 `null`，`moveCardToCategory` 直接 `return`，无声失败。

## 修复方案

**UnitGroup.jsx 第 45 行**：将字符串 ID 包装为对象 `{ id: card }`。

## 修改清单

| 文件 | 行 | 修改 |
|------|-----|------|
| `src/components/UnitGroup.jsx` | 45 | `await onMoveCard(card)` → `await onMoveCard({ id: card })` |

## 验证

1. 点击卡片操作 → 移动到其他分类 → 选择目标分类和单元 → 确认 → 卡片移动成功
2. `vite build` 编译通过
