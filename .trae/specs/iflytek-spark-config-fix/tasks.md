# Tasks

- [x] Task 1: 修复 handleSparkTest 函数的配置回退逻辑
  - [x] SubTask 1.1: 修改 handleSparkTest 函数，当 localIflytekAppId/localIflytekApiSecret 为空时，自动使用 localIflytekIatAppId/localIflytekIatApiSecret
  - [x] SubTask 1.2: 修改测试按钮的 disabled 条件，检查星火配置和 IAT 配置的 APPID/APISecret 是否都为空

- [x] Task 2: 优化 UI 提示文案
  - [x] SubTask 2.1: 修改讯飞星火配置区的提示文案，准确说明配置共用逻辑

# Task Dependencies
- Task 2 依赖 Task 1（逻辑修复后再更新文案）