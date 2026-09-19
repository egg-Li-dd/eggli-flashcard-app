/**
 * 智能单元整理（same-category-reorganize）测试脚本
 * 直接调用 aiService.js 的 classifyCardsByCategoryContent
 * 测试：1. Spark Lite 拦截；2. 强模型（DeepSeek/Qwen/Spark Pro）分类准确度
 */

import { classifyCardsByCategoryContent } from '../src/services/aiService.js'

// ===== 测试数据：计算机基础（40 张卡片，4 个单元，2 个章节）=====
const COMPUTER_SCIENCE_DATA = [
  // 单元1 计算机发展与分类 (10)
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

  // 单元2 计算机数制与信息编码 (10)
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

  // 单元3 计算机系统组成概述 (10)
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

  // 第二章 单元1 内部存储硬件 (10)
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

function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function dataToCards(data) {
  return data.map((item, index) => ({
    id: `test-card-${index}`,
    knowledge_point: item.kp,
    front: item.kp.slice(0, 50),
    back: item.kp,
    _expected: { unit: item.expectedUnit, chapter: item.expectedChapter, kp: item.kp },
  }))
}

/**
 * 语义相似度：简单基于 关键词包含 / 词覆盖 匹配
 */
function computeUnitMatchScore(actualName, expectedName) {
  if (!actualName || !expectedName) return 0
  const a = String(actualName)
  const e = String(expectedName)
  if (a.includes(e) || e.includes(a)) return 1
  // 提取中文关键词（2 字以上片段）
  const aKeys = new Set(a.match(/[\u4e00-\u9fa5A-Za-z]{2,}/g) || [])
  const eKeys = new Set(e.match(/[\u4e00-\u9fa5A-Za-z]{2,}/g) || [])
  if (aKeys.size === 0 || eKeys.size === 0) return 0
  let intersection = 0
  for (const k of aKeys) if (eKeys.has(k)) intersection++
  // 至少 1 个核心关键词重合 且 比例合理
  const ratio1 = intersection / aKeys.size
  const ratio2 = intersection / eKeys.size
  return Math.max(ratio1, ratio2)
}

/**
 * 评估某个模式下卡片-章节/单元分类准确度
 * classificationDepth: 'unit-only' | 'chapter-only' | 'chapter-and-unit'
 */
function evaluateResult(cards, result, mode) {
  const total = cards.length
  let assigned = 0
  let chapterCorrect = 0
  let unitCorrect = 0

  // 收集所有卡片 -> (章节, 单元) 映射
  const cardToLocation = new Map()
  const chapterNames = []
  const unitNames = []

  if (Array.isArray(result?.chapters)) {
    for (const ch of result.chapters) {
      chapterNames.push(ch.name || '')
      if (Array.isArray(ch?.units)) {
        for (const u of ch.units) {
          unitNames.push(u.name || '')
          for (const card of u.cards || []) {
            cardToLocation.set(card.id || card.knowledge_point || card.front, {
              chapter: ch.name,
              unit: u.name,
            })
          }
        }
      }
      if (Array.isArray(ch?.cards)) {
        for (const card of ch.cards) {
          cardToLocation.set(card.id || card.knowledge_point || card.front, {
            chapter: ch.name,
            unit: null,
          })
        }
      }
    }
  } else if (Array.isArray(result?.units)) {
    for (const u of result.units) {
      unitNames.push(u.name || '')
      for (const card of u.cards || []) {
        cardToLocation.set(card.id || card.knowledge_point || card.front, {
          chapter: null,
          unit: u.name,
        })
      }
    }
  }

  // 评估每一张卡片
  const perCardResults = []
  for (const card of cards) {
    const key = card.id || card.knowledge_point || card.front
    const loc = cardToLocation.get(key)
    const original = COMPUTER_SCIENCE_DATA.find(d => d.kp === card.knowledge_point)
    if (!loc || !loc.unit && !loc.chapter) {
      perCardResults.push({ id: key, expected: original, actual: loc, status: '未分配' })
      continue
    }
    assigned++
    // 单元匹配
    if (original) {
      let unitOk = false
      if (mode === 'chapter-only') {
        unitOk = true
      } else {
        const score = computeUnitMatchScore(loc.unit, original.expectedUnit)
        unitOk = score >= 0.3
        if (!unitOk) {
          // 更宽松：章节相同且若干关键词有重合也认为OK
          const chScore = computeUnitMatchScore(loc.chapter, original.expectedChapter)
          if (chScore >= 0.5) {
            // 只看章节方向
            // 允许部分章节单元名不统一
            // 不直接认为成功，而是降低门限
            // unitOk = score >= 0.15
          }
        }
      }
      let chOk = true
      if (mode !== 'unit-only') {
        chOk = computeUnitMatchScore(loc.chapter, original.expectedChapter) >= 0.3
      }
      if (unitOk) unitCorrect++
      if (chOk) chapterCorrect++
      perCardResults.push({
        id: key,
        expected: original,
        actual: loc,
        chapterOk: chOk,
        unitOk,
      })
    }
  }

  return {
    mode,
    chapterNames,
    unitNames,
    stats: {
      total,
      assigned,
      chapterCorrect,
      unitCorrect,
      chapterAccuracy: total > 0 ? (chapterCorrect / total * 100) : 0,
      unitAccuracy: total > 0 ? (unitCorrect / total * 100) : 0,
      assignmentRate: total > 0 ? (assigned / total * 100) : 0,
    },
    wrongCards: perCardResults.filter(r => r.unitOk === false || r.chapterOk === false),
    unassignedCards: perCardResults.filter(r => r.status === '未分配'),
  }
}

// ===== 主测试 =====
async function main() {
  // 从命令行参数获取模型配置：node test-smart-unit-organize.mjs <mode> <apiKey>
  const args = process.argv.slice(2)
  const serviceMode = args[0] || 'deepseek'
  const apiKey = args[1] || ''
  const modelName = args[2] || ''

  // 弱模型（Spark Lite）拦截测试
  console.log('\n===== 测试1：Spark Lite 拦截 (same-category-reorganize) =====')
  try {
    const sparkConfig = {
      aiServiceMode: 'iflytek-spark',
      model: 'lite',
      sparkApiKey: 'fake-key-for-test',
      sparkApiSecret: 'fake-secret',
    }
    const shuffled = shuffleArray(COMPUTER_SCIENCE_DATA).slice(0, 10)
    const cards = dataToCards(shuffled)
    await classifyCardsByCategoryContent([], [], cards, {
      ...sparkConfig,
      mode: 'same-category-reorganize',
      classificationDepth: 'chapter-and-unit',
      existingChapters: [],
      categoryPurpose: '考研计算机基础',
    })
    console.log('❌ 错误：Spark Lite 未被拦截！')
  } catch (e) {
    if (String(e.message).includes('Spark Lite')) {
      console.log('✅ 通过：Spark Lite 被正确拦截，错误信息：', e.message)
    } else {
      console.log('⚠️ 部分通过（非预期错误）：', e.message)
    }
  }

  // 真实模型测试（需用户输入正确 API Key）
  if (!apiKey) {
    console.log('\n⚠️ 未提供 API Key，跳过真实模型测试。用法：node scripts/test-smart-unit-organize.mjs <deepseek|dashscope|volcano|iflytek-spark> <apiKey> [modelName]')
    return
  }

  const config = {
    aiServiceMode: serviceMode,
    model: modelName || undefined,
    apiKey: serviceMode === 'deepseek' ? apiKey : '',
    sparkApiKey: serviceMode === 'iflytek-spark' ? apiKey : '',
    sparkApiSecret: args[3] || '',
    volcanoApiKey: serviceMode === 'volcano' ? apiKey : '',
    dashscopeApiKey: serviceMode === 'dashscope' ? apiKey : '',
  }

  const shuffled = shuffleArray(COMPUTER_SCIENCE_DATA)
  const cards = dataToCards(shuffled)

  const modes = ['unit-only', 'chapter-only', 'chapter-and-unit']
  const results = {}

  for (const mode of modes) {
    console.log(`\n===== 测试2：真实模型 (${serviceMode}${modelName ? ' ' + modelName : ''}) — ${mode} =====`)
    try {
      const result = await classifyCardsByCategoryContent([], [], cards, {
        ...config,
        mode: 'same-category-reorganize',
        classificationDepth: mode,
        existingChapters: [],
        categoryPurpose: '考研计算机基础',
      })
      const evalResult = evaluateResult(cards, result, mode)
      results[mode] = evalResult
      console.log(`章节：${evalResult.chapterNames.join(' | ')}`)
      console.log(`单元：${evalResult.unitNames.join(' | ')}`)
      console.log(`卡片分配：${evalResult.stats.assigned}/${evalResult.stats.total} (${evalResult.stats.assignmentRate.toFixed(1)}%)`)
      if (mode !== 'unit-only') console.log(`章节准确率：${evalResult.stats.chapterAccuracy.toFixed(1)}%`)
      if (mode !== 'chapter-only') console.log(`单元准确率：${evalResult.stats.unitAccuracy.toFixed(1)}%`)
      if (evalResult.wrongCards.length > 0) {
        console.log(`⚠️ 错误卡片样例（前5个）：`)
        for (const wc of evalResult.wrongCards.slice(0, 5)) {
          console.log(`  - 期望【${wc.expected.expectedChapter}】/【${wc.expected.expectedUnit}】 -> 实际【${wc.actual.chapter}】/【${wc.actual.unit}】`)
        }
      }
    } catch (e) {
      console.log('❌ 失败：', e.message)
      results[mode] = { mode, error: e.message, stats: { total: cards.length, assigned: 0, chapterAccuracy: 0, unitAccuracy: 0 } }
    }
  }

  // 综合评分
  console.log('\n===== 测试汇总 =====')
  for (const mode of modes) {
    const r = results[mode]
    if (r?.stats) {
      const unitAcc = mode !== 'chapter-only' ? `${r.stats.unitAccuracy.toFixed(1)}%` : 'N/A'
      const chAcc = mode !== 'unit-only' ? `${r.stats.chapterAccuracy.toFixed(1)}%` : 'N/A'
      console.log(`${mode}: 分配率 ${r.stats.assignmentRate.toFixed(1)}% / 章节 ${chAcc} / 单元 ${unitAcc}`)
    }
  }
}

main().catch(e => {
  console.error('脚本失败：', e)
  process.exit(1)
})
