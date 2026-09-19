/**
 * 弱模型分类逻辑全面测试脚本
 *
 * 测试内容：
 * 1. 知识点提取 (extractKnowledgePoints)
 * 2. 主题聚类 (clusterKnowledgePointsByTopicWithSpark)
 * 3. 卡片到单元/章节分配 (reorganizeUnits)
 * 4. 关键词匹配辅助分类 (classifyByKeyword)
 * 5. 后处理与降级策略 (postProcessStructure, fallback)
 *
 * 使用方法：
 *   node scripts/test-weak-model-classification.mjs
 *
 * 注意：需配置 SPARK API 环境变量或在脚本中填入
 */

import http from 'http';
import https from 'https';

// ============================================================
// 配置区
// ============================================================
const SPARK_CONFIG = {
  apiUrl: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
  apiKey: 'VwUksgZRWaNtCszikCTz',
  apiSecret: 'DTmGTGTLEOuFAcELiaqz',
  model: 'lite',
};

// HTTP 请求工具 (Node.js 原生 fetch 可能有问题，用 http模块)
function makeHttpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function callSparkLite(prompt, maxTokens = 2048, temperature = 0.3) {
  try {
    const response = await makeHttpRequest(SPARK_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SPARK_CONFIG.apiKey}:${SPARK_CONFIG.apiSecret}`,
      },
      timeout: 25000,
    }, JSON.stringify({
      model: SPARK_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }));

    if (!response.ok) {
      throw new Error(`Spark API Error (${response.status}): ${JSON.stringify(response.data).slice(0, 200)}`);
    }

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Spark: Empty response content');
    }
    return content;
  } catch (err) {
    throw new Error(`Spark 调用失败: ${err.message}`);
  }
}

// ============================================================
// 测试数据集
// ============================================================
const TEST_DATASETS = {
  computer_science: [
    { kp: '世界第一台通用电子数字计算机：1946年美国宾夕法尼亚大学研制的ENIAC，采用电子管元器件', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '计算机发展四代划分：电子管时代、晶体管时代、中小规模集成电路时代、大规模超大规模集成电路时代', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '电子管计算机特点：体积大、功耗高、运算速度慢，仅用于军事科研数值计算', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '晶体管计算机特点：体积缩小、能耗降低、可靠性提升，开始应用于企业数据处理', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '按性能规模计算机分类：巨型机、大型机、小型机、微型机、嵌入式计算机五大类', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '微型计算机：日常台式机、笔记本，面向个人使用，普及率最高的计算机类型', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '嵌入式计算机：内置家电、汽车、智能手环内部，专用化、不可随意更改系统的计算机', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '计算机五大核心特性：运算速度快、计算精度高、存储能力强、具备逻辑判断、自动化运行', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '计算机最早用途：科学计算；当下最广泛用途：数据信息处理', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '未来计算机发展方向：巨型化、微型化、网络化、智能化、多媒体化', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '计算机底层唯一识别进制：二进制，数码只有0、1，逢二进一', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '常用计算机进制：二进制、八进制、十进制、十六进制，日常输入输出默认十进制', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '进制通用规则：N进制包含0~N-1数码，运算规则逢N进一', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '字节定义：计算机最小存储单位，英文Byte，1字节=8位二进制位（bit）', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '存储单位换算：1KB=1024B、1MB=1024KB、1GB=1024MB、1TB=1024GB', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '位（bit）：计算机最小数据处理单位，代表一个二进制0或1', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: 'ASCII码：西文字符标准编码，1个英文字符占用1字节，标准ASCII共128个字符', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '汉字国标码GB2312：常用中文编码，一个汉字占用2个字节存储空间', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '大小写字母ASCII规律：大写字母数值小于小写字母，同字母大小写差值固定为32', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '进制转换核心：十进制转二进制采用除2取余法，逆序读取余数得出结果', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: '完整计算机系统二分结构：硬件系统+软件系统，二者缺一不可协同工作', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '计算机硬件五大逻辑部件：运算器、控制器、存储器、输入设备、输出设备', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: 'CPU组成：运算器+控制器，是计算机核心处理芯片，决定整机运行速度', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '运算器功能：负责算术加减乘除运算、逻辑与或非判断运算', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '控制器功能：统筹指挥整机硬件，协调各部件有序执行指令、完成作业', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '存储器分类：内存储器（内存）、外存储器（外存）两类', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '输入设备定义：向计算机录入数据指令设备，例键盘、鼠标、扫描仪、麦克风', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '输出设备定义：计算机向外展示处理结果设备，例显示器、打印机、音响', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '裸机定义：仅搭载硬件、无任何操作系统及应用软件，无法直接使用的计算机', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '软硬件依存关系：硬件是物理载体，软件是运行灵魂，软件依托硬件执行工作', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: '内存分类：RAM随机存取存储器、ROM只读存储器两大类型', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'RAM特点：断电数据全部丢失，读写速度快，俗称运行内存，支持随机读写', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'ROM特点：断电数据永久保留，出厂固化程序，用户无法自行修改写入数据', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: '高速缓存Cache：介于CPU与内存之间，缓解CPU和内存速度差，提升运行效率', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'DDR内存：当下主流台式笔记本内存型号，迭代版本越高，带宽速度越快', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: '外存通用特点：容量大、价格低、断电保数据、读写速度远低于内存', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: '机械硬盘HDD：依靠磁盘转动读写，容量大、价格低、防震差、读写速度慢', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: '固态硬盘SSD：闪存颗粒读写，静音防震、开机极速、故障率低，目前主流硬盘', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'U盘、光盘属于移动外存，可跨设备传输存储文件，便携性较强', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: '读写速度排序（由快到慢）：CPU缓存>内存>固态硬盘>机械硬盘', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
  ],

  small_mixed: [
    { kp: 'ENIAC于1946年诞生，是世界上第一台通用电子数字计算机', expectedUnit: '计算机发展与分类', expectedChapter: '计算机基础概述' },
    { kp: '二进制由0和1组成，是计算机内部数据的基本表示方式', expectedUnit: '计算机数制与信息编码', expectedChapter: '计算机基础概述' },
    { kp: 'CPU由运算器和控制器组成，是计算机的核心部件', expectedUnit: '计算机系统组成概述', expectedChapter: '计算机基础概述' },
    { kp: 'RAM是随机存取存储器，断电后数据全部丢失', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'SSD采用闪存存储技术，读写速度远高于机械硬盘', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
  ],

  single_topic: [
    { kp: 'RAM随机存取存储器：支持随机读写，断电数据全部丢失', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'ROM只读存储器：出厂固化程序，断电数据永久保留', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'Cache高速缓存：缓解CPU与内存的速度差，提升运行效率', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
    { kp: 'SSD固态硬盘：采用闪存颗粒，静音防震、开机极速', expectedUnit: '内部存储硬件', expectedChapter: '计算机硬件系统详解' },
  ],
};

// ============================================================
// 核心功能：结构规划 (模仿 SparkLiteAdapter)
// ============================================================
async function planStructure(cards) {
  const kpCount = cards.length;
  const suggestedMin = kpCount < 10 ? 1 : kpCount < 20 ? 2 : kpCount < 50 ? 3 : 4;
  const suggestedMax = kpCount < 10 ? 2 : kpCount < 20 ? 3 : kpCount < 50 ? 6 : 8;

  const kpLines = cards.map((c, i) => `${i}. ${c.kp}`).join('\n');

  const prompt = `你是考研计算机基础分类专家。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。

【核心原则】：
1. 单元数量 = 知识点大类数量，不是每张卡片一个单元
2. 多个相关的知识点必须归入同一个单元
3. 例如：40个知识点应该规划为 2-4 个章节，每章 2-3 个单元，总共 4-8 个单元

【结构规划硬约束】：
1. 章节总数：2-3 个（最多不超过 4 个）
2. 每个章节包含 2-3 个单元（最多不超过 5 个）
3. 单元总数：${suggestedMin}-${suggestedMax} 个（绝对不能超过 10 个）
4. 禁止为每张卡片创建独立单元
5. 禁止使用知识点标题作为单元名

【卡片列表】（共 ${cards.length} 张）：
${kpLines}

【任务】：
1. 分析所有卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为 2-3 个章节
3. 每个章节下划分 2-3 个单元
4. 单元总数控制在 ${suggestedMin}-${suggestedMax} 个
5. 为每个章节和单元起一个概括性名称（不要使用知识点标题）

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "chapters": [
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        { "name": "单元名称（不超过 16 字，概括性命名）" },
        { "name": "单元名称（不超过 16 字，概括性命名）" }
      ]
    }
  ]
}

【重要提醒】：
1. 本步骤只规划章节和单元的层级结构，不涉及具体卡片分配
2. 单元名称使用概括性命名（如"计算机发展与分类"而非"ENIAC"）
3. 返回的 JSON 中不要包含 cardIndices 字段`;

  const result = await callSparkLite(prompt, 2000, 0.3);
  return parseJsonResponse(result);
}

// ============================================================
// 核心功能：卡片分配 (模仿 assignCards)
// ============================================================
async function assignCards(cards, structure) {
  const kpLines = cards.map((c, i) => `${i}. ${c.kp}`).join('\n');
  const structureDesc = structure.chapters.map(ch =>
    `章节「${ch.name}」: ${ch.units.map(u => u.name).join('、')}`
  ).join('\n');

  const prompt = `你是考研计算机基础分类专家。请将以下卡片分配到已规划好的章节/单元结构中。

【已规划结构】：
${structureDesc}

【待分配卡片】（共 ${cards.length} 张）：
${kpLines}

【分类目的】: 考研计算机基础

【分配规则】（必须严格遵守）：
1. 每张卡片必须属于且仅属于一个单元
2. 根据卡片内容选择最匹配的章节和单元
3. 所有卡片必须分配完毕，不能遗漏
4. 多个相关卡片必须归入同一个单元（例如所有关于"计算机发展历史"的卡片归入"计算机发展与分类"单元）
5. chapter 和 unit 字段必须与已规划结构中的名称完全一致

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "assignments": [
    { "cardIndex": 0, "chapter": "章节名称", "unit": "单元名称" },
    { "cardIndex": 1, "chapter": "章节名称", "unit": "单元名称" }
  ]
}

注意：cardIndex 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个章节的一个单元。chapter 和 unit 必须使用已规划结构中的名称。`;

  const result = await callSparkLite(prompt, 4000, 0.3);
  return parseJsonResponse(result);
}

// ============================================================
// JSON 解析（增强版 - 从 iflytekAi.js 中提取）
// ============================================================
function parseJsonResponse(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    // 尝试对象
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(jsonStr); } catch (_) {
        // 修复常见问题
        let fixed = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        fixed = fixed.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$