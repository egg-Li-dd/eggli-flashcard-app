# 移动卡片弹窗修复计划

## 问题分析

经过代码审查，确认了三个 bug：

### Bug 1：卡片操作弹窗不消失

**数据流**：
```
CardItem.handleMove()
  → 调用 onMove(card.id, () => setMenuOpen(false))  // 传了关闭回调作为第2个参数
    → UnitGroup.handleMove(card)  // 只接收了第1个参数，第2个回调丢失！
      → 调用 onMoveCard(card)  // 传给 Category.jsx，打开移动弹窗
      // 但 () => setMenuOpen(false) 从未被调用！
```

**根因**：`UnitGroup.handleMove` 函数签名是 `async (card)`，只接收第一个参数，`CardItem` 传入的关闭菜单回调被丢弃。

**修复**：`UnitGroup.handleMove` 改为 `async (card, closeMenu)`，在 `onMoveCard` 调用后执行 `closeMenu?.()`。

**文件**：`src/components/UnitGroup.jsx` 第 43-48 行

### Bug 2：不能移动到本分类的其他单元

**根因**：`Category.jsx` 第 878 行 `.filter((c) => c.id !== id)` 排除了当前分类。

**修复**：移除该 filter，允许用户选择当前分类（从而选择当前分类下的其他单元）。

**文件**：`src/pages/Category.jsx` 第 877-878 行

### Bug 3：目标分类没有单元时无法移动

**根因**：当 `targetUnits.length === 0` 时，`targetUnitId` 永远为 `null`，确认按钮被 `disabled={!targetCategoryId || !targetUnitId}` 禁用。

**修复**：当用户选择了目标分类但该分类无单元时，自动创建一个名为"默认"的单元并选中它。

**文件**：`src/pages/Category.jsx` 第 262-271 行 (`handleSelectTargetCategory`)

## 修改清单

| 文件 | 位置 | 修改内容 |
|------|------|---------|
| `src/components/UnitGroup.jsx` | L43-48 | 接收并调用 `closeMenu` 回调 |
| `src/pages/Category.jsx` | L878 | 移除 `.filter((c) => c.id !== id)` |
| `src/pages/Category.jsx` | L262-271 | `handleSelectTargetCategory` 中自动创建默认单元 |
| `src/pages/Category.jsx` | L894-898 | 移除"暂无其他分类"的提示 |

## 验证步骤

1. 在分类页打开卡片操作弹窗，点击"移动到其他分类" → 卡片操作弹窗应关闭
2. 在移动弹窗中选择当前分类 → 应能看到当前分类下的其他单元
3. 选择没有单元的分类 → 应自动创建"默认"单元并允许确认移动
4. `vite build` 编译通过
