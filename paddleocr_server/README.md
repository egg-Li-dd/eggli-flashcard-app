# PaddleOCR 自建 HTTP 服务

为「AI 背诵卡片」App 提供**完全免费、开源、自托管**的图像文字识别（OCR）能力，基于百度 [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)（Apache 2.0）。

## 特性

- ✅ 完全免费、开源（Apache 2.0）
- 🏠 自托管，隐私安全，图片不外传
- 🌐 支持中英文、英文、多语种识别
- 🚀 单次识别约 1~3 秒（CPU），GPU 更快
- 🔐 可选 Bearer Token 鉴权
- 📦 模型自动下载（约 10MB），无需手动配置

## 环境要求

- Python 3.8 ~ 3.11
- 推荐 4GB+ 内存（CPU 推理）

## 快速开始

### 1. 安装依赖

```bash
cd paddleocr_server
pip install -r requirements.txt
```

> Windows 用户若安装 paddlepaddle 失败，可参考 [PaddlePaddle 安装指南](https://www.paddlepaddle.org.cn/install/quick) 使用预编译包：
> ```bash
> python -m pip install paddlepaddle==2.6.1 -f https://www.paddlepaddle.org.cn/whl/windows/mkl/avx/stable.html
> ```

### 2. 启动服务

```bash
python server.py
```

启动后看到如下输出即成功：

```
============================================================
 PaddleOCR HTTP Service
============================================================
 Host:    0.0.0.0
 Port:    8000
 GPU:     False
 Default: ch
 Auth:    disabled
------------------------------------------------------------
 App 端配置地址： http://<本机IP>:8000
------------------------------------------------------------
INFO:     Uvicorn running on http://0.0.0.0:8000
```

首次请求会自动下载模型到 `~/.paddleocr/`（约 10MB）。

### 3. 在 App 中配置

打开「AI 背诵卡片」→ 设置 → 图像识别：

1. 「当前引擎」点击切换为 **PaddleOCR 自建服务**
2. 「服务地址」填入 `http://<本机IP>:8000`
3. 点击「测试连接」确认能连通
4. 保存配置后即可使用拍照/相册识别

> **获取本机 IP**：
> - Windows：`ipconfig` 查看 IPv4 地址（如 `192.168.1.100`）
> - macOS/Linux：`ifconfig` 或 `ip addr`
> - 手机与电脑需在同一局域网

## 接口说明

### `GET /health` 健康检查

响应：
```json
{
  "ok": true,
  "version": "1.0.0",
  "engine": "PaddleOCR",
  "languages": "ch, en, multilingual",
  "gpu": false
}
```

### `POST /ocr` 文字识别

请求体：
```json
{
  "image": "<base64 字符串，无需 data: 前缀>",
  "language": "ch"
}
```

可选 Header（启用鉴权时）：
```
Authorization: Bearer <token>
```

响应体：
```json
{
  "ok": true,
  "text": "识别到的文字，按行用 \\n 分隔",
  "boxes": [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], ...]
}
```

## 高级配置（环境变量）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `API_TOKEN` | （空） | 启用 Bearer Token 鉴权 |
| `USE_GPU` | `0` | 设为 `1` 启用 GPU（需先安装 paddlepaddle-gpu） |
| `DEFAULT_LANG` | `ch` | 默认语言（ch / en / multilingual） |

示例：

```bash
# 启用鉴权
API_TOKEN=my-secret-token python server.py

# 启用 GPU
USE_GPU=1 python server.py

# 自定义端口
PORT=9000 python server.py
```

## 常见问题

### Q：手机访问不到服务？

1. 确认手机与电脑在**同一 WiFi 网络**
2. Windows 检查防火墙是否放行 8000 端口：
   ```powershell
   New-NetFirewallRule -DisplayName "PaddleOCR" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```
3. 启动时确认 `HOST=0.0.0.0`（默认即是）

### Q：识别速度慢？

- CPU 模式下单张图片约 1~3 秒（取决于图片大小与文字密度）
- 如有 NVIDIA GPU，安装 `paddlepaddle-gpu` 后设置 `USE_GPU=1` 可加速 5~10 倍

### Q：首次启动报错下载模型失败？

PaddleOCR 模型托管在国内 CDN，正常可正常下载。如失败可：
1. 检查网络
2. 手动从 [PaddleOCR 模型库](https://github.com/PaddlePaddle/PaddleOCR/blob/main/doc/doc_ch/models_list.md) 下载放到 `~/.paddleocr/`

### Q：识别准确率不理想？

- 确保图片清晰、文字区域占比较大
- 拍照时保持光线充足、避免倾斜
- 在 App 中可在拍照后裁剪图片再识别

## 许可证

- PaddleOCR：Apache License 2.0
- 本服务脚本：可自由使用、修改、分发
