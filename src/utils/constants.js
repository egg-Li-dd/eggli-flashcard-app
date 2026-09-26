export const DB_NAME = 'AIFlashCardsDB'

export const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
export const IFLYTEK_SPARK_API_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions'
export const VOLCANO_ENGINE_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
export const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
export const DASHSCOPE_SPEECH_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'

export const MODELS = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek-V4 Pro（推荐）' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek-V4 Flash（快速）' },
]

export const AI_SERVICE_MODES = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'iflytek-spark', label: '讯飞星火 (Spark)' },
  { value: 'volcano', label: '火山引擎 (豆包/Ark)' },
  { value: 'dashscope', label: '阿里云千问 (DashScope)' },
  { value: 'vision-ai', label: '通用AI (视觉专用)' },
]

export const IFLYTEK_SPARK_MODELS = [
  { value: 'lite', label: 'Spark Lite（免费版）', maxTokens: 4096 },
  { value: 'generalv3', label: 'Spark Pro（专业版）', maxTokens: 8192 },
  { value: 'pro-128k', label: 'Spark Pro-128K（长上下文专业版）', maxTokens: 32768 },
  { value: 'generalv3.5', label: 'Spark Max（旗舰版）', maxTokens: 8192 },
  { value: 'max-32k', label: 'Spark Max-32K（长上下文旗舰版）', maxTokens: 32768 },
  { value: '4.0Ultra', label: 'Spark 4.0 Ultra（超旗舰版）', maxTokens: 32768 },
]

export const VOLCANO_ENGINE_MODELS = [
  { value: 'doubao-pro-32k', label: '豆包 Pro-32K（推荐，免费额度高）' },
  { value: 'doubao-pro-4k', label: '豆包 Pro-4K' },
  { value: 'doubao-lite-32k', label: '豆包 Lite-32K（轻量版）' },
  { value: 'doubao-lite-4k', label: '豆包 Lite-4K（轻量基础）' },
]

export const DASHSCOPE_MODELS = [
  { value: 'qwen3.5-plus-2026-04-20', label: 'qwen3.5-plus-2026-04-20' },
  { value: 'qwen3.6-max-preview', label: 'qwen3.6-max-preview' },
  { value: 'qwen3.7-max', label: 'qwen3.7-max' },
  { value: 'kimi-k2.6', label: 'kimi-k2.6' },
  { value: 'qwen3.7-max-2026-05-20', label: 'qwen3.7-max-2026-05-20' },
  { value: 'qwen3.7-plus-2026-05-26', label: 'qwen3.7-plus-2026-05-26' },
  { value: 'qwen3.6-flash', label: 'qwen3.6-flash' },
  { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
  { value: 'qwen3.6-27b', label: 'qwen3.6-27b' },
  { value: 'gui-plus-2026-02-26', label: 'gui-plus-2026-02-26' },
  { value: 'qwen3.6-plus-2026-04-20', label: 'qwen3.6-plus-2026-04-20' },
]

export function getSparkCredentialKeys(model) {
  return {
    apiPassword: `iflytek_spark_${model}_api_password`
  }
}

export const STORAGE_KEYS = {
  API_KEY: 'deepseek_api_key',
  MODEL: 'deepseek_model',
  FONT_SIZE: 'app_font_size',
  EYE_PROTECTION: 'app_eye_protection',
  THEME: 'app_theme',           // 'light' | 'dark' | 'auto'
  // 新增：管理员密码与 Supabase 运行时配置
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  SUPABASE_RUNTIME_URL: 'supabase_runtime_url',
  SUPABASE_RUNTIME_ANON_KEY: 'supabase_runtime_anon_key',
  SUPABASE_LAST_HEALTH: 'supabase_last_health_check',
  // 新增：用户强制本地模式标志
  FORCE_LOCAL_MODE: 'app_force_local_mode',
  // 新增：语音识别模式
  SPEECH_MODE: 'speech_recognition_mode',
  SPEECH_API_URL: 'speech_recognition_api_url',
  SPEECH_API_KEY: 'speech_recognition_api_key',
  INPUT_BAR_MODE: 'input_bar_mode',
  IFLYTEK_APP_ID: 'iflytek_app_id',
  IFLYTEK_API_SECRET: 'iflytek_api_secret',
  // AI 服务提供商
  AI_SERVICE_MODE: 'ai_service_mode',
  IFLYTEK_SPARK_MODEL: 'iflytek_spark_model',
  // 讯飞星火大模型配置（每个模型独立存储 APIPassword）
  IFLYTEK_SPARK_API_KEY: 'iflytek_spark_api_password',
  IFLYTEK_SPARK_API_SECRET: 'iflytek_spark_api_secret',
  // 新增：火山引擎豆包大模型配置
  VOLCANO_ENGINE_API_KEY: 'volcano_engine_api_key',
  VOLCANO_ENGINE_MODEL: 'volcano_engine_model',
  // 新增：阿里云千问大模型配置
  DASHSCOPE_API_KEY: 'dashscope_api_key',
  DASHSCOPE_MODEL: 'dashscope_model',
  // 新增：语音识别服务 - OpenAI 兼容 Whisper API 独立配置
  WHISPER_API_URL: 'whisper_api_url',
  WHISPER_API_KEY: 'whisper_api_key',
  // 新增：语音识别服务 - 讯飞语音听写(IAT)独立配置
  IFLYTEK_IAT_APP_ID: 'iflytek_iat_app_id',
  IFLYTEK_IAT_API_KEY: 'iflytek_iat_api_key',
  IFLYTEK_IAT_API_SECRET: 'iflytek_iat_api_secret',
  // 新增：讯飞实时语音转写标准版
  IFLYTEK_RTASR_STD_APP_ID: 'iflytek_rtasr_std_app_id',
  IFLYTEK_RTASR_STD_API_KEY: 'iflytek_rtasr_std_api_key',
  // 新增：讯飞实时语音转写大模型
  IFLYTEK_RTASR_LLM_APP_ID: 'iflytek_rtasr_llm_app_id',
  IFLYTEK_RTASR_LLM_ACCESS_KEY_ID: 'iflytek_rtasr_llm_access_key_id',
  IFLYTEK_RTASR_LLM_ACCESS_KEY_SECRET: 'iflytek_rtasr_llm_access_key_secret',
  // 新增：讯飞极速录音转写大模型
  IFLYTEK_OST_APP_ID: 'iflytek_ost_app_id',
  IFLYTEK_OST_API_KEY: 'iflytek_ost_api_key',
  IFLYTEK_OST_API_SECRET: 'iflytek_ost_api_secret',
  // 新增：讯飞中英识别大模型
  IFLYTEK_BIG_MODEL_APP_ID: 'iflytek_big_model_app_id',
  IFLYTEK_BIG_MODEL_API_KEY: 'iflytek_big_model_api_key',
  IFLYTEK_BIG_MODEL_API_SECRET: 'iflytek_big_model_api_secret',
  OCR_AUTO_GENERATE: 'ocr_auto_generate',
  // 图像识别引擎选择与配置
  OCR_ENGINE: 'ocr_engine',
  BAIDU_OCR_API_KEY: 'baidu_ocr_api_key',
  BAIDU_OCR_SECRET_KEY: 'baidu_ocr_secret_key',
  TESSERACT_LANGUAGE: 'tesseract_language',
  // 开发者模式
  DEVELOPER_MODE: 'app_developer_mode',
  // 背景与风格设置
  BG_PRESET: 'bg_preset',
  BG_IMAGE: 'bg_image',
  BG_IMAGE_MODE: 'bg_image_mode',
  BG_BLUR: 'bg_blur',
  BG_MASK_OPACITY: 'bg_mask_opacity',
  CARD_RADIUS: 'card_radius',
  CARD_SHADOW: 'card_shadow',
  CARD_BORDER: 'card_border',
  CARD_OPACITY: 'card_opacity',
  BTN_PRIMARY_OPACITY: 'btn_primary_opacity',
  BTN_SECONDARY_OPACITY: 'btn_secondary_opacity',
  STYLE_SCHEMES: 'style_schemes',
  ACTIVE_STYLE_SCHEME: 'active_style_scheme',
  // PC 引擎代理配置
  // 新增：通用AI视觉独立配置（用于图像识别优先调用）
  VISION_AI_URL: 'vision_ai_url',
  VISION_AI_KEY: 'vision_ai_key',
  VISION_AI_MODEL: 'vision_ai_model',
}

// 图像识别引擎选项
export const OCR_ENGINES = [
  {
    value: 'ai-model',
    label: 'AI 大模型视觉',
    description: '使用当前 AI 服务（DeepSeek/星火/火山/千问）的多模态视觉能力识别图片文字，按 token 计费',
  },
  {
    value: 'baidu-cloud',
    label: '百度智能云 OCR (备选)',
    description: '调用百度智能云通用文字识别（基于 PaddleOCR 商业版），每月免费 1000 次，超出按次计费',
  },
]

export const SPEECH_MODES = [
  {
    value: 'vosk-offline',
    label: 'Vosk 离线语音识别 (APP专用)',
    description: 'APP端离线识别，无需网络，隐私安全，完全免费，需下载语音模型',
  },
  {
    value: 'web-speech',
    label: '浏览器内置 (Web Speech)',
    description: '仅 Chrome/Edge 可用，需 HTTPS，免费。注意：依赖 Google 在线服务，断网时不可用',
  },
  {
    value: 'whisper-api',
    label: 'OpenAI 兼容语音 API (Whisper)',
    description: '录音后上传至兼容 OpenAI /v1/audio/transcriptions 的端点识别',
  },
  {
    value: 'iflytek-iat',
    label: '讯飞语音听写',
    description: '通过讯飞开放平台 WebSocket API 识别，短句识别（≤60秒）',
  },
  {
    value: 'iflytek-bigmodel',
    label: '讯飞中英识别大模型',
    description: '讯飞大模型短句识别，支持中文、英文及202种方言免切换',
  },
  {
    value: 'iflytek-rtasr-std',
    label: '讯飞实时语音转写（标准版）',
    description: '长音频实时转写，基于深度卷积神经网络，低延迟高稳定',
  },
  {
    value: 'iflytek-rtasr-llm',
    label: '讯飞实时语音转写（大模型版）',
    description: '基于星火大模型，支持202种方言+37语种免切识别，智能断句标点',
  },
  {
    value: 'iflytek-ost',
    label: '讯飞极速录音转写大模型',
    description: '长音频文件极速转写（5小时内），1小时音频约20秒出结果',
  },
  {
    value: 'dashscope-asr',
    label: '阿里云语音识别 (Paraformer)',
    description: '通过阿里云DashScope一句话识别API，高质量中文识别，需API Key',
  },
]

export const SUMMARY_LEVELS = [
  {
    value: 'concise',
    label: '精简',
    description: '提炼核心要点，卡片数量少',
  },
  {
    value: 'standard',
    label: '标准',
    description: '平衡详略，适合日常背诵',
  },
  {
    value: 'detailed',
    label: '详细',
    description: '全面覆盖，深入每个细节',
  },
]

function buildPrompt(densityHint, frontHint, backHint) {
  return `你是专业的背诵卡片制作助手，请处理用户提供的文本。
处理步骤：
第一步：先为每张卡片提炼一个"原始知识点"（knowledge_point），即本卡片对应的核心原文摘要，不超过150字；
第二步：基于该知识点生成卡片正面与背面。
其他要求：
1. 拆分知识点生成双面背诵卡片，卡片正面使用问题形式或关键词挖空形式，背面填写完整答案；
2. 根据内容的逻辑板块自动划分学习单元（每个单元应包含 5 张以上卡片，单元名称使用宽泛的概括性命名如"计算机网络基础"而非"OSI七层模型"，单元总数尽量控制在 5 个以内）；
3. 内容较长时合理拆分为多张卡片，保证单张卡片内容精简适合背诵；
4. 密度要求：${densityHint}；
5. 正面风格：${frontHint}；
6. 背面风格：${backHint}；
7. 【公式处理规则（必须严格遵守）】
   - 原文中的数学公式必须完整保留，不得丢失、改写为自然语言或省略
   - 所有数学公式统一用 LaTeX 格式输出：行内公式用 $公式$，块级公式用 $$公式$$
   - 原文中的普通数学符号也统一转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$
   - 非公式的美元金额用 \\$ 转义，公式必须放在 $ 或 $$ 之间
8. 最终只输出标准JSON格式，严禁出现多余文字、注释、Markdown符号。
固定输出格式（若存在多个学习单元，请使用数组形式）：
{
  "units": [
    {
      "name": "单元名称",
      "cards": [
        {
          "knowledge_point": "本卡片对应的原始知识点（原文摘要，不超过150字）",
          "front": "卡片正面内容（问题或挖空）",
          "back": "卡片背面内容（完整答案）"
        }
      ]
    }
  ]
}
待处理内容：`
}

export const CARD_GENERATION_PROMPT_BY_LEVEL = {
  concise: buildPrompt(
    '仅提炼最核心、最高频、最关键的知识点，过滤次要信息与举例，每个学习单元的卡片数量控制在较少范围',
    '使用简洁的关键词提问或关键术语挖空，避免长句',
    '给出精炼定义、核心结论或简短回答，避免冗长解释'
  ),
  standard: buildPrompt(
    '覆盖主要知识点与常考内容，兼顾深度与广度，卡片数量适中',
    '使用清晰的问题形式或关键词挖空，表述完整但不冗长',
    '给出准确且有一定信息量的答案，包含关键定义、原理与典型示例',
  ),
  detailed: buildPrompt(
    '全面覆盖文本中的重要信息，包括概念、原理、推导过程、例子、对比与适用场景，卡片数量可以较多',
    '使用详细的问题形式，必要时给出多维度设问（定义/原理/区别/应用/例子）',
    '给出完整、细致、层次分明的答案，必要时分条陈述或补充注意事项与易错点',
  ),
}

export const CARD_GENERATION_PROMPT = CARD_GENERATION_PROMPT_BY_LEVEL.standard

// 用户已编辑 knowledge_point 后，要求 AI 根据新的知识点重新生成问题与答案。
export function buildRegenerateCardPrompt(knowledgePoint, densityHint) {
  const safeKp = String(knowledgePoint || '').trim() || '（空）'
  return `你是一个专业的背诵卡片制作助手。用户已经编辑好了一段知识点，请你据此重新生成一张双面背诵卡片。
要求：
1. 只返回 JSON 格式，严禁输出多余文字、Markdown、代码块；
2. 卡片正面（front）：使用问题形式或关键词挖空；
3. 卡片背面（back）：给出完整答案；
4. 密度：${densityHint || '覆盖主要知识点，兼顾深度与广度'}。
5. 保留原始的知识点内容（供后续可再次编辑）。
6. 【公式处理】数学公式必须用 LaTeX 格式：行内 $公式$，块级 $$公式$$；普通符号也转 LaTeX（x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$）；非公式美元用 \\$ 转义。

输出格式：
{
  "knowledge_point": "在此处返回用户传入的原始知识点，原样保留，不改动",
  "front": "卡片正面内容",
  "back": "卡片背面内容"
}

用户提供的原始知识点：
${safeKp}`
}

export const OCR_PROMPT = '请提取图片中的关键知识点，保留其格式，只返回关键性的文字知识点，不加解释和拓展。'

// ===== 两步生成：Step 1 —— 知识点提取 =====
// 强模型（GPT/DeepSeek/通义千问等）使用：详细规则，覆盖各种边界情况
// ${categoryPurpose} 占位符用于插入分类目的（如"考研"、"计算机408"等）
export const KNOWLEDGE_POINT_EXTRACTION_PROMPT = `你是专业的{{categoryPurpose}}知识点提炼助手。请将用户提供的文本拆分为若干条独立的"原始知识点"。

{{purposeConstraint}}

【最高优先级规则】
- 绝对禁止提取纯章节标题（如"第一章 XXX""第1节""一、XXX"等没有具体知识描述的标题）
- 但如果标题后紧跟具体内容，则标题和内容一起作为一条知识点

【核心原则】严格忠于原文，不做任何加工
【数学公式处理（关键）】
- 原文中的数学公式必须原样保留，不得丢失或改写
- 数学公式统一用 LaTeX 格式：行内公式用 $公式$，块级公式用 $$公式$$
- 数学符号转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$

【拆分规则】
1. 只拆分，不新增：知识点内容必须完全来自输入文本
2. 不做拓展：不自行推理、总结、概括、补充解释或举例子
3. 保持原文措辞：不要换说法、同义替换或润色
4. 独立拆分：每条知识点是一条独立、完整的信息
5. 编号/标题与其对应的说明内容属于同一条知识点
6. 按自然段落或语义转折点拆分
7. 不遗漏：输入文本中的所有知识性内容都要覆盖

【输出格式】只输出标准 JSON，不要其他文字：
{
  "knowledge_points": ["知识点1完整内容", "知识点2完整内容", "..."]
}
`

// 弱模型（讯飞 Spark Lite）使用：简化规则，避免 AI 过度归纳压缩
export const KNOWLEDGE_POINT_EXTRACTION_PROMPT_WEAK = `你是{{categoryPurpose}}提取助手。请将文本中的每一条知识拆分为独立的知识点。

{{purposeConstraint}}

核心规则（必须严格遵守）：
1. 【一条输入对应一条输出】每个独立陈述、定义、原理、说明都必须作为一条独立的知识点输出，绝对不能将多条归纳合并为一条
2. 【保留编号与内容】如果一条知识点前面有编号（如"1."、"（1）"、"第一章"），必须把编号和后面的内容一起作为同一条输出，不能只输出标题
3. 【跳过纯标题】只跳过完全没有任何实质内容的纯章节标题（例如"第一章 计算机概述"且后面无内容）
4. 【保留原文措辞】不要修改、不要总结、不要同义替换
5. 【不遗漏】每一条独立的知识都要提取出来，不要因为"主题相关"就合并
6. 【公式保留】原文中的数学公式必须原样保留，统一用 LaTeX 格式：行内 $公式$，块级 $$公式$$；普通符号也转 LaTeX（x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$）；非公式美元用 \\$ 转义

错误示范（禁止）：
- 输入三条独立的知识，输出一条综合性的总结 ❌
- 把"操作系统管理硬件"和"操作系统管理软件"合并为"操作系统管理资源" ❌

正确示范：
输入："1. 操作系统管理硬件资源。2. 操作系统管理软件资源。3. 操作系统提供用户接口。"
输出三条独立的知识点，每条都包含编号和完整内容 ✓

输出 JSON 格式（不要任何其他文字、不要 Markdown 代码块）：
{"knowledge_points": ["条目1完整原文", "条目2完整原文", "条目3完整原文", ...]}
`

// 根据知识点内容生成分类目的的 prompt
export const CATEGORY_PURPOSE_GENERATION_PROMPT = `请根据以下知识点内容，用一句话（不超过30字）概括本分类的学习目的或考试目标。要求简洁明了，说明要掌握什么知识或达到什么能力。
只需输出学习目的文本，不要任何其他内容。`

// ===== 两步生成：Step 2 —— 知识点批量转卡片 =====
function buildBatchCardsPromptCore(densityHint, backHint) {
  return `你是专业的背诵卡片制作助手。请为以下每条原始知识点生成一张双面背诵卡片，并按知识体系逻辑自动分组到学习单元。

核心原则：卡片内容严格来源于对应的原始知识点，不做额外知识补充。
要求：
1. 每条知识点对应一张卡片，一一对应，不增不减
2. 卡片正面使用问题形式或关键词挖空形式
3. 卡片背面填写完整答案，内容只能来源于该条知识点的原文，不添加外部知识
4. 不做拓展：不从知识点之外补充背景、举例、联想或同类比较
5. knowledge_point 字段必须原样返回对应的原始知识点内容，不做任何改动
6. kpMarker 字段必须原样保留输入中每条知识点前的 [__KP_N__] 标记，这是知识点全局索引，必须完整保留
7. ${densityHint}
8. ${backHint}
9. 按知识体系逻辑分组：将主题相关的卡片归为同一单元，每个单元至少包含2张卡片
10. 单元名称使用宽泛的概括性命名（如"计算机网络基础"），不超过16个字
11. 【公式处理规则（必须严格遵守）】
    - 原文中的数学公式必须完整保留，不得丢失、改写为自然语言或省略
    - 所有数学公式统一用 LaTeX 格式输出：行内公式用 $公式$，块级公式用 $$公式$$
    - 原文中的普通数学符号也统一转为 LaTeX：x²→$x^2$，√2→$\\sqrt{2}$，1/2→$\\frac{1}{2}$，∑→$\\sum$，∫→$\\int$，π→$\\pi$，≤→$\\leq$，≠→$\\neq$
    - 非公式的美元金额用 \\$ 转义，公式必须放在 $ 或 $$ 之间
12. 只输出标准 JSON 格式，严禁多余文字、注释、Markdown

输出格式：
{
  "units": [
    {
      "name": "单元名称",
      "cards": [
        {
          "kpMarker": "[__KP_0__]",
          "knowledge_point": "原始知识点原文",
          "front": "卡片正面（问题/挖空）",
          "back": "卡片背面（完整答案）"
        }
      ]
    }
  ]
}
`
}

export const BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT = buildBatchCardsPromptCore(
  '密度要求：覆盖主要知识点与常考内容，兼顾深度与广度，答案长度适中',
  '卡片背面：给出准确且有信息量的答案，包含关键定义、原理与典型表述'
)

export const BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT_BY_LEVEL = {
  concise: buildBatchCardsPromptCore(
    '密度要求：仅提炼最核心、最高频的关键信息，过滤次要信息与举例，卡片内容精简，答案简短扼要',
    '卡片背面：给出精炼定义或核心结论，避免冗长解释'
  ),
  standard: buildBatchCardsPromptCore(
    '密度要求：覆盖主要知识点与常考内容，兼顾深度与广度，卡片内容长度适中',
    '卡片背面：给出准确且有信息量的答案，包含关键定义、原理与典型表述'
  ),
  detailed: buildBatchCardsPromptCore(
    '密度要求：全面覆盖知识点中的重要信息，包括概念、原理、推导过程、例子、对比与适用场景，卡片内容可以较丰富',
    '卡片背面：给出完整、细致、层次分明的答案，必要时分条陈述或补充注意事项与易错点'
  ),
}

export function getBatchCardsPromptByLevel(summaryLevel) {
  const levelKey = typeof summaryLevel === 'string' && summaryLevel in BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT_BY_LEVEL
    ? summaryLevel
    : 'standard'
  return BATCH_CARDS_FROM_KNOWLEDGE_POINTS_PROMPT_BY_LEVEL[levelKey]
}

export const SPEECH_CLEANUP_SYSTEM_PROMPT =
  '你是专业的中文文本整理助手。用户会给你一段语音识别出的原始文本，' +
  '其中可能包含口语化表达（嗯、那个、就是说、我想想、对吧、然后等）、重复词句、缺少标点、识别错误。' +
  '请：1. 删除无意义的口头语和重复；2. 补充合适的标点与分段；3. 修正明显的识别错误；' +
  '4. 保留所有原始知识点、日期、人名、专有名词、数字；5. 直接输出整理后的文本，不要加引号、' +
  '不要加解释性文字、不要加"整理后的文本："等前缀。'

// ===== 题库检测相关常量 =====

export const TEST_TYPES = {
  UNIT: 'unit',
  CATEGORY: 'category',
  CHAPTER: 'chapter',
  REVIEW: 'review',
  WRONG: 'wrong',
}

export const TEST_QUESTION_GENERATION_PROMPT = `你是一个专业的考研题目出题助手。请根据提供的学习卡片内容和掌握状态，生成检测题目。

要求：
1. 仅针对"未掌握"和"待掌握"的卡片生成新题目，已掌握的卡片最多生成 1 道简单题用于巩固
2. 出题优先级：未掌握 > 待掌握 > 已掌握
3. 单元检测：每个知识点最多 3 道题，单次最多生成 50 道
4. 分类检测：每个知识点最多 2 道题，单次最多生成 100 道
5. 必须混合生成以下四种题型，比例约为 单选题40% + 多选题20% + 判断题20% + 填空题20%：
   - single_choice：单选题（4 个选项，只有 1 个正确答案）
   - multi_choice：多选题（4 个选项，有 2-4 个正确答案）
   - true_false：判断题（判断题干陈述是否正确）
   - fill_blank：填空题（需要用一个词或短语填入空白）
6. 难度分为 1-3 级（1=简单, 2=中等, 3=困难）
7. 题干必须清晰明确，围绕知识点核心概念出题
8. 选择题选项应具有干扰性，多选题需明确有多少个正确选项
9. 判断题的答案用 "正确" 或 "错误" 表示
10. 解析需说明正确答案的理由及错误选项的排除原因
11. 不要生成与已有题目重复的题目（已有题目列表会提供）
12. 仅返回 JSON 数组格式，不要额外文字、Markdown 或代码块
13. 每道题必须包含 "type" 字段
14. **重要：只返回纯 JSON 数组，不要包含任何 markdown 代码块标记（\`\`\`json）、解释文字或前缀。**

【输出格式】严格返回 JSON 数组（根据 type 值使用对应格式）：

■ 单选题 (type: "single_choice")：
{
  "type": "single_choice",
  "stem": "题干内容",
  "options": [
    {"label": "A", "text": "选项A内容"},
    {"label": "B", "text": "选项B内容"},
    {"label": "C", "text": "选项C内容"},
    {"label": "D", "text": "选项D内容"}
  ],
  "answer": "A",
  "analysis": "解析说明",
  "difficulty": 3,
  "knowledgePoint": "关联的知识点名称",
  "cardId": "关联的卡片ID（可选，如无则填null）"
}

■ 多选题 (type: "multi_choice")：
{
  "type": "multi_choice",
  "stem": "题干内容（需提示为多选题）",
  "options": [
    {"label": "A", "text": "选项A内容"},
    {"label": "B", "text": "选项B内容"},
    {"label": "C", "text": "选项C内容"},
    {"label": "D", "text": "选项D内容"}
  ],
  "answer": "AB",
  "analysis": "解析说明（说明每个正确选项的理由）",
  "difficulty": 3,
  "knowledgePoint": "关联的知识点名称",
  "cardId": "关联的卡片ID（可选，如无则填null）"
}

■ 判断题 (type: "true_false")：
{
  "type": "true_false",
  "stem": "判断以下陈述是否正确：...(陈述内容)",
  "options": [
    {"label": "正确", "text": "正确"},
    {"label": "错误", "text": "错误"}
  ],
  "answer": "正确",
  "analysis": "解析说明（说明为什么正确或错误）",
  "difficulty": 3,
  "knowledgePoint": "关联的知识点名称",
  "cardId": "关联的卡片ID（可选，如无则填null）"
}

■ 填空题 (type: "fill_blank")：
{
  "type": "fill_blank",
  "stem": "题干内容（用 ____ 或 ( ) 标记填空位置）",
  "options": [],
  "answer": "正确答案",
  "analysis": "解析说明",
  "difficulty": 3,
  "knowledgePoint": "关联的知识点名称",
  "cardId": "关联的卡片ID（可选，如无则填null）"
}`

export const TEST_QUESTION_GENERATION_PROMPT_LITE = `你是一个出题助手。根据提供的学习卡片生成检测题目。

【最高优先级·格式硬约束（违反任何一条即整题作废）】
A. 选项 label（标签）必须是以下之一，禁止使用其它任何文字：
   - 单选题 / 多选题：严格只能是 "A" "B" "C" "D"（大写字母，不带点、不带括号）
   - 判断题：严格只能是 "正确" "错误"
B. 选项 text（内容）必须是完整的知识点陈述句（主谓宾齐全的句子），不能是：
   - 知识点标签（"内存RAM的特点"、"外存的特点"、"XXX的定义"等）
   - 状态词（"待掌握"、"未掌握"、"学习中"、"已掌握"、"掌握中"等）
   - 判断词（"正确"、"错误"、"对"、"错"、"是"、"否"等单独使用）
   - 数字 / 字母编号 / 标点符号
C. 题干 stem 必须是清晰、完整的问题或陈述句，不能：
   - 是判断题却写成"XXX的特点是…"让用户去选（那应是单选）
   - 题干直接复述卡片答案（如直接把"内存断电后数据会被清空"作为题干）
   - 与选项内容高度重复
D. 单选题：四个选项都必须有完整陈述句内容；只有 1 个选项的陈述是正确的
   多选题：题干末尾必须包含"(多选题)"或"下列…正确的有(可多选)"，有 2-4 个正确选项
   判断题：选项固定为 "正确""错误"；stem 必须是"判断以下说法是否正确：……"开头
   填空题：stem 用 ____ 标记空格位置；options 必须是 []

【出题数量要求】
- 本次任务：为当前提供的每一张卡片都生成至少一道新题目
- 每张卡片至少1道，最多3道
- 卡片总数≤10张时，必须为每张卡片都生成题目
- 禁止生成完全重复的题目
- 已有题库只供参考，目的是让你避免出重复题

【正例·单选题】
{"type":"single_choice","stem":"内存(RAM)最主要的特点是下列哪一项？","options":[{"label":"A","text":"断电后数据会被清空"},{"label":"B","text":"断电后数据永久保存"},{"label":"C","text":"存储容量大于硬盘"},{"label":"D","text":"读写速度低于硬盘"}],"answer":"A","analysis":"RAM 是随机存取存储器，断电后数据丢失是其核心特点","difficulty":2,"knowledgePoint":"内存与外存的区别"}

【反例·错误（label 用错）】
❌ {"options":[{"label":"正确","text":"断电后数据会被清空"}, ...]} ← label 必须是 A/B/C/D
❌ {"options":[{"label":"待掌握","text":"内存的特点"}, ...]} ← label 错 + text 是知识点标签
❌ {"options":[{"label":"A","text":"内存(RAM)的特点"}, {"label":"B","text":"外存的特点"}]} ← text 是标签不是陈述句
❌ {"stem":"内存(RAM)的特点是断电后数据会被清空", "options":[{"label":"A","text":"正确"}, ...]} ← 题干是陈述，选项却用判断词

【反例·错误（题干-选项重复）】
❌ stem:"内存(RAM)的特点是断电后数据会被清空" + options:[A:"断电后数据会被清空", B:"断电后数据不会被清空"]
   正确做法：stem 改为"下列关于内存(RAM)特点的描述，正确的是？"，4 个选项都是不同的完整陈述

只返回 JSON 数组，不要任何解释、Markdown 代码块、前后缀文字。`

// ===== 2026-06-15 弱模型多次小批量调用策略 =====
// 核心思路：弱模型（讯飞星火 Lite）一次大批量 prompt 容易畸形返回，
// 改为按题型 + 卡片批次拆分，每次只出 1 种题型、5 张卡片内。
// 每种题型的 prompt 极简且聚焦，弱模型更易遵循。

// 通用前置：所有题型共同遵守的"硬约束"（极简版）
export const LITE_COMMON_RULES = `【硬约束（任何一条违反都视为废题）】
-1. label 必须是 A/B/C/D（单选/多选）或 "正确"/"错误"（判断），禁止用其它任何文字。
-2. text 必须是完整的知识点陈述句（主谓宾齐全），禁止用知识点标签/状态词/判断词。
-3. 知识点标签 = "X的特点"/"X的定义"/"X的含义" 等不是完整句子的内容。
-4. 状态词 = "待掌握"/"未掌握"/"学习中"/"已掌握" 等禁止出现。
-5. 每道题必须包含 cardId 字段，值为输入卡片中的 [mk=标记N]。
-6. 输出 Markdown 表格，不要 JSON、不要解释、不要代码块标记。`

// 单题型 prompt：每次只出一种题型，输入卡片数 ≤5
export const TEST_QUESTION_LITE_SINGLE = `你是一个出题助手。请根据提供的 ${'${CARD_COUNT}'} 张学习卡片，生成 ${'${CARD_COUNT}'} 道【单选题】。

每张卡片必须对应 1 道单选题。题目的"正确答案"应来自卡片答案，但不能直接复述答案文字作为题干。

${'${COMMON_RULES}'}

【单选题格式（严格）】
- 4 个选项填入 A/B/C/D 列，都是完整的知识点陈述句，只有 1 个正确
- answer 列填正确选项的字母："A" 或 "B" 或 "C" 或 "D"
- 题干必须以"?"或"？"结尾，疑问形式
- diff 列填难度 1-3（1=简单 2=中等 3=困难）

【输出格式（Markdown 表格）】
| type | stem | A | B | C | D | answer | cardId | diff | analysis |
|------|------|---|---|---|---|--------|--------|------|----------|
| single | 下列关于内存(RAM)的特点，正确的是？ | 断电后数据会被清空 | 断电后数据永久保存 | 存储容量大于硬盘 | 读写速度低于硬盘 | A | 标记1 | 2 | RAM 断电后数据丢失 |

【反例（绝对禁止）】
❌ A/B/C/D 列用"正确"/"错误"/"待掌握" → 必须是完整陈述句
❌ A/B/C/D 列用"内存的特点"/"外存的特点"等知识点标签
❌ 题干直接复述答案（如题干写"内存断电后数据会被清空"，选项 A 又是这个内容）
❌ 题干是陈述句无问号

【输入卡片】
${'${CARDS}'}

只返回 Markdown 表格，不要解释。`

export const TEST_QUESTION_LITE_MULTI = `你是一个出题助手。请根据提供的 ${'${CARD_COUNT}'} 张学习卡片，生成 ${'${CARD_COUNT}'} 道【多选题】。

每张卡片必须对应 1 道多选题。题目的"正确答案选项"应来自卡片答案组合。

${'${COMMON_RULES}'}

【多选题格式（严格）】
- 题干末尾必须含"（多选题）"或"(多选题)"标记
- 4 个选项填入 A/B/C/D 列，都是完整的知识点陈述句
- answer 列填多个正确选项的字母连写（按字母升序），如 "AB"、"ACD"，不能写"A,B,C"或"AB, CD"
- 至少 2 个正确选项，至多 4 个
- diff 列填难度 1-3

【输出格式（Markdown 表格）】
| type | stem | A | B | C | D | answer | cardId | diff | analysis |
|------|------|---|---|---|---|--------|--------|------|----------|
| multi | 下列关于内存(RAM)特点的描述，正确的有（多选题）？ | 断电后数据会被清空 | 用于临时存放运行程序 | 存储容量无限 | 读写速度快 | ABD | 标记1 | 3 | ABD 均为 RAM 特点 |

【反例】
❌ answer 用逗号分隔（"A,B"或"A, B"） → 必须连写如"AB"
❌ 题干没有"多选题"标记
❌ 只标 1 个正确选项（那不是多选）

【输入卡片】
${'${CARDS}'}

只返回 Markdown 表格，不要解释。`

export const TEST_QUESTION_LITE_TRUE_FALSE = `你是一个出题助手。请根据提供的 ${'${CARD_COUNT}'} 张学习卡片，生成 ${'${CARD_COUNT}'} 道【判断题】。

每张卡片必须对应 1 道判断题。题目是一个与卡片知识点相关的陈述句，但**不一定都是正确的**。你必须：
- 大约一半的题目的陈述是正确的（卡片上的原始内容是事实），答案为"正确"
- 大约一半的题目的陈述是错误的（你故意对卡片内容进行歪曲、修改关键词或添加错误信息），答案为"错误"
- 整体上，"正确"和"错误"的比例必须接近 1:1，绝对不能全是"正确"

${'${COMMON_RULES}'}

【判断题格式（严格）】
- type 列填 judge
- A/B/C/D 列留空（判断题无选项）
- answer 列填 "正确" 或 "错误"（中文），禁止 "T"/"F"/"true"/"false"
- 题干必须以"判断以下说法是否正确："开头，后面跟完整陈述句
- diff 列填难度 1-3
- 如果陈述是"错误"的，必须在 analysis 列说明哪里错了

【输出格式（Markdown 表格）】
| type | stem | A | B | C | D | answer | cardId | diff | analysis |
|------|------|---|---|---|---|--------|--------|------|----------|
| judge | 判断以下说法是否正确：内存(RAM)断电后数据会被清空。 | | | | | 正确 | 标记1 | 1 | RAM 是易失性存储器，断电后数据确实会丢失 |
| judge | 判断以下说法是否正确：硬盘的读写速度比内存(RAM)更快。 | | | | | 错误 | 标记2 | 2 | 实际上内存(RAM)的读写速度远快于硬盘 |

【反例】
❌ answer 写 "true"/"false" → 必须是"正确"或"错误"
❌ 题干没"判断以下说法是否正确："前缀
❌ 所有题目的 answer 都是 "正确"（必须有一半左右是"错误"）

【输入卡片】
${'${CARDS}'}

只返回 Markdown 表格，不要解释。`

export const TEST_QUESTION_LITE_FILL = `你是一个出题助手。请根据提供的 ${'${CARD_COUNT}'} 张学习卡片，生成 ${'${CARD_COUNT}'} 道【填空题】。

每张卡片必须对应 1 道填空题。题目把卡片答案中一个关键词挖空，让用户填写。

${'${COMMON_RULES}'}

【填空题格式（严格）】
- type 列填 fill
- A/B/C/D 列留空（填空题无选项）
- 题干 stem 用 4 个下划线 ____ 标记挖空位置
- answer 列填被挖空的内容（中文词或词组）
- diff 列填难度 1-3
- **【极重要】题干必须是陈述句，绝对禁止使用"X 是什么""X 的区别""X 的功能是"等问句形式**
- **【极重要】必须把卡片答案中一个核心词挖空，题干应该是包含 ____ 的陈述句**

【输出格式（Markdown 表格）】
| type | stem | A | B | C | D | answer | cardId | diff | analysis |
|------|------|---|---|---|---|--------|--------|------|----------|
| fill | 内存(RAM)断电后数据会____。 | | | | | 被清空 | 标记1 | 2 | RAM 是易失性存储器 |

【反例·问句型】（绝对禁止）
❌ stem:"IPv4和IPv6的区别是什么？" → 应改为"IPv4和IPv6的区别是____。" + answer 写答案核心内容
❌ stem:"X 的功能是什么？" → 应改为陈述句 + 挖空
✅ 正确: stem:"内存(RAM)断电后数据会____。" + answer:"被清空"
✅ 正确: stem:"HTTP 协议默认端口是____。" + answer:"80"

【输入卡片】
${'${CARDS}'}

只返回 Markdown 表格，不要解释。`

// 弱模型单批调用的题型清单与对应 prompt 模板
export const LITE_QUESTION_TYPES = [
  { type: 'single_choice', template: TEST_QUESTION_LITE_SINGLE, label: '单选题' },
  { type: 'multi_choice', template: TEST_QUESTION_LITE_MULTI, label: '多选题' },
  { type: 'true_false', template: TEST_QUESTION_LITE_TRUE_FALSE, label: '判断题' },
  { type: 'fill_blank', template: TEST_QUESTION_LITE_FILL, label: '填空题' },
]

// 难度等级定义
export const DIFFICULTY_LEVELS = [
  { value: 1, label: '简易', description: '基础概念，记忆为主' },
  { value: 2, label: '中等', description: '理解应用，需要思考' },
  { value: 3, label: '困难', description: '综合分析，深度理解' },
  { value: 'random', label: '随机', description: '混合三种难度，题库不全时自动补全' },
]

// LITE 单批卡片数上限
export const LITE_BATCH_SIZE = 5

// 强模型省 token 出题策略
// 复用 analyzeQuestionMatrix 跳过"已出齐"任务 + 按题型组合分批
// 调用次数: 1 次大批量 → 2-8 次小批量，单次 prompt token 降低 60-70%
export const STRONG_MODEL_STRATEGY = {
  // 2026-06-23: 所有模型 batchSize 统一改为 6，减小批次让 AI 更容易达到每次目标数量
  // DeepSeek-V4 Pro/Flash：上下文长(128K)
  'deepseek': { batchSize: 6, maxTypesPerBatch: 2, label: 'DeepSeek' },
  // 讯飞星火 Pro/Max/4.0Ultra
  'iflytek-spark-generalv3': { batchSize: 6, maxTypesPerBatch: 2, label: 'Spark Pro' },
  'iflytek-spark-max-32k': { batchSize: 6, maxTypesPerBatch: 2, label: 'Spark Max-32K' },
  'iflytek-spark-4.0Ultra': { batchSize: 6, maxTypesPerBatch: 2, label: 'Spark 4.0 Ultra' },
  'iflytek-spark-pro-128k': { batchSize: 6, maxTypesPerBatch: 2, label: 'Spark Pro-128K' },
  'iflytek-spark-generalv3.5': { batchSize: 6, maxTypesPerBatch: 2, label: 'Spark Max' },
  // 火山引擎豆包/千问
  'volcano': { batchSize: 6, maxTypesPerBatch: 2, label: '豆包' },
  'dashscope': { batchSize: 6, maxTypesPerBatch: 2, label: '千问' },
}

// 强模型出题题型组合（每批 1-2 个题型）
// 强模型擅长处理多种题型，但 4 题型一次出 prompt 过长
// 拆成 2 组：选择题组（单选+多选） + 简化题组（判断+填空）
export const STRONG_TYPE_GROUPS = [
  { name: 'objective', types: ['single_choice', 'multi_choice'] },
  { name: 'binary', types: ['true_false', 'fill_blank'] },
]

// 强模型单批卡片数默认上限（按模型选择后的兜底）
// 2026-06-23: 12→6，减小批次让 AI 更容易达到每次目标数量，提升总生成量
export const STRONG_DEFAULT_BATCH_SIZE = 6

export const TEST_GRADING_PROMPT = `你是一个专业的题目批改助手。请根据提供的题目、标准答案和用户作答，进行评分和解析。

要求：
1. 判断用户答案是否正确
2. 如果正确，给出简要的知识点确认
3. 如果错误，说明错误原因，给出正确思路
4. 仅返回 JSON 格式，不要额外文字

【输出格式】：
{
  "correct": true/false,
  "score": 0-100,
  "feedback": "批改评语"
}
`

