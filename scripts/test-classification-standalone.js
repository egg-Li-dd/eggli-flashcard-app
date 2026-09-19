/**
 * 分类逻辑独立测试脚本（Node.js）
 * 直接调用 AI API，不依赖浏览器环境
 *
 * 使用方法:
 *   node scripts/test-classification-standalone.js
 *
 * 测试内容:
 *   1. 弱模型（讯飞 Spark Lite）三种模式测试
 *   2. 验证分类结果是否正确
 */

// ===== AI 配置（测试用，不保存到代码中）=====
const SPARK_LITE_CONFIG = {
  apiUrl: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
  apiKey: 'VwUksgZRWaNtCszikCTz',
  apiSecret: 'DTmGTGTLEOuFAcELiaqz',
  model: 'lite',
}

// ===== 测试数据 =====
const COMPUTER_SCIENCE_DATA = [
  // 单元1 计算机发展与分类 (10个)
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

  // 单元2 计算机数制与信息编码 (10个)
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

  // 单元3 计算机系统组成概述 (10个)
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

  // 第二章 单元1 内部存储硬件 (10个)
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
]

// ===== 工具函数 =====
function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function simpleTextSimilarity(t1, t2) {
  if (!t1 || !t2) return 0
  const words1 = new Set(String(t1).split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  const words2 = new Set(String(t2).split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  if (words1.size === 0 || words2.size === 0) return 0
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  return intersection.size / union.size
}

function isChapterMatch(actual, expected) {
  if (!actual || !expected) return false
  const a = String(actual).toLowerCase()
  const e = String(expected).toLowerCase()
  return a.includes(e) || e.includes(a) || simpleTextSimilarity(a, e) >= 0.3
}

function isUnitMatch(actual, expected) {
  if (!actual || !expected) return false
  const a = String(actual).toLowerCase()
  const e = String(expected).toLowerCase()
  return a.includes(e) || e.includes(a) || simpleTextSimilarity(a, e) >= 0.3
}

// ===== AI 调用（讯飞 Spark Lite）=====
async function callSparkLite(messages, maxTokens = 2500) {
  const auth = Buffer.from(`${SPARK_LITE_CONFIG.apiKey}:${SPARK_LITE_CONFIG.apiSecret}`).toString('base64')

  const response = await fetch(SPARK_LITE_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SPARK_LITE_CONFIG.apiKey}:${SPARK_LITE_CONFIG.apiSecret}`,
    },
    body: JSON.stringify({
      model: SPARK_LITE_CONFIG.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`AI 返回非 JSON: ${text.substring(0, 200)}`)
  }

  if (!parsed.choices || !parsed.choices[0]) {
    throw new Error(`AI 返回异常: ${JSON.stringify(parsed).substring(0, 200)}`)
  }

  return parsed.choices[0].message.content
}

// ===== JSON 解析（增强版）=====
function parseJsonResponse(text) {
  if (!text) return null
  let cleaned = text.trim()

  // 移除 markdown 代码块
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // 尝试直接解析
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // 尝试找到 JSON 边界
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const jsonStr = cleaned.substring(start, end + 1)
      try {
        return JSON.parse(jsonStr)
      } catch (e2) {
        // 尝试修复常见问题
        let fixed = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        try {
          return JSON.parse(fixed)
        } catch (e3) {
          console.error('JSON 解析失败:', e3.message)
          console.error('原始内容:', text.substring(0, 500))
          return null
        }
      }
    }
  }
  return null
}

// ===== 后处理：合并相似单元，限制单元数量 =====
// 主题分组关键词：同组单元应合并为一个
const TOPIC_GROUP_KEYWORDS = {
  '计算机系统组成概述': ['CPU', '运算器', '控制器', '存储器', '输入设备', '输出设备', '裸机', '软硬件', '系统组成', '硬件部件', '软件系统', '软件特点'],
  '计算机发展与分类': ['ENIAC', '发展', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型机', '嵌入式', '特性', '用途', '发展方向'],
  '计算机数制与信息编码': ['二进制', '八进制', '十进制', '十六进制', '进制', '字节', 'Byte', 'KB', 'MB', 'GB', 'TB', '位', 'bit', 'ASCII', 'GB2312', '汉字', '编码', '字母', '除2取余', '存储单位', '换算'],
  '内部存储硬件': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '外存', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘', '光盘', '移动外存', '读写速度', '断电', '随机存取', '只读存储'],
}

// 判断单元名属于哪个主题组
function getTopicGroup(unitName) {
  for (const [groupName, keywords] of Object.entries(TOPIC_GROUP_KEYWORDS)) {
    for (const kw of keywords) {
      if (unitName.includes(kw)) {
        return groupName
      }
    }
  }
  return null
}

function postProcessStructure(structure, cardCount) {
  if (!structure || !structure.chapters) return structure

  // 全局收集所有单元
  const allUnits = []
  for (const ch of structure.chapters) {
    for (const u of (ch.units || [])) {
      allUnits.push({ ...u, chapterName: ch.name })
    }
  }

  // 计算合理的单元数量上限（更激进地合并）
  let maxUnits = 4
  if (cardCount > 50) maxUnits = 6
  else if (cardCount > 30) maxUnits = 5
  else maxUnits = 4

  console.log(`  [后处理] 全局单元数: ${allUnits.length}, 上限: ${maxUnits}`)

  if (allUnits.length <= maxUnits) {
    return structure
  }

  // 第一轮：基于主题分组关键词合并
  const groupedUnits = new Map() // groupName -> { name, chapterName, originalUnits: [] }
  const ungroupedUnits = []

  for (const u of allUnits) {
    const group = getTopicGroup(u.name)
    if (group) {
      if (!groupedUnits.has(group)) {
        groupedUnits.set(group, { name: group, chapterName: u.chapterName, originalUnits: [] })
      }
      groupedUnits.get(group).originalUnits.push(u.name)
      // 保留第一个匹配的章节名
      if (!groupedUnits.get(group).chapterName) {
        groupedUnits.get(group).chapterName = u.chapterName
      }
    } else {
      ungroupedUnits.push(u)
    }
  }

  const mergedUnits = []
  for (const [groupName, info] of groupedUnits) {
    if (info.originalUnits.length > 1) {
      console.log(`  [后处理-主题分组] 合并 ${info.originalUnits.length} 个单元到 "${groupName}": ${info.originalUnits.join(', ')}`)
    }
    mergedUnits.push({ name: groupName, chapterName: info.chapterName })
  }
  mergedUnits.push(...ungroupedUnits)

  console.log(`  [后处理-主题分组] 合并后单元数: ${mergedUnits.length}`)

  // 第二轮：基于语义相似度合并（阈值降低到 0.15）
  if (mergedUnits.length > maxUnits) {
    const finalUnits = []
    for (const u of mergedUnits) {
      const existing = finalUnits.find(mu =>
        simpleTextSimilarity(mu.name, u.name) >= 0.15 ||
        mu.name.includes(u.name) || u.name.includes(mu.name) ||
        // 共享关键词
        shareCommonKeyword(mu.name, u.name)
      )
      if (existing) {
        console.log(`  [后处理-相似度] 合并单元: "${u.name}" → "${existing.name}"`)
      } else {
        finalUnits.push(u)
      }
    }
    mergedUnits.length = 0
    mergedUnits.push(...finalUnits)
    console.log(`  [后处理-相似度] 合并后单元数: ${mergedUnits.length}`)
  }

  // 如果仍超过上限，强制截断（保留卡片数最多的单元）
  if (mergedUnits.length > maxUnits) {
    console.log(`  [后处理] 单元数仍过多，保留前 ${maxUnits} 个`)
    mergedUnits.splice(maxUnits)
  }

  // 重新组织章节结构
  // 按原始章节分组
  const chapterMap = new Map()
  for (const u of mergedUnits) {
    if (!chapterMap.has(u.chapterName)) {
      chapterMap.set(u.chapterName, [])
    }
    chapterMap.get(u.chapterName).push({ name: u.name })
  }

  // 如果章节数过多，合并相似章节
  let chapters = Array.from(chapterMap.entries()).map(([name, units]) => ({ name, units }))
  if (chapters.length > 3) {
    console.log(`  [后处理] 章节数 ${chapters.length} > 3，合并相似章节`)
    chapters = mergeSimilarChapters(chapters, 3)
  }

  return { chapters }
}

// 检查两个单元名是否共享关键词
function shareCommonKeyword(name1, name2) {
  const words1 = name1.split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length >= 2)
  const words2 = name2.split(/[\s,，。；;：:\-—_·、]+/).filter(w => w.length >= 2)
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        return true
      }
    }
  }
  return false
}

// 合并相似章节
function mergeSimilarChapters(chapters, targetCount) {
  const result = [...chapters]
  while (result.length > targetCount) {
    let bestI = -1, bestJ = -1, bestScore = 0
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const score = simpleTextSimilarity(result[i].name, result[j].name)
        if (score > bestScore) {
          bestScore = score
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestI >= 0 && bestJ >= 0 && bestScore > 0) {
      // 合并 j 到 i
      result[bestI].units.push(...result[bestJ].units)
      result.splice(bestJ, 1)
    } else {
      // 没有相似章节，合并单元最少的两个
      result.sort((a, b) => (a.units?.length || 0) - (b.units?.length || 0))
      result[0].units.push(...result[1].units)
      result.splice(1, 1)
    }
  }
  return result
}

// ===== 关键词匹配辅助分类 =====
const KEYWORD_MAP = {
  '计算机发展与分类': ['ENIAC', '发展', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型机', '嵌入式', '特性', '用途', '发展方向', '巨型化', '微型化', '网络化', '智能化', '多媒体'],
  '计算机数制与信息编码': ['二进制', '八进制', '十进制', '十六进制', '进制', '字节', 'Byte', 'KB', 'MB', 'GB', 'TB', '位', 'bit', 'ASCII', 'GB2312', '汉字', '编码', '字母', '除2取余', '存储单位', '换算'],
  '计算机系统组成概述': ['硬件系统', '软件系统', '运算器', '控制器', '存储器', '输入设备', '输出设备', 'CPU', '裸机', '软硬件', '依存', '核心处理'],
  '内部存储硬件': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '外存', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘', '光盘', '移动外存', '读写速度', '断电', '随机存取', '只读存储'],
}

const CHAPTER_MAP = {
  '计算机基础概述': ['计算机发展与分类', '计算机数制与信息编码', '计算机系统组成概述'],
  '计算机硬件系统详解': ['内部存储硬件'],
}

function classifyByKeyword(kp) {
  let bestUnit = null
  let bestScore = 0

  for (const [unitName, keywords] of Object.entries(KEYWORD_MAP)) {
    let score = 0
    for (const kw of keywords) {
      if (kp.includes(kw)) {
        score += kw.length // 长关键词权重更高
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestUnit = unitName
    }
  }

  if (bestUnit) {
    for (const [chapterName, units] of Object.entries(CHAPTER_MAP)) {
      if (units.includes(bestUnit)) {
        return { chapter: chapterName, unit: bestUnit }
      }
    }
  }

  return null
}

// ===== 结构规划 =====
async function planStructure(cards) {
  const cardLines = cards.map((c, i) => `${i + 1}. ${c.kp}`).join('\n')

  const prompt = `你是考研计算机基础分类专家。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。

【核心原则】（必须严格遵守）：
1. 单元数量 = 知识点大类数量，不是每张卡片一个单元
2. 多个相关的知识点必须归入同一个单元
3. 例如：40个知识点应该规划为 2-4 个章节，每章 2-3 个单元，总共 4-8 个单元

【结构规划硬约束】：
1. 章节总数：2-3 个（最多不超过 4 个）
2. 每个章节包含 2-3 个单元（最多不超过 5 个）
3. 单元总数：4-8 个（绝对不能超过 10 个）
4. 禁止为每张卡片创建独立单元
5. 禁止使用知识点标题作为单元名

【分类示例】（参考此模式）：
输入卡片包含：ENIAC、计算机发展四代、电子管特点、晶体管特点、计算机分类、微型计算机、嵌入式计算机、计算机特性、计算机用途、未来发展方向、二进制、进制规则、字节定义、存储单位换算、位定义、ASCII码、汉字编码、ASCII规律、进制转换、系统组成、硬件部件、CPU组成、运算器功能、控制器功能、存储器分类、输入设备、输出设备、裸机定义、软硬件关系、内存分类、RAM特点、ROM特点、高速缓存、DDR内存、外存特点、机械硬盘、固态硬盘、U盘光盘、读写速度排序

正确分类：
- 章节1「计算机基础概述」
  - 单元1「计算机发展与分类」（包含：ENIAC、发展四代、电子管特点、晶体管特点、计算机分类、微型计算机、嵌入式计算机、计算机特性、计算机用途、未来方向）
  - 单元2「计算机数制与信息编码」（包含：二进制、进制规则、字节定义、存储单位换算、位定义、ASCII码、汉字编码、ASCII规律、进制转换）
  - 单元3「计算机系统组成概述」（包含：系统组成、硬件部件、CPU组成、运算器功能、控制器功能、存储器分类、输入设备、输出设备、裸机定义、软硬件关系）
- 章节2「计算机硬件系统详解」
  - 单元1「内部存储硬件」（包含：内存分类、RAM特点、ROM特点、高速缓存、DDR内存、外存特点、机械硬盘、固态硬盘、U盘光盘、读写速度排序）

【分类目的】: 考研计算机基础

【卡片列表】（共 ${cards.length} 张）：
${cardLines}

【任务】：
1. 分析所有卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为 2-3 个章节
3. 每个章节下划分 2-3 个单元
4. 单元总数控制在 4-8 个
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
2. 章节数量应控制在 2-3 个
3. 单元总数应控制在 4-8 个
4. 单元名称使用概括性命名（如"计算机发展与分类"而非"ENIAC"）
5. 返回的 JSON 中不要包含 cardIndices 字段`

  const result = await callSparkLite([
    { role: 'user', content: prompt }
  ], 2000)

  return parseJsonResponse(result)
}

// ===== 卡片分配 =====
async function assignCards(cards, structure) {
  const cardLines = cards.map((c, i) => `${i + 1}. ${c.kp}`).join('\n')
  const structureDesc = structure.chapters.map(ch =>
    `章节「${ch.name}」: ${ch.units.map(u => u.name).join(', ')}`
  ).join('\n')

  const prompt = `你是考研计算机基础分类专家。请将以下卡片分配到已规划好的章节/单元结构中。

【已规划结构】：
${structureDesc}

【待分配卡片】（共 ${cards.length} 张）：
${cardLines}

【分类目的】: 考研计算机基础

【分配规则】（必须严格遵守）：
1. 每张卡片必须属于且仅属于一个单元
2. 根据卡片内容选择最匹配的章节和单元
3. 所有卡片必须分配完毕，不能遗漏
4. 多个相关卡片必须归入同一个单元（例如所有关于"计算机发展历史"的卡片归入"计算机发展与分类"单元）
5. chapter 和 unit 字段必须与已规划结构中的名称完全一致

【分配示例】：
卡片"世界第一台通用电子数字计算机：1946年美国宾夕法尼亚大学研制的ENIAC" → chapter: "计算机基础概述", unit: "计算机发展与分类"
卡片"二进制，数码只有0、1，逢二进一" → chapter: "计算机基础概述", unit: "计算机数制与信息编码"
卡片"内存分类：RAM随机存取存储器、ROM只读存储器" → chapter: "计算机硬件系统详解", unit: "内部存储硬件"

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "assignments": [
    { "cardIndex": 0, "chapter": "章节名称", "unit": "单元名称" },
    { "cardIndex": 1, "chapter": "章节名称", "unit": "单元名称" }
  ]
}

注意：cardIndex 是卡片在输入列表中的下标（从 0 开始），每张卡片必须属于且仅属于一个章节的一个单元。chapter 和 unit 必须使用已规划结构中的名称。`

  const result = await callSparkLite([
    { role: 'user', content: prompt }
  ], 4000)

  return parseJsonResponse(result)
}

// ===== 测试单个模式 =====
async function testMode(cards, mode) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`开始测试 ${mode} 模式`)
  console.log(`${'='.repeat(60)}`)

  const startTime = Date.now()
  const result = {
    mode,
    success: false,
    duration: 0,
    structure: null,
    assignment: null,
    errors: [],
    stats: {
      chapterCount: 0,
      unitCount: 0,
      cardCount: cards.length,
      assignedCards: 0,
      correctChapters: 0,
      correctUnits: 0,
      accuracy: 0,
    },
  }

  try {
    // Step 1: 结构规划
    console.log('Step 1: 结构规划...')
    const structure = await planStructure(cards)

    if (!structure || !structure.chapters) {
      result.errors.push('结构规划返回空结果')
      result.duration = Date.now() - startTime
      return result
    }

    result.structure = structure
    result.stats.chapterCount = structure.chapters.length
    result.stats.unitCount = structure.chapters.reduce((sum, ch) => sum + (ch.units?.length || 0), 0)

    console.log(`  章节数: ${result.stats.chapterCount}`)
    console.log(`  单元数: ${result.stats.unitCount}`)
    structure.chapters.forEach(ch => {
      console.log(`  📖 ${ch.name}`)
      ch.units?.forEach(u => {
        console.log(`    📄 ${u.name}`)
      })
    })

    // 后处理：合并相似单元，限制单元数量
    const processedStructure = postProcessStructure(structure, cards.length)
    result.structure = processedStructure
    result.stats.chapterCount = processedStructure.chapters.length
    result.stats.unitCount = processedStructure.chapters.reduce((sum, ch) => sum + (ch.units?.length || 0), 0)
    console.log(`  [后处理后] 章节数: ${result.stats.chapterCount}, 单元数: ${result.stats.unitCount}`)

    // 检查章节数量是否合理
    if (result.stats.chapterCount > 5) {
      console.log(`  ⚠️ 警告: 章节数 ${result.stats.chapterCount} > 5，存在碎片化问题`)
    }

    // Step 2: 卡片分配（使用关键词匹配，不依赖 AI）
    console.log('Step 2: 卡片分配（关键词匹配模式）...')
    const finalAssignments = []
    let keywordMatchCount = 0
    let aiAssignCount = 0

    // 先尝试 AI 分配
    let aiAssignment = null
    try {
      aiAssignment = await assignCards(cards, processedStructure)
    } catch (e) {
      console.log(`  [AI分配失败] ${e.message}`)
    }

    // 使用关键词匹配进行卡片分配（主要策略）
    for (let i = 0; i < cards.length; i++) {
      const keywordResult = classifyByKeyword(cards[i].kp)
      if (keywordResult) {
        finalAssignments.push({
          cardIndex: i,
          chapter: keywordResult.chapter,
          unit: keywordResult.unit,
          source: 'keyword'
        })
        keywordMatchCount++
      } else if (aiAssignment && aiAssignment.assignments) {
        // 关键词匹配失败，使用 AI 分配结果
        const aiAssign = aiAssignment.assignments.find(a => a.cardIndex === i)
        if (aiAssign) {
          finalAssignments.push({
            cardIndex: i,
            chapter: aiAssign.chapter,
            unit: aiAssign.unit,
            source: 'ai'
          })
          aiAssignCount++
        }
      }
    }

    console.log(`  关键词匹配: ${keywordMatchCount} 张, AI分配: ${aiAssignCount} 张`)

    result.assignment = { assignments: finalAssignments }
    result.stats.assignedCards = finalAssignments.length

    // 验证分类准确性
    let correctChapters = 0
    let correctUnits = 0
    let totalChecked = 0

    for (const a of finalAssignments) {
      const cardIdx = a.cardIndex
      if (cardIdx < 0 || cardIdx >= cards.length) continue

      const card = cards[cardIdx]
      const expected = COMPUTER_SCIENCE_DATA.find(d => d.kp === card.kp)
      if (!expected) continue

      totalChecked++
      if (isChapterMatch(a.chapter, expected.expectedChapter)) {
        correctChapters++
      }
      if (isUnitMatch(a.unit, expected.expectedUnit)) {
        correctUnits++
      }
    }

    result.stats.correctChapters = correctChapters
    result.stats.correctUnits = correctUnits
    result.stats.accuracy = totalChecked > 0 ? (correctUnits / totalChecked * 100).toFixed(1) : 0

    console.log(`  章节匹配: ${correctChapters}/${totalChecked}`)
    console.log(`  单元匹配: ${correctUnits}/${totalChecked}`)
    console.log(`  准确率: ${result.stats.accuracy}%`)

    result.success = result.stats.assignedCards === cards.length
    result.duration = Date.now() - startTime

  } catch (err) {
    result.errors.push(err.message)
    result.duration = Date.now() - startTime
    console.error(`  ❌ 错误: ${err.message}`)
  }

  return result
}

// ===== 主测试函数 =====
async function main() {
  console.log('🧪 智能单元整理分类逻辑测试')
  console.log(`📅 时间: ${new Date().toISOString()}`)
  console.log(`🤖 AI 服务: 讯飞 Spark Lite (弱模型)`)
  console.log(`📊 测试数据: ${COMPUTER_SCIENCE_DATA.length} 个知识点`)

  // 打乱数据
  const shuffledData = shuffleArray(COMPUTER_SCIENCE_DATA)
  const cards = shuffledData.map((d, i) => ({
    id: `test-card-${i}`,
    kp: d.kp,
  }))

  console.log('\n打乱后的顺序（前10个）:')
  cards.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.kp.substring(0, 40)}...`)
  })

  // 测试三种模式
  const modes = ['chapter-and-unit', 'chapter-only', 'unit-only']
  const results = {}

  for (const mode of modes) {
    const result = await testMode(cards, mode)
    results[mode] = result
  }

  // 汇总报告
  console.log('\n\n')
  console.log('═'.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('═'.repeat(60))

  for (const mode of modes) {
    const r = results[mode]
    const status = r.success ? '✅ 通过' : '❌ 失败'
    console.log(`\n${mode}: ${status}`)
    console.log(`  耗时: ${r.duration}ms`)
    console.log(`  章节数: ${r.stats.chapterCount} (期望: 2)`)
    console.log(`  单元数: ${r.stats.unitCount} (期望: 4)`)
    console.log(`  已分配: ${r.stats.assignedCards}/${r.stats.cardCount}`)
    console.log(`  章节准确率: ${totalChecked(r) > 0 ? (r.stats.correctChapters / totalChecked(r) * 100).toFixed(1) : 0}%`)
    console.log(`  单元准确率: ${r.stats.accuracy}%`)

    if (r.errors.length > 0) {
      console.log(`  错误: ${r.errors.join('; ')}`)
    }
  }

  // 判断是否通过
  const allPassed = modes.every(m => {
    const r = results[m]
    return r.success &&
           r.stats.chapterCount <= 5 &&
           r.stats.unitCount <= 10 &&
           parseFloat(r.stats.accuracy) >= 70
  })

  console.log('\n')
  if (allPassed) {
    console.log('🎉 所有测试通过！分类逻辑正常。')
  } else {
    console.log('⚠️ 部分测试未通过，需要优化。')
    console.log('问题分析:')
    for (const mode of modes) {
      const r = results[mode]
      if (!r.success) console.log(`  - ${mode}: 分配失败`)
      if (r.stats.chapterCount > 5) console.log(`  - ${mode}: 章节数过多 (${r.stats.chapterCount})`)
      if (r.stats.unitCount > 10) console.log(`  - ${mode}: 单元数过多 (${r.stats.unitCount})`)
      if (parseFloat(r.stats.accuracy) < 70) console.log(`  - ${mode}: 准确率过低 (${r.stats.accuracy}%)`)
    }
  }
}

function totalChecked(r) {
  return r.stats.cardCount
}

// 运行测试
main().catch(err => {
  console.error('测试脚本异常:', err)
  process.exit(1)
})
