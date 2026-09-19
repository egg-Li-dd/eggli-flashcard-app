# 背诵功能审查与 Bug 修复 —— 验证清单（checklist.md）

### 一、重置确认弹窗功能

- [ ] Checkpoint 1.1：顶部分类栏的数字徽标（round > 0 + 非艾宾 + 选中）能正确打开"取消本轮"确认弹窗
- [ ] Checkpoint 1.2：弹窗内容正确显示 round 数字，并提供「取消」和「确认重置」两个按钮
- [ ] Checkpoint 1.3：点击「取消」按钮 → 弹窗关闭，轮数和卡片状态无变化
- [ ] Checkpoint 1.4：点击「确认重置」按钮（有 mastered 卡片）→ Toast 显示"已取消第 N 轮，M 张卡片重置为待复习"，轮数 -1，所有 mastered 卡片状态变为 review
- [ ] Checkpoint 1.5：点击「确认重置」按钮（无 mastered 卡片）→ Toast 显示"当前分类没有需要重置的卡片"，弹窗关闭，轮数不变
- [ ] Checkpoint 1.6：点击「确认重置」时，即使 allCards 为空数组，也能正确从 DB 读取 mastered 卡片数量（Task 1 的关键验证点）
- [ ] Checkpoint 1.7：重置完成后，顶部分类栏数字徽标立即刷新为新的 round 值

### 二、数字徽标与分类名称点击分离

- [ ] Checkpoint 2.1：选中分类 A（round > 0，非艾宾），点击分类名称 → 打开模式选择弹窗
- [ ] Checkpoint 2.2：选中分类 A（round > 0，非艾宾），点击数字徽标 → 打开取消本轮确认弹窗
- [ ] Checkpoint 2.3：艾宾模式下，选中分类的徽标为 📅，点击不触发重置弹窗
- [ ] Checkpoint 2.4：点击未选中分类 B 的名称/徽标 → 分类 B 被选中并加载卡片（或打开模式选择）
- [ ] Checkpoint 2.5：数字徽标点击事件能正确 stopPropagation，不会同时触发分类选择

### 三、分类选择与模式选择流程

- [ ] Checkpoint 3.1：首次进入背诵页，顶部分类栏展示所有分类，无选中高亮
- [ ] Checkpoint 3.2：点击任意分类 → 若 studyMode 为空 → 打开模式选择弹窗
- [ ] Checkpoint 3.3：选择任一模式 → studyMode 被设置，selectedCategoryId 被保存，loadCards 成功加载卡片
- [ ] Checkpoint 3.4：关闭模式选择弹窗（未选模式）→ 不保留选中分类状态，顶部分类栏无高亮
- [ ] Checkpoint 3.5：已有 studyMode 时点击新分类 → 自动加载新分类卡片，无需再次选择模式

### 四、卡片标记与进度逻辑

- [ ] Checkpoint 4.1：点击「已掌握」按钮 → 卡片状态在 cardStatus 和 fullCardStatuses 中均更新为 mastered，reviewCount 递增
- [ ] Checkpoint 4.2：点击「待复习」按钮 → 卡片状态更新为 review，同时写入 wrongAnswers 表
- [ ] Checkpoint 4.3：标记后卡片自动翻回正面，150ms 后切到下一张，顺序正确
- [ ] Checkpoint 4.4：顶部"第 M / N 张"文字与进度条宽度实时更新
- [ ] Checkpoint 4.5：底部掌握率环形图（mastered / total × 100%）在每次标记后正确更新

### 五、自动开新一轮逻辑

- [ ] Checkpoint 5.1：顺序模式下，最后一张卡片被标记为 mastered → 立即弹出"🎉 恭喜完成"弹窗
- [ ] Checkpoint 5.2：弹窗确认后，所有卡片状态自动重置为 review，轮数 +1，currentIndex 回到 0
- [ ] Checkpoint 5.3：weak 模式下所有卡片被标记为 mastered → filteredCards 变为空 → 触发 handleComplete，卡片状态重置

### 六、艾宾浩斯模式专属验证

- [ ] Checkpoint 6.1：切换到艾宾模式 → filteredCards 仅包含 nextReviewAt <= now 的卡片
- [ ] Checkpoint 6.2：艾宾模式下标记「已掌握」→ fullCardStatuses 中的 interval、repetitions、easeFactor 被正确更新，nextReviewAt 被推到未来
- [ ] Checkpoint 6.3：艾宾模式下标记「待复习」→ repetitions 归 0，interval 归 1
- [ ] Checkpoint 6.4：艾宾模式下不会触发 handleComplete（不会自动开新一轮），filteredCards 为空时显示 empty 状态

### 七、卡片编辑、移动与删除

- [ ] Checkpoint 7.1：左滑卡片 → 露出操作菜单，「加入收藏」「移动」「删除卡片」三个按钮可见可用
- [ ] Checkpoint 7.2：点击「编辑」→ 弹出编辑弹窗，front/back 文本可修改，保存后卡片内容更新
- [ ] Checkpoint 7.3：点击「移动」→ 弹出分类/单元选择，选择后卡片被正确移动，原分类下该卡片消失
- [ ] Checkpoint 7.4：点击「删除卡片」→ 弹出确认，确认后卡片从 DB 和前端 state 删除，索引正确回退

### 八、今日目标与统计

- [ ] Checkpoint 8.1：今日目标输入框可修改数字（1-100），修改后 localStorage 同步更新
- [ ] Checkpoint 8.2：标记卡片为 mastered / review → 今日完成数 +1，目标进度条更新
- [ ] Checkpoint 8.3：掌握率超过 100% 时被 clamp 到 100%

### 九、移动端触摸与 UI 适配

- [ ] Checkpoint 9.1：在 320px 宽度的屏幕上，顶部分类栏可横向滚动，文字不溢出
- [ ] Checkpoint 9.2：分类按钮最小高度 40px，数字徽标最小点击区域 22×22px，有额外 padding
- [ ] Checkpoint 9.3：所有弹窗（确认重置、模式选择、移动卡片、删除确认）按钮高度 ≥ 44px
- [ ] Checkpoint 9.4：卡片翻转、左滑、弹窗动画在低端设备上无明显卡顿（<200ms 响应）
- [ ] Checkpoint 9.5：触摸事件不会误触发（长按分类不会误触发 onClick，左滑卡片不会误触发翻转）

### 十、数据完整性与边界情况

- [ ] Checkpoint 10.1：分类下无任何卡片时，显示正确的 empty 状态（"暂无背诵卡片，请先在记录页创建"）
- [ ] Checkpoint 10.2：分类下仅有一张卡片时，标记后不会出现索引越界（currentIndex 不会 ≥ filteredCards.length）
- [ ] Checkpoint 10.3：从其他页面（如记录页）删除当前分类正在背诵的卡片后，回到背诵页，页面正确刷新或提示
- [ ] Checkpoint 10.4：localStorage 清除后重新进入背诵页，状态正确从零开始（轮数为 0，无选中高亮）
- [ ] Checkpoint 10.5：网络断开场景下，云端同步失败不影响本地功能（仅 Toast 警告，不中断流程）
