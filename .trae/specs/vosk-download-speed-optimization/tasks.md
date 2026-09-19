# Tasks

- [x] Task 1: 实现多连接分片下载核心逻辑
  - [ ] SubTask 1.1: 在 VoskASRPlugin.java 中新增 `downloadWithMultipleConnections` 方法，接收 URL、文件大小、分片数参数
  - [ ] SubTask 1.2: 发送 HEAD 请求检测服务器是否支持 Range 请求（检查 `Accept-Ranges: bytes` 头）
  - [ ] SubTask 1.3: 支持 Range 时，将文件分为 4 个分片，每个分片使用独立 OkHttp 请求下载（Range: bytes=start-end）
  - [ ] SubTask 1.4: 使用 RandomAccessFile 将各分片写入到最终文件的正确位置（避免合并步骤）
  - [ ] SubTask 1.5: 不支持 Range 时自动回退到现有单连接下载
  - [ ] SubTask 1.6: 每个分片支持 3 次重试，重试时使用指数退避
- [x] Task 2: 实现分片进度聚合和速度计算
  - [ ] SubTask 2.1: 使用 AtomicInteger/AtomicLong 统计所有分片已下载字节数
  - [ ] SubTask 2.2: 每 500ms 发送一次聚合进度事件（总进度百分比、已下载MB、总MB）
  - [ ] SubTask 2.3: 每秒计算一次下载速度（MB/s），通过进度事件发送给前端
  - [ ] SubTask 2.4: 所有分片完成后发送完成事件
- [x] Task 3: 集成分片下载到现有下载流程
  - [ ] SubTask 3.1: 在 `downloadZipFromSingleSource` 中，连接成功后先尝试多连接下载
  - [ ] SubTask 3.2: 多连接下载失败时回退到单连接下载
  - [ ] SubTask 3.3: 保留现有的断点续传逻辑（多连接模式下各分片独立续传）
  - [ ] SubTask 3.4: 保留现有的取消下载逻辑（取消时所有分片线程停止）
- [ ] Task 4: 前端速度显示优化
  - [ ] SubTask 4.1: 在 SettingsSpeech.jsx 中接收 speed 字段并显示当前下载速度
  - [ ] SubTask 4.2: 下载中显示 "已下载 X.X MB / Y.Y MB（Z.Z MB/s）"
  - [ ] SubTask 4.3: 分片下载模式时显示"使用 4 连接加速下载"提示
- [ ] Task 5: 验证和打包
  - [ ] SubTask 5.1: 编译验证（前端 + Android）
  - [ ] SubTask 5.2: 打包 Debug APK

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 3] and [Task 4]
