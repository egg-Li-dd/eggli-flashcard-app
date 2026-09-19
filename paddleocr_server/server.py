"""
PaddleOCR 自建 HTTP 服务（FastAPI）

接口约定：
  GET  /health      健康检查，返回版本与支持语言
  POST /ocr          文字识别
       请求体：{ "image": "<base64 无 data:前缀>", "language": "ch|en|multilingual" }
       响应体：{ "ok": true, "text": "识别结果", "boxes": [...] }

部署：
  1. 安装依赖：     pip install -r requirements.txt
  2. 启动服务：     python server.py
  3. 默认监听：     http://0.0.0.0:8000
  4. App 端填入：   http://<本机 IP>:8000

可选环境变量：
  PORT              监听端口（默认 8000）
  HOST              监听地址（默认 0.0.0.0）
  API_TOKEN         鉴权 Token（与 App 端配置一致即可启用）
  USE_GPU           设为 '1' 启用 GPU（需 paddlepaddle-gpu）
  DEFAULT_LANG      默认语言模型（默认 ch）

首次运行会自动下载 PaddleOCR 模型（约 10MB），保存在 ~/.paddleocr/
"""

import os
import io
import base64
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import numpy as np

# 配置
PORT = int(os.environ.get('PORT', '8000'))
HOST = os.environ.get('HOST', '0.0.0.0')
API_TOKEN = os.environ.get('API_TOKEN', '').strip()
USE_GPU = os.environ.get('USE_GPU', '0') == '1'
DEFAULT_LANG = os.environ.get('DEFAULT_LANG', 'ch')

app = FastAPI(title='PaddleOCR Service', version='1.0.0')

# 允许跨域（App 是 Capacitor/WebView，需开放 CORS）
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

# 懒加载 PaddleOCR 实例（按语言缓存）
_ocr_cache = {}


def get_ocr(lang: str):
    """根据语言获取（或创建）PaddleOCR 实例。"""
    if lang not in _ocr_cache:
        from paddleocr import PaddleOCR
        # use_angle_cls=True 启用方向分类，提升拍照文档识别率
        # lang 支持: ch, en, french, german, korean, japan 等
        effective_lang = 'ch' if lang == 'multilingual' else lang
        _ocr_cache[lang] = PaddleOCR(
            use_angle_cls=True,
            lang=effective_lang,
            use_gpu=USE_GPU,
            show_log=False,
        )
    return _ocr_cache[lang]


class OcrRequest(BaseModel):
    image: str
    language: Optional[str] = DEFAULT_LANG


@app.get('/health')
def health():
    return {
        'ok': True,
        'version': '1.0.0',
        'engine': 'PaddleOCR',
        'languages': 'ch, en, multilingual',
        'gpu': USE_GPU,
    }


@app.post('/ocr')
async def ocr(req: OcrRequest, request: Request, authorization: Optional[str] = Header(None)):
    # 鉴权
    if API_TOKEN:
        token = (authorization or '').replace('Bearer ', '').strip()
        if token != API_TOKEN:
            raise HTTPException(status_code=401, detail='Unauthorized: invalid token')

    if not req.image:
        return {'ok': False, 'error': 'image field is empty'}

    try:
        # 解码 base64 → PIL.Image → numpy.ndarray
        img_bytes = base64.b64decode(req.image)
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        img_np = np.array(img)
    except Exception as e:
        return {'ok': False, 'error': f'图像解码失败：{e}'}

    try:
        ocr_engine = get_ocr(req.language or DEFAULT_LANG)
        result = ocr_engine.ocr(img_np, cls=True)
    except Exception as e:
        return {'ok': False, 'error': f'OCR 推理失败：{e}'}

    # 兼容 PaddleOCR 不同版本返回结构
    lines = []
    boxes = []
    if result and isinstance(result, list):
        # 新版返回 [[ [box, (text, score)], ... ]]
        # 旧版返回 [ [ [box, (text, score)], ... ] ]
        page = result[0] if isinstance(result[0], list) else result
        for item in (page or []):
            if not item or len(item) < 2:
                continue
            box = item[0]
            text_score = item[1]
            text = text_score[0] if isinstance(text_score, (list, tuple)) else str(text_score)
            lines.append(text)
            boxes.append(box)

    text = '\n'.join(lines)
    return {'ok': True, 'text': text, 'boxes': boxes}


if __name__ == '__main__':
    import uvicorn
    print('=' * 60)
    print(' PaddleOCR HTTP Service')
    print('=' * 60)
    print(f' Host:    {HOST}')
    print(f' Port:    {PORT}')
    print(f' GPU:     {USE_GPU}')
    print(f' Default: {DEFAULT_LANG}')
    print(f' Auth:    {"enabled" if API_TOKEN else "disabled"}')
    print('-' * 60)
    print(f' App 端配置地址： http://<本机IP>:{PORT}')
    print('-' * 60)
    uvicorn.run(app, host=HOST, port=PORT)
