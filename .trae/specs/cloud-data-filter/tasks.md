# 云端数据界面筛选优化 - 实现计划

## [x] Task 1: 修改"云端未更新"筛选逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 修改 CloudDataDetail.jsx 中的 filterItems 函数
  - 将"云端未更新"（updatedStatus === 'not-updated'）的判断逻辑从"createdAt等于updatedAt"改为"本地存在但云端不存在"
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement`: 验证筛选"云端未更新"时只显示本地有而云端没有的数据

## [x] Task 2: 禁用学习状态数据的上传按钮
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 CloudData.jsx 中，为 card_status 数据项的上传按钮添加禁用状态
  - 添加提示说明为何学习状态不能上传
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement`: 验证学习状态的数据上传按钮为禁用状态

## [x] Task 3: 修改一键上传逻辑排除学习状态数据
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 修改 CloudData.jsx 中的 handleGlobalUpload 函数
  - 在全量上传时跳过 card_status 表
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement`: 验证一键上传时不会上传学习状态数据

## [x] Task 4: 更新文档分布记录变更
- **Priority**: P2
- **Depends On**: Task 1-3
- **Description**: 
  - 更新文档分布.txt，记录云端数据筛选和上传逻辑的修改位置
- **Acceptance Criteria Addressed**: 无（维护任务）
- **Test Requirements**:
  - `human-judgement`: 验证文档分布.txt已更新相关记录