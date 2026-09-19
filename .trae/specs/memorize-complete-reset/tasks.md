# Tasks

- [x] Task 1: 修改 handleComplete 函数实现即时重置
  - [x] SubTask 1.1: 在 handleComplete 中调用数据库修改，将所有 'mastered' 卡片改为 'review'
  - [x] SubTask 1.2: 更新前端状态 cardStatuses，将所有卡片设为 'review'
  - [x] SubTask 1.3: 重置 currentIndex 为 0，进度显示变为"第 1 / N 张"
  - [x] SubTask 1.4: 确保 roundsVersion 更新，触发轮数显示刷新

- [x] Task 2: 评估 loadCards 中的冗余自动重置逻辑
  - [x] SubTask 2.1: 检查 loadCards 中的自动重置逻辑是否仍需要保留（作为兜底）
  - [x] SubTask 2.2: 结论：保留作为兜底机制，正常情况下不会触发

# Task Dependencies
- Task 2 依赖 Task 1（先完成即时重置再评估兜底逻辑）