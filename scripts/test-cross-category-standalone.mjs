/**
 * 跨分类归类逻辑独立测试脚本（Node.js 可运行）
 * 测试本地模拟分类器和数据打乱功能
 *
 * 运行：node scripts/test-cross-category-standalone.mjs
 */

// ===== 跨分类测试数据集（3 个分类，60 张卡片）=====
const CROSS_CATEGORY_TEST_DATA = [
  // ===== 分类1：计算机基础（20张）=====
  { kp: '世界第一台通用电子数字计算机：1946年美国宾夕法尼亚大学研制的ENIAC，采用电子管元器件', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机发展四代划分：电子管时代、晶体管时代、中小规模集成电路时代、大规模超大规模集成电路时代', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '电子管计算机特点：体积大、功耗高、运算速度慢，仅用于军事科研数值计算', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '晶体管计算机特点：体积缩小、能耗降低、可靠性提升，开始应用于企业数据处理', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '按性能规模计算机分类：巨型机、大型机、小型机、微型机、嵌入式计算机五大类', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机底层唯一识别进制：二进制，数码只有0、1，逢二进一', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '字节定义：计算机最小存储单位，英文Byte，1字节=8位二进制位（bit）', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: 'ASCII码：西文字符标准编码，1个英文字符占用1字节，标准ASCII共128个字符', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '存储单位换算：1KB=1024B、1MB=1024KB、1GB=1024MB、1TB=1024GB', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '完整计算机系统二分结构：硬件系统+软件系统，二者缺一不可协同工作', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '计算机硬件五大逻辑部件：运算器、控制器、存储器、输入设备、输出设备', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: 'CPU组成：运算器+控制器，是计算机核心处理芯片，决定整机运行速度', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '内存分类：RAM随机存取存储器、ROM只读存储器两大类型', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'RAM特点：断电数据全部丢失，读写速度快，俗称运行内存，支持随机读写', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'ROM特点：断电数据永久保留，出厂固化程序，用户无法自行修改写入数据', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '高速缓存Cache：介于CPU与内存之间，缓解CPU和内存速度差，提升运行效率', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '机械硬盘HDD：依靠磁盘转动读写，容量大、价格低、防震差、读写速度慢', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '固态硬盘SSD：闪存颗粒读写，静音防震、开机极速、故障率低，目前主流硬盘', expectedCategory: '计算机基础', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '输入设备定义：向计算机录入数据指令设备，例键盘、鼠标、扫描仪、麦克风', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '输出设备定义：计算机向外展示处理结果设备，例显示器、打印机、音响', expectedCategory: '计算机基础', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },

  // ===== 分类2：操作系统（20张）=====
  { kp: '操作系统定义：管理计算机硬件与软件资源的系统软件', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '操作系统五大功能：进程管理、内存管理、文件管理、设备管理、用户接口', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '常见操作系统：Windows、macOS、Linux、Android、iOS、Unix', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '进程定义：正在运行的程序实例，是操作系统资源分配的基本单位', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '线程定义：进程内的执行单元，是CPU调度的最小单位', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '进程三态模型：就绪态、运行态、阻塞态三态转换', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '虚拟内存：将外存空间虚拟为内存使用，解决物理内存不足问题', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '页面置换算法：FIFO先进先出、LRU最近最少使用、OPT最佳置换', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '文件系统类型：FAT32、NTFS、EXT4、APFS、HFS+等', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '文件与设备管理' },
  { kp: '设备驱动程序：操作系统与硬件设备之间的通信桥梁程序', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '文件与设备管理' },
  { kp: '死锁定义：多个进程因竞争资源而造成的一种僵局', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '死锁四个必要条件：互斥、请求与保持、不剥夺、循环等待', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '银行家算法：避免死锁的经典算法，由Dijkstra提出', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '作业调度：从后备队列中选择作业调入内存，创建进程', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '进程同步：协调多个进程的执行顺序，确保数据一致性', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '信号量机制：用于进程同步和互斥的整型变量', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: 'PV操作：信号量的两种原子操作，P操作等待，V操作释放', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '分段存储管理：将程序按逻辑关系划分为多个段', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '分页存储管理：将内存分为固定大小的页框，程序分为页', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '文件目录结构：单级目录、两级目录、树形目录、图形目录', expectedCategory: '操作系统', expectedChapter: '操作系统基础', expectedUnit: '文件与设备管理' },

  // ===== 分类3：计算机网络（20张）=====
  { kp: '计算机网络定义：将多台独立计算机通过通信线路连接，实现资源共享', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络基础概述' },
  { kp: '网络分类：局域网LAN、城域网MAN、广域网WAN、互联网Internet', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络基础概述' },
  { kp: 'OSI七层模型：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络协议体系' },
  { kp: 'TCP/IP四层模型：网络接口层、网络层、传输层、应用层', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络协议体系' },
  { kp: 'IP地址：IPv4由32位二进制组成，IPv6由128位组成', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: 'TCP协议：面向连接的可靠传输协议，三次握手建立连接', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '传输层协议' },
  { kp: 'UDP协议：无连接的不可靠传输协议，速度快适用于实时应用', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '传输层协议' },
  { kp: 'HTTP协议：超文本传输协议，默认端口80，万维网核心协议', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '应用层协议' },
  { kp: 'DNS域名系统：将人类可读的域名解析为IP地址', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: '路由器与交换机：路由器工作在网络层，交换机工作在数据链路层', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络设备与安全' },
  { kp: 'HTTPS协议：HTTP over SSL/TLS，默认端口443，加密传输', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '应用层协议' },
  { kp: 'FTP协议：文件传输协议，用于在网络上进行文件传输', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '应用层协议' },
  { kp: 'SMTP协议：简单邮件传输协议，用于发送电子邮件', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '应用层协议' },
  { kp: '子网掩码：用于划分网络号和主机号，与IP地址按位与运算', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: '默认网关：跨网段通信时数据包发送的下一跳地址', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: 'MAC地址：网卡物理地址，48位二进制，全球唯一', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络设备与安全' },
  { kp: 'ARP协议：地址解析协议，将IP地址解析为MAC地址', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: 'ICMP协议：互联网控制报文协议，用于网络诊断（ping）', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络协议体系' },
  { kp: 'VLAN虚拟局域网：通过逻辑划分网络，提高网络安全性和管理性', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络设备与安全' },
  { kp: '防火墙技术：隔离内部网络与外部网络的安全系统', expectedCategory: '计算机网络', expectedChapter: '计算机网络', expectedUnit: '网络设备与安全' },
]

// ===== 本地关键词分类器 =====
const CATEGORY_KEYWORDS = {
  '计算机基础': ['ENIAC', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型计算机', '嵌入式', '二进制', '八进制', '十六进制', '进制', '字节', 'Byte', 'ASCII', 'GB2312', '存储单位', 'KB', 'MB', '硬件系统', '软件系统', '运算器', '控制器', '存储器', '输入设备', '输出设备', 'CPU', '裸机', 'RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘'],
  '操作系统': ['操作系统', 'Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Unix', '系统软件', '进程', '线程', '就绪态', '运行态', '阻塞态', '虚拟内存', '页面置换', 'FIFO', 'LRU', 'OPT', '文件系统', 'FAT32', 'NTFS', 'EXT4', 'APFS', 'HFS+', '设备驱动', '驱动程序', '死锁', '银行家算法', '作业调度', '进程同步', '信号量', 'PV操作', '分段', '分页', '目录结构'],
  '计算机网络': ['计算机网络', '局域网', 'LAN', '城域网', 'MAN', '广域网', 'WAN', '互联网', 'Internet', 'OSI', '七层模型', 'TCP/IP', '四层模型', '网络层', '传输层', '数据链路层', '物理层', '应用层', 'IP地址', 'IPv4', 'IPv6', 'TCP协议', 'UDP协议', '三次握手', 'HTTP', 'HTTPS', 'DNS', '域名系统', '路由器', '交换机', 'FTP', 'SMTP', '子网掩码', '默认网关', 'MAC地址', 'ARP', 'ICMP', 'VLAN', '防火墙'],
}

const CHAPTER_KEYWORDS = {
  '计算机基础概述': ['ENIAC', '电子管', '晶体管', '二进制', '字节', 'ASCII', '硬件系统', '软件系统', '运算器', '控制器', '输入设备', '输出设备'],
  '计算机硬件系统详解': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘'],
  '操作系统基础': ['操作系统', '进程', '线程', '虚拟内存', '页面置换', '文件系统', '设备驱动', '死锁', '信号量', 'PV操作'],
  '计算机网络': ['计算机网络', '局域网', 'OSI', 'TCP/IP', 'IP地址', 'TCP协议', 'UDP协议', 'HTTP', 'DNS', '路由器'],
}

const UNIT_KEYWORDS = {
  '计算机发展与分类': ['ENIAC', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型计算机', '嵌入式'],
  '计算机数制与信息编码': ['二进制', '八进制', '十六进制', '进制', '字节', 'Byte', 'ASCII', 'GB2312', '存储单位', 'KB', 'MB'],
  '计算机系统组成概述': ['硬件系统', '软件系统', '运算器', '控制器', '存储器', '输入设备', '输出设备', 'CPU', '裸机'],
  '内部存储硬件': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘'],
  '操作系统概述': ['操作系统', 'Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Unix', '系统软件'],
  '进程与线程管理': ['进程', '线程', '就绪态', '运行态', '阻塞态', '死锁', '银行家算法', '作业调度', '进程同步', '信号量', 'PV操作'],
  '内存管理': ['虚拟内存', '页面置换', 'FIFO', 'LRU', 'OPT', '分段', '分页'],
  '文件与设备管理': ['文件系统', 'FAT32', 'NTFS', 'EXT4', 'APFS', 'HFS+', '设备驱动', '驱动程序', '目录结构'],
  '网络基础概述': ['计算机网络', '局域网', 'LAN', '城域网', 'MAN', '广域网', 'WAN', '互联网', 'Internet'],
  '网络协议体系': ['OSI', '七层模型', 'TCP/IP', '四层模型', '网络层', '传输层', '数据链路层', '物理层', '应用层', 'ICMP'],
  '网络地址与路由': ['IP地址', 'IPv4', 'IPv6', 'DNS', '域名系统', '子网掩码', '默认网关', 'ARP'],
  '传输层协议': ['TCP协议', 'UDP协议', '三次握手', '面向连接', '无连接', '可靠传输'],
  '应用层协议': ['HTTP', 'HTTPS', 'FTP', 'SMTP', '超文本', '端口', '万维网'],
  '网络设备与安全': ['路由器', '交换机', 'MAC地址', 'VLAN', '防火墙'],
}

function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function calculateKeywordScore(text, keywords, weight) {
  let score = 0
  // 按长度降序排序，先匹配长关键词，避免短关键词作为子串被重复计分
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length)
  // 每次匹配后用等长空格替换，防止子串重复匹配
  let tempText = text
  for (const kw of sortedKeywords) {
    const kwLower = kw.toLowerCase()
    let idx = tempText.indexOf(kwLower)
    while (idx !== -1) {
      score += kw.length * weight
      // 用空格替换已匹配的部分，避免子串重复计分
      tempText = tempText.substring(0, idx) + ' '.repeat(kwLower.length) + tempText.substring(idx + kwLower.length)
      idx = tempText.indexOf(kwLower)
    }
  }
  return score
}

function classifyCardLocal(kp) {
  const text = String(kp || '').toLowerCase()

  const categoryScores = {}
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    categoryScores[category] = calculateKeywordScore(text, CATEGORY_KEYWORDS[category], 2)
  }

  const sortedCategories = Object.entries(categoryScores).sort((a, b) => b[1] - a[1])
  const bestCategory = sortedCategories[0]

  if (!bestCategory || bestCategory[1] === 0) {
    return { category: '未归类', chapter: '未归类', unit: '未归类', score: 0 }
  }

  const chapterScores = {}
  for (const chapter of Object.keys(CHAPTER_KEYWORDS)) {
    chapterScores[chapter] = calculateKeywordScore(text, CHAPTER_KEYWORDS[chapter], 2)
  }

  const sortedChapters = Object.entries(chapterScores).sort((a, b) => b[1] - a[1])
  const bestChapter = sortedChapters[0]

  const unitScores = {}
  for (const unit of Object.keys(UNIT_KEYWORDS)) {
    unitScores[unit] = calculateKeywordScore(text, UNIT_KEYWORDS[unit], 3)
  }

  const sortedUnits = Object.entries(unitScores).sort((a, b) => b[1] - a[1])
  const bestUnit = sortedUnits[0]

  return {
    category: bestCategory[0],
    chapter: bestChapter && bestChapter[1] > 0 ? bestChapter[0] : bestCategory[0],
    unit: bestUnit && bestUnit[1] > 0 ? bestUnit[0] : (bestChapter && bestChapter[1] > 0 ? bestChapter[0] : bestCategory[0]),
    score: bestCategory[1],
  }
}

function isNameMatch(actual, expected) {
  if (!actual || !expected) return false
  const a = String(actual).toLowerCase()
  const e = String(expected).toLowerCase()
  if (a === e) return true
  if (a.includes(e) || e.includes(a)) return true
  const words1 = new Set(a.split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  const words2 = new Set(e.split(/[\s,，。；;：:\-—_·]+/).filter(w => w.length > 1))
  if (words1.size === 0 || words2.size === 0) return false
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  return intersection.size / union.size >= 0.3
}

function localSimulationClassify(cards) {
  const startTime = Date.now()
  const categoryMap = new Map()

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const { category, chapter, unit } = classifyCardLocal(card.knowledge_point || card.kp)

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { name: category, chapters: new Map() })
    }
    const cat = categoryMap.get(category)

    if (!cat.chapters.has(chapter)) {
      cat.chapters.set(chapter, { name: chapter, units: new Map() })
    }
    const ch = cat.chapters.get(chapter)

    if (!ch.units.has(unit)) {
      ch.units.set(unit, { name: unit, cards: [] })
    }
    ch.units.get(unit).cards.push(card)
  }

  const categories = Array.from(categoryMap.values()).map(cat => ({
    name: cat.name,
    chapters: Array.from(cat.chapters.values()).map(ch => ({
      name: ch.name,
      units: Array.from(ch.units.values()),
    })),
  }))

  const duration = Date.now() - startTime
  return { categories, duration }
}

function evaluateResult(result, originalData) {
  const stats = {
    categoryCount: 0,
    chapterCount: 0,
    unitCount: 0,
    assignedCards: 0,
    totalCards: originalData.length,
    correctCategories: 0,
    correctChapters: 0,
    correctUnits: 0,
    duplicateCards: 0,
    missingCards: 0,
    categoryAccuracy: '0.0',
    chapterAccuracy: '0.0',
    unitAccuracy: '0.0',
  }

  if (!result || !result.categories || result.categories.length === 0) {
    return stats
  }

  const expectedMap = new Map()
  for (let i = 0; i < originalData.length; i++) {
    expectedMap.set(i, {
      expectedCategory: originalData[i].expectedCategory,
      expectedChapter: originalData[i].expectedChapter,
      expectedUnit: originalData[i].expectedUnit,
    })
  }

  const seenCards = new Set()
  stats.categoryCount = result.categories.length

  for (const cat of result.categories) {
    stats.chapterCount += (cat.chapters || []).length
    for (const ch of cat.chapters || []) {
      stats.unitCount += (ch.units || []).length
      for (const u of ch.units || []) {
        for (const card of u.cards || []) {
          const cardIdx = card._testIdx
          if (cardIdx !== undefined) {
            if (seenCards.has(cardIdx)) {
              stats.duplicateCards++
            } else {
              seenCards.add(cardIdx)
              stats.assignedCards++

              const expected = expectedMap.get(cardIdx)
              if (expected) {
                if (isNameMatch(cat.name, expected.expectedCategory)) {
                  stats.correctCategories++
                }
                if (isNameMatch(ch.name, expected.expectedChapter)) {
                  stats.correctChapters++
                }
                if (isNameMatch(u.name, expected.expectedUnit)) {
                  stats.correctUnits++
                }
              }
            }
          }
        }
      }
    }
  }

  stats.missingCards = originalData.length - stats.assignedCards

  if (stats.assignedCards > 0) {
    stats.categoryAccuracy = ((stats.correctCategories / stats.assignedCards) * 100).toFixed(1)
    stats.chapterAccuracy = ((stats.correctChapters / stats.assignedCards) * 100).toFixed(1)
    stats.unitAccuracy = ((stats.correctUnits / stats.assignedCards) * 100).toFixed(1)
  }

  return stats
}

// ===== 主测试流程 =====
function runTests() {
  const sep = '='.repeat(70)
  console.log('\n' + sep)
  console.log('  跨分类归类逻辑独立测试')
  console.log(sep)
  console.log('  测试数据：60 张卡片，3 个分类（计算机基础/操作系统/计算机网络）')
  console.log('  测试模式：本地模拟（关键词分类器）+ 数据打乱')
  console.log(sep)

  let passed = 0
  let total = 0

  // ---- 测试 1：基础分类测试（不打乱）----
  console.log('\n[测试 1] 基础分类测试（不打乱）')
  total++
  const cards1 = CROSS_CATEGORY_TEST_DATA.map((d, i) => ({ ...d, _testIdx: i }))
  const result1 = localSimulationClassify(cards1)
  const stats1 = evaluateResult(result1, CROSS_CATEGORY_TEST_DATA)
  console.log('  - 分类数:', stats1.categoryCount, '(期望 3)')
  console.log('  - 章节数:', stats1.chapterCount)
  console.log('  - 单元数:', stats1.unitCount)
  console.log('  - 已分配:', stats1.assignedCards + '/' + stats1.totalCards)
  console.log('  - 缺失:', stats1.missingCards, '  重复:', stats1.duplicateCards)
  console.log('  - 分类准确率:', stats1.categoryAccuracy + '%')
  console.log('  - 章节准确率:', stats1.chapterAccuracy + '%')
  console.log('  - 单元准确率:', stats1.unitAccuracy + '%')
  if (stats1.missingCards === 0 && stats1.duplicateCards === 0 &&
      parseFloat(stats1.categoryAccuracy) >= 90 && parseFloat(stats1.unitAccuracy) >= 80) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 2：打乱后分类测试 ----
  console.log('\n[测试 2] 打乱后分类测试')
  total++
  const shuffled = shuffleArray(CROSS_CATEGORY_TEST_DATA)
  const cards2 = shuffled.map((d, i) => ({ ...d, _testIdx: CROSS_CATEGORY_TEST_DATA.indexOf(d) }))
  const result2 = localSimulationClassify(cards2)
  const stats2 = evaluateResult(result2, CROSS_CATEGORY_TEST_DATA)
  console.log('  - 分类数:', stats2.categoryCount, '(期望 3)')
  console.log('  - 已分配:', stats2.assignedCards + '/' + stats2.totalCards)
  console.log('  - 缺失:', stats2.missingCards, '  重复:', stats2.duplicateCards)
  console.log('  - 分类准确率:', stats2.categoryAccuracy + '%')
  console.log('  - 单元准确率:', stats2.unitAccuracy + '%')
  if (stats2.missingCards === 0 && stats2.duplicateCards === 0 &&
      parseFloat(stats2.categoryAccuracy) >= 90 && parseFloat(stats2.unitAccuracy) >= 80) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 3：多次打乱稳定性测试 ----
  console.log('\n[测试 3] 多次打乱稳定性测试（5轮）')
  total++
  let stableOk = true
  const accuracyResults = []
  for (let round = 0; round < 5; round++) {
    const shuffledRound = shuffleArray(CROSS_CATEGORY_TEST_DATA)
    const cardsRound = shuffledRound.map((d, i) => ({ ...d, _testIdx: CROSS_CATEGORY_TEST_DATA.indexOf(d) }))
    const resultRound = localSimulationClassify(cardsRound)
    const statsRound = evaluateResult(resultRound, CROSS_CATEGORY_TEST_DATA)
    accuracyResults.push(parseFloat(statsRound.unitAccuracy))
    console.log(`  - 轮次 ${round + 1}: 分类准确率 ${statsRound.categoryAccuracy}% / 单元准确率 ${statsRound.unitAccuracy}% / 缺失 ${statsRound.missingCards}`)
    if (statsRound.missingCards > 0 || statsRound.duplicateCards > 0) {
      stableOk = false
    }
  }
  const avgAcc = (accuracyResults.reduce((a, b) => a + b, 0) / accuracyResults.length).toFixed(1)
  console.log(`  - 平均单元准确率: ${avgAcc}%`)
  if (stableOk && parseFloat(avgAcc) >= 80) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 4：关联检测测试 ----
  console.log('\n[测试 4] 关联检测测试（验证卡片与分类的关联）')
  total++
  let associationOk = true
  // 测试每张卡片的分类是否正确
  let correctCount = 0
  for (let i = 0; i < CROSS_CATEGORY_TEST_DATA.length; i++) {
    const card = CROSS_CATEGORY_TEST_DATA[i]
    const { category } = classifyCardLocal(card.kp)
    if (isNameMatch(category, card.expectedCategory)) {
      correctCount++
    } else {
      console.log(`  [错误] 卡片 ${i}: 期望 "${card.expectedCategory}", 实际 "${category}"`)
      console.log(`         内容: ${card.kp.slice(0, 50)}...`)
      associationOk = false
    }
  }
  console.log(`  - 关联检测正确率: ${correctCount}/${CROSS_CATEGORY_TEST_DATA.length} (${(correctCount / CROSS_CATEGORY_TEST_DATA.length * 100).toFixed(1)}%)`)
  if (associationOk && correctCount >= CROSS_CATEGORY_TEST_DATA.length * 0.9) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 5：无关联卡片处理 ----
  console.log('\n[测试 5] 无关联卡片处理测试')
  total++
  const unrelatedCards = [
    { kp: '今天天气真不错，我们去公园散步吧', expectedCategory: '未归类', _testIdx: -1 },
    { kp: '这是一本关于中国历史的书，讲述了唐朝的兴衰', expectedCategory: '未归类', _testIdx: -2 },
    { kp: '足球比赛规则：每队11人，比赛时间90分钟', expectedCategory: '未归类', _testIdx: -3 },
  ]
  const unrelatedResult = localSimulationClassify(unrelatedCards)
  console.log('  - 无关联卡片分类数:', unrelatedResult.categories.length)
  console.log('  - 分类名称:', unrelatedResult.categories.map(c => c.name).join(', '))
  // 无关联卡片应该被归入"未归类"或单独的分类
  const hasUnrelated = unrelatedResult.categories.some(c =>
    c.name === '未归类' || !CROSS_CATEGORY_TEST_DATA.some(d => d.expectedCategory === c.name)
  )
  if (hasUnrelated && unrelatedResult.categories.length > 0) {
    passed++
    console.log('  [PASS] 无关联卡片被正确处理')
  } else {
    console.log('  [FAIL] 无关联卡片处理异常')
  }

  // ---- 汇总 ----
  console.log('\n' + sep)
  console.log('  测试结果汇总：通过', passed, '/', total)
  console.log('  状态：', passed === total ? '✅ 全部通过' : '❌ 需要改进')
  console.log(sep)
  console.log('')

  return { passed, total }
}

// 运行测试
runTests()
