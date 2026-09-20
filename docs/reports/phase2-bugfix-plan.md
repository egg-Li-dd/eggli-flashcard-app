# AI闪记卡 - BUG修复与功能完善计划 v2

## 1. 概述
基于已开发的AI背诵卡片App，修复3个已知BUG，新增左滑收藏功能，完善账号页面。

## 2. 关键发现: db.js已损坏
db.js仅剩4行（DB构造函数），丢失所有表定义(v1/v2)和全部CRUD函数。这是背诵卡片无法加载、语音/OCR链路不全的根因。

## 3. BUG根因

| # | BUG | 根因 |
|---|-----|------|
| 1 | 语音输入不工作 | onTouchMove缺失 + onerror/catch静默吞错 + Web Speech需HTTPS |
| 2 | 图片OCR不工作 | 单input动态切换capture不可靠 + db.js损坏导致数据链路不全 |
| 3 | 背诵卡片不显示 | db.js损坏getAllCardsByCategory等全部缺失->空卡片+无提示 |
| * | spinner永转 | 模式弹窗遮罩关闭->selectedCategoryId存在+studyMode=null->死锁 |

## 4. 修复方案

### 4.1 重建 db.js
完整恢复v1/v2 + 新增v3 bookmarks表 + 全部CRUD函数

### 4.2 修复 InputBar.jsx
- 新增handleTouchMove: 手指移动>10px取消长按
- onerror/catch中alert提示用户
- 拆分为双input: cameraInputRef(固定capture)+galleryInputRef(无capture)

### 4.3 修复 Memorize.jsx
- 弹窗遮罩关闭同时清空selectedCategoryId
- 弱模式handleMark后校验currentIndex不越界
- loadCards包裹try/catch
- 新增左滑收藏: touchstart/touchmove/touchend->deltaX<-60触发bookmark

### 4.4 重写 AccountPage
- 登录/注册绑定state->登录navigate(/)+toast
- 已登录态+我的收藏入口+收藏卡片列表(翻转)

## 5. 涉及文件
| 文件 | 操作 |
|------|------|
| src/services/db.js | 完整重建(恢复v1/v2+新增v3) |
| src/components/InputBar.jsx | 修改(语音修复+双input OCR) |
| src/pages/Memorize.jsx | 修改(4bug+左滑收藏) |
| src/App.jsx | 修改(AccountPage重写) |
不修改: Home/Category/Settings/CardItem/UnitGroup/AppContext/deepseek/speech/index.css/helpers/constants

## 6. 实施步骤
1. 完整重建db.js(恢复v1/v2+新增v3 bookmarks)
2. 修复InputBar.jsx(语音+双input OCR)
3. 修复Memorize.jsx(4bug+左滑收藏)
4. 重写App.jsx中AccountPage(登录跳转+我的收藏)
5. npm run build验证

## 7. 验证
- npm run build 0错误
- 长按输入框->波形->说话->松手->文字填入
- 点击+->拍照->OCR->文字填入
- 背诵页->点分类->选模式->卡片显示->翻转->上/下一张
- 卡片左滑->收藏->账号页查看
- 账号页->登录->跳转首页
- 原有功能回归