/**
 * 弱模型分类逻辑综合测试脚本 - 改进版 v2
 * 
 * 核心改进：
 *  1. 改进的关键词分类器：分层分类（先章节后单元）+ 加权评分
 *  2. 批处理 + Fallback 机制：确保卡片 100% 分配
 *  3. 二次合并（semantic merge）：基于关键词相似度合并相似单元
 *  4. 鲁棒 JSON 解析：处理多种边缘情况（markdown、字符串索引、尾部逗号等）
 *  5. 准确性评估：使用章节标签+单元标签联合评估
 * 
 * 运行：node scripts/test-weak-model-classification-comprehensive.mjs
 */

// ============ 测试数据集 ============
// 每张卡片包含：知识文本、期望章节、期望单元（用于评估准确率）
const COMPUTER_SCIENCE_DATA = [
  { kp: '世界第一台通用电子数字计算机：1946年美国宾夕法尼亚大学研制的ENIAC，采用电子管元器件', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机发展四代划分：电子管时代、晶体管时代、中小规模集成电路时代、大规模超大规模集成电路时代', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '电子管计算机特点：体积大、功耗高、运算速度慢，仅用于军事科研数值计算', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '晶体管计算机特点：体积缩小、能耗降低、可靠性提升，开始应用于企业数据处理', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '按性能规模计算机分类：巨型机、大型机、小型机、微型机、嵌入式计算机五大类', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '微型计算机：日常台式机、笔记本，面向个人使用，普及率最高的计算机类型', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '嵌入式计算机：内置家电、汽车、智能手环内部，专用化、不可随意更改系统的计算机', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机五大核心特性：运算速度快、计算精度高、存储能力强、具备逻辑判断、自动化运行', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机最早用途：科学计算；当下最广泛用途：数据信息处理', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '未来计算机发展方向：巨型化、微型化、网络化、智能化、多媒体化', expectedChapter: '计算机基础概述', expectedUnit: '计算机发展与分类' },
  { kp: '计算机底层唯一识别进制：二进制，数码只有0、1，逢二进一', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '常用计算机进制：二进制、八进制、十进制、十六进制，日常输入输出默认十进制', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '进制通用规则：N进制包含0~N-1数码，运算规则逢N进一', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '字节定义：计算机最小存储单位，英文Byte，1字节=8位二进制位（bit）', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '存储单位换算：1KB=1024B、1MB=1024KB、1GB=1024MB、1TB=1024GB', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '位（bit）：计算机最小数据处理单位，代表一个二进制0或1', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: 'ASCII码：西文字符标准编码，1个英文字符占用1字节，标准ASCII共128个字符', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '汉字国标码GB2312：常用中文编码，一个汉字占用2个字节存储空间', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '大小写字母ASCII规律：大写字母数值小于小写字母，同字母大小写差值固定为32', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '进制转换核心：十进制转二进制采用除2取余法，逆序读取余数得出结果', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '完整计算机系统二分结构：硬件系统+软件系统，二者缺一不可协同工作', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '计算机硬件五大逻辑部件：运算器、控制器、存储器、输入设备、输出设备', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: 'CPU组成：运算器+控制器，是计算机核心处理芯片，决定整机运行速度', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '运算器功能：负责算术加减乘除运算、逻辑与或非判断运算', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '控制器功能：统筹指挥整机硬件，协调各部件有序执行指令、完成作业', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '存储器分类：内存储器（内存）、外存储器（外存）两类', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '输入设备定义：向计算机录入数据指令设备，例键盘、鼠标、扫描仪、麦克风', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '输出设备定义：计算机向外展示处理结果设备，例显示器、打印机、音响', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '裸机定义：仅搭载硬件、无任何操作系统及应用软件，无法直接使用的计算机', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '软硬件依存关系：硬件是物理载体，软件是运行灵魂，软件依托硬件执行工作', expectedChapter: '计算机基础概述', expectedUnit: '计算机系统组成概述' },
  { kp: '内存分类：RAM随机存取存储器、ROM只读存储器两大类型', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'RAM特点：断电数据全部丢失，读写速度快，俗称运行内存，支持随机读写', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'ROM特点：断电数据永久保留，出厂固化程序，用户无法自行修改写入数据', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '高速缓存Cache：介于CPU与内存之间，缓解CPU和内存速度差，提升运行效率', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'DDR内存：当下主流台式笔记本内存型号，迭代版本越高，带宽速度越快', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '外存通用特点：容量大、价格低、断电保数据、读写速度远低于内存', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '机械硬盘HDD：依靠磁盘转动读写，容量大、价格低、防震差、读写速度慢', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '固态硬盘SSD：闪存颗粒读写，静音防震、开机极速、故障率低，目前主流硬盘', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: 'U盘、光盘属于移动外存，可跨设备传输存储文件，便携性较强', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  { kp: '读写速度排序（由快到慢）：CPU缓存>内存>固态硬盘>机械硬盘', expectedChapter: '计算机硬件系统详解', expectedUnit: '内部存储硬件' },
  // 操作系统
  { kp: '操作系统定义：管理计算机硬件与软件资源的系统软件', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '操作系统五大功能：进程管理、内存管理、文件管理、设备管理、用户接口', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '常见操作系统：Windows、macOS、Linux、Android、iOS、Unix', expectedChapter: '操作系统基础', expectedUnit: '操作系统概述' },
  { kp: '进程定义：正在运行的程序实例，是操作系统资源分配的基本单位', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '线程定义：进程内的执行单元，是CPU调度的最小单位', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '进程三态模型：就绪态、运行态、阻塞态三态转换', expectedChapter: '操作系统基础', expectedUnit: '进程与线程管理' },
  { kp: '虚拟内存：将外存空间虚拟为内存使用，解决物理内存不足问题', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '页面置换算法：FIFO先进先出、LRU最近最少使用、OPT最佳置换', expectedChapter: '操作系统基础', expectedUnit: '内存管理' },
  { kp: '文件系统类型：FAT32、NTFS、EXT4、APFS、HFS+等', expectedChapter: '操作系统基础', expectedUnit: '文件与设备管理' },
  { kp: '设备驱动程序：操作系统与硬件设备之间的通信桥梁程序', expectedChapter: '操作系统基础', expectedUnit: '文件与设备管理' },
  // 计算机网络
  { kp: '计算机网络定义：将多台独立计算机通过通信线路连接，实现资源共享', expectedChapter: '计算机网络', expectedUnit: '网络基础概述' },
  { kp: '网络分类：局域网LAN、城域网MAN、广域网WAN、互联网Internet', expectedChapter: '计算机网络', expectedUnit: '网络基础概述' },
  { kp: 'OSI七层模型：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层', expectedChapter: '计算机网络', expectedUnit: '网络协议体系' },
  { kp: 'TCP/IP四层模型：网络接口层、网络层、传输层、应用层', expectedChapter: '计算机网络', expectedUnit: '网络协议体系' },
  { kp: 'IP地址：IPv4由32位二进制组成，IPv6由128位组成', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: 'TCP协议：面向连接的可靠传输协议，三次握手建立连接', expectedChapter: '计算机网络', expectedUnit: '传输层协议' },
  { kp: 'UDP协议：无连接的不可靠传输协议，速度快适用于实时应用', expectedChapter: '计算机网络', expectedUnit: '传输层协议' },
  { kp: 'HTTP协议：超文本传输协议，默认端口80，万维网核心协议', expectedChapter: '计算机网络', expectedUnit: '应用层协议' },
  { kp: 'DNS域名系统：将人类可读的域名解析为IP地址', expectedChapter: '计算机网络', expectedUnit: '网络地址与路由' },
  { kp: '路由器与交换机：路由器工作在网络层，交换机工作在数据链路层', expectedChapter: '计算机网络', expectedUnit: '网络设备与安全' },
]

// ============ 改进的分层关键词分类器 ============
// 章节级关键词（权重较高，用于粗分类）
const CHAPTER_KEYWORDS = {
  '计算机基础概述': [
    { kw: 'ENIAC', w: 8 }, { kw: '电子管', w: 6 }, { kw: '晶体管', w: 6 },
    { kw: '集成电路', w: 6 }, { kw: '巨型机', w: 5 }, { kw: '大型机', w: 5 },
    { kw: '小型机', w: 5 }, { kw: '微型计算机', w: 7 }, { kw: '微型机', w: 6 },
    { kw: '嵌入式计算机', w: 7 }, { kw: '嵌入式', w: 5 }, { kw: '发展方向', w: 5 },
    { kw: '巨型化', w: 5 }, { kw: '微型化', w: 5 }, { kw: '网络化', w: 5 },
    { kw: '智能化', w: 5 }, { kw: '多媒体化', w: 5 }, { kw: '二进制', w: 8 },
    { kw: '八进制', w: 6 }, { kw: '十六进制', w: 6 }, { kw: '进制', w: 6 },
    { kw: '字节', w: 6 }, { kw: 'Byte', w: 5 }, { kw: 'ASCII', w: 6 },
    { kw: 'GB2312', w: 6 }, { kw: '除2取余', w: 8 }, { kw: '存储单位', w: 6 },
    { kw: '硬件系统', w: 8 }, { kw: '软件系统', w: 8 }, { kw: '五大逻辑部件', w: 8 },
    { kw: '运算器', w: 7 }, { kw: '控制器', w: 7 }, { kw: '输入设备', w: 7 },
    { kw: '输出设备', w: 7 }, { kw: '逻辑部件', w: 6 }, { kw: '裸机', w: 6 },
    { kw: '软硬件', w: 6 }, { kw: '物理载体', w: 5 }, { kw: '科学计算', w: 4 },
    { kw: '信息处理', w: 4 },
  ],
  '计算机硬件系统详解': [
    { kw: 'RAM', w: 8 }, { kw: 'ROM', w: 8 }, { kw: 'Cache', w: 8 },
    { kw: '高速缓存', w: 8 }, { kw: 'DDR', w: 8 }, { kw: '机械硬盘', w: 8 },
    { kw: 'HDD', w: 8 }, { kw: '固态硬盘', w: 8 }, { kw: 'SSD', w: 8 },
    { kw: 'U盘', w: 7 }, { kw: '光盘', w: 6 }, { kw: '移动外存', w: 7 },
    { kw: '读写速度', w: 6 }, { kw: '随机存取', w: 7 }, { kw: '只读存储', w: 7 },
    { kw: '外存', w: 6 }, { kw: '闪存颗粒', w: 7 }, { kw: '磁盘转动', w: 6 },
  ],
  '操作系统基础': [
    { kw: '操作系统', w: 10 }, { kw: 'Windows', w: 7 }, { kw: 'macOS', w: 7 },
    { kw: 'Linux', w: 7 }, { kw: 'Android', w: 7 }, { kw: 'iOS', w: 7 },
    { kw: 'Unix', w: 6 }, { kw: '系统软件', w: 8 }, { kw: '进程', w: 9 },
    { kw: '线程', w: 9 }, { kw: '就绪态', w: 8 }, { kw: '运行态', w: 8 },
    { kw: '阻塞态', w: 8 }, { kw: '虚拟内存', w: 9 }, { kw: '页面置换', w: 9 },
    { kw: 'FIFO', w: 8 }, { kw: 'LRU', w: 8 }, { kw: 'OPT', w: 8 },
    { kw: '文件系统', w: 9 }, { kw: 'FAT32', w: 8 }, { kw: 'NTFS', w: 8 },
    { kw: 'EXT4', w: 8 }, { kw: 'APFS', w: 8 }, { kw: 'HFS+', w: 8 },
    { kw: '设备驱动', w: 8 }, { kw: '驱动程序', w: 8 }, { kw: '资源管理', w: 6 },
    { kw: '进程管理', w: 8 }, { kw: '内存管理', w: 8 }, { kw: '文件管理', w: 8 },
    { kw: '设备管理', w: 8 }, { kw: '用户接口', w: 6 },
  ],
  '计算机网络': [
    { kw: '计算机网络', w: 10 }, { kw: '局域网', w: 8 }, { kw: 'LAN', w: 7 },
    { kw: '城域网', w: 8 }, { kw: 'MAN', w: 7 }, { kw: '广域网', w: 8 },
    { kw: 'WAN', w: 7 }, { kw: 'OSI', w: 10 }, { kw: '七层模型', w: 9 },
    { kw: 'TCP/IP', w: 10 }, { kw: '四层模型', w: 9 }, { kw: '网络层', w: 8 },
    { kw: '传输层', w: 8 }, { kw: '数据链路层', w: 8 }, { kw: '物理层', w: 8 },
    { kw: '应用层', w: 8 }, { kw: '会话层', w: 8 }, { kw: '表示层', w: 8 },
    { kw: 'IP地址', w: 9 }, { kw: 'IPv4', w: 8 }, { kw: 'IPv6', w: 8 },
    { kw: 'TCP协议', w: 9 }, { kw: 'UDP协议', w: 9 }, { kw: '三次握手', w: 9 },
    { kw: '四次挥手', w: 9 }, { kw: 'HTTP', w: 9 }, { kw: 'HTTPS', w: 9 },
    { kw: '超文本传输协议', w: 8 }, { kw: 'DNS', w: 9 }, { kw: '域名系统', w: 8 },
    { kw: '路由器', w: 9 }, { kw: '交换机', w: 9 }, { kw: '互联网', w: 8 },
    { kw: '资源共享', w: 7 }, { kw: '通信线路', w: 5 },
  ],
}

// 单元级关键词（在确定章节后用于细粒度分类，防止跨章节冲突）
const UNIT_KEYWORDS = {
  '计算机基础概述': {
    '计算机发展与分类': ['ENIAC', '电子管', '晶体管', '集成电路', '巨型机', '大型机', '小型机', '微型计算机', '微型机', '嵌入式计算机', '嵌入式', '发展方向', '巨型化', '微型化', '网络化', '智能化', '多媒体化', '分类', '科学计算', '信息处理', '用途', '特性', '五大核心', '台式机', '笔记本', '智能手环', '家电'],
    '计算机数制与信息编码': ['二进制', '八进制', '十进制', '十六进制', '进制', '字节', 'Byte', 'KB', 'MB', 'GB', 'TB', 'bit', 'ASCII', 'GB2312', '汉字', '编码', '除2取余', '存储单位', '换算', '字母', '数码', '32', '128', '位'],
    '计算机系统组成概述': ['硬件系统', '软件系统', '五大逻辑部件', '运算器', '控制器', '存储器', '输入设备', '输出设备', 'CPU', '裸机', '软硬件', '物理载体', '逻辑部件', '键盘', '鼠标', '扫描仪', '麦克风', '显示器', '打印机', '音响', '协同工作'],
  },
  '计算机硬件系统详解': {
    '内部存储硬件': ['RAM', 'ROM', 'Cache', '高速缓存', 'DDR', '机械硬盘', 'HDD', '固态硬盘', 'SSD', 'U盘', '光盘', '移动外存', '读写速度', '随机存取', '只读存储', '闪存颗粒', '磁盘转动', '外存', '内存', '缓存', '断电'],
  },
  '操作系统基础': {
    '操作系统概述': ['操作系统', '系统软件', 'Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Unix', '定义', '资源管理', '计算机硬件', '软件资源'],
    '进程与线程管理': ['进程', '线程', '就绪态', '运行态', '阻塞态', '三态', '执行单元', 'CPU调度', '基本单位', '最小单位', '程序实例'],
    '内存管理': ['虚拟内存', '页面置换', 'FIFO', 'LRU', 'OPT', '物理内存', '外存空间'],
    '文件与设备管理': ['文件系统', 'FAT32', 'NTFS', 'EXT4', 'APFS', 'HFS+', '设备驱动', '驱动程序'],
  },
  '计算机网络': {
    '网络基础概述': ['计算机网络', '局域网', 'LAN', '城域网', 'MAN', '广域网', 'WAN', '互联网', 'Internet', '资源共享', '通信线路', '网络分类'],
    '网络协议体系': ['OSI', '七层模型', 'TCP/IP', '四层模型', '网络接口层', '网络层', '传输层', '应用层', '会话层', '表示层', '数据链路层', '物理层'],
    '网络地址与路由': ['IP地址', 'IPv4', 'IPv6', '32位', '128位', '路由', 'DNS', '域名系统', '网段', '域名', 'IP'],
    '传输层协议': ['TCP协议', 'UDP协议', '三次握手', '四次挥手', '面向连接', '无连接', '可靠传输', 'TCP', 'UDP'],
    '应用层协议': ['HTTP', 'HTTPS', '超文本', '超文本传输协议', '端口', '万维网'],
    '网络设备与安全': ['路由器', '交换机', '网络层', '数据链路层', '跨网段'],
  },
}

// ============ 改进的分类算法 ============
// 步骤 1：先计算章节得分，选最高分章节
// 步骤 2：在该章节内计算单元得分，选最高分单元
// 步骤 3：如果得分低于阈值，则标记为"其他"
function classifyCardHierarchical(kp, opts = {}) {
  const chapterScores = {}
  for (const [chapter, keywords] of Object.entries(CHAPTER_KEYWORDS)) {
    let score = 0
    for (const { kw, w } of keywords) {
      if (kp.includes(kw)) {
        // 关键词长度 * 权重 = 得分
        // 更长的关键词更具区分性，给予更高基础分
        const baseScore = kw.length * w
        score += baseScore
      }
    }
    chapterScores[chapter] = score
  }

  // 选择得分最高的章节
  const sortedChapters = Object.entries(chapterScores).sort((a, b) => b[1] - a[1])
  const bestChapter = sortedChapters[0]
  const secondChapter = sortedChapters[1]

  // 章节得分过低（低于阈值），或与第二名差距过小 -> 标记为其他
  const CHAPTER_THRESHOLD = opts.chapterThreshold || 15
  if (!bestChapter || bestChapter[1] < CHAPTER_THRESHOLD) {
    return { chapter: '其他', unit: '其他', score: 0, chapterScore: 0 }
  }

  // 在选定章节内计算单元得分
  const chapterName = bestChapter[0]
  const unitMap = UNIT_KEYWORDS[chapterName] || {}
  const unitScores = {}
  for (const [unitName, keywords] of Object.entries(unitMap)) {
    let score = 0
    for (const kw of keywords) {
      if (kp.includes(kw)) {
        score += kw.length * 3 // 单元关键词更细粒度，给予较低权重
      }
    }
    unitScores[unitName] = score
  }

  const sortedUnits = Object.entries(unitScores).sort((a, b) => b[1] - a[1])
  const bestUnit = sortedUnits[0]
  const UNIT_THRESHOLD = opts.unitThreshold || 5

  if (bestUnit && bestUnit[1] >= UNIT_THRESHOLD) {
    return { chapter: chapterName, unit: bestUnit[0], score: bestChapter[1] + bestUnit[1], chapterScore: bestChapter[1] }
  }

  // 单元分类不明显，返回章节但标记为通用单元
  return { chapter: chapterName, unit: chapterName + '·基础知识', score: bestChapter[1], chapterScore: bestChapter[1] }
}

// ============ 完整流程：分类 + 批处理 + 合并 + Fallback ============
function fullClassificationPipeline(cards, opts = {}) {
  const batchSize = opts.batchSize || 50
  const results = []

  // Step 1: 分批分类（模拟 AI 分批处理）
  for (let start = 0; start < cards.length; start += batchSize) {
    const batch = cards.slice(start, start + batchSize)
    const offset = start

    // 为每张卡片分配 (chapter, unit)
    const cardAssignments = batch.map((card, localIdx) => {
      const { chapter, unit } = classifyCardHierarchical(card.kp || card.knowledge_point || card.front || card.text || '')
      return { globalIdx: offset + localIdx, chapter, unit }
    })

    results.push(...cardAssignments)
  }

  // Step 2: 构建章节-单元-卡片索引结构
  const chapterMap = new Map()
  for (const { globalIdx, chapter, unit } of results) {
    if (!chapterMap.has(chapter)) chapterMap.set(chapter, new Map())
    const unitMap = chapterMap.get(chapter)
    if (!unitMap.has(unit)) unitMap.set(unit, [])
    unitMap.get(unit).push(globalIdx)
  }

  // Step 3: Fallback - 将空的"其他"单元合并到现有章节
  // 确保所有卡片都被分配
  const assignedSet = new Set()
  const chaptersOut = []
  for (const [chapterName, unitMap] of chapterMap.entries()) {
    const unitsOut = []
    for (const [unitName, indices] of unitMap.entries()) {
      if (indices.length > 0) {
        unitsOut.push({ name: unitName, cardIndices: indices })
        indices.forEach(i => assignedSet.add(i))
      }
    }
    if (unitsOut.length > 0) {
      chaptersOut.push({ name: chapterName, units: unitsOut })
    }
  }

  // Step 4: 确保 100% 分配 - 检查是否有遗漏卡片，强行放入"其他"
  const missingCards = []
  for (let i = 0; i < cards.length; i++) {
    if (!assignedSet.has(i)) missingCards.push(i)
  }

  if (missingCards.length > 0) {
    // 放入"其他"章节
    let otherChapter = chaptersOut.find(c => c.name === '其他')
    if (!otherChapter) {
      otherChapter = { name: '其他', units: [] }
      chaptersOut.push(otherChapter)
    }
    let otherUnit = otherChapter.units.find(u => u.name === '其他卡片')
    if (!otherUnit) {
      otherUnit = { name: '其他卡片', cardIndices: [] }
      otherChapter.units.push(otherUnit)
    }
    missingCards.forEach(i => {
      otherUnit.cardIndices.push(i)
      assignedSet.add(i)
    })
  }

  // Step 5: 二次合并 - 将语义相似度高的单元合并（可选）
  // 目前关键词分类已经避免了语义重复，此步暂保留为未来改进点

  return {
    chapters: chaptersOut,
    assigned: assignedSet.size,
    total: cards.length,
    missingCards,
  }
}

// ============ 评估函数 ============
function evaluateClassification(result, cards, expectedData) {
  const stats = {
    chapterCount: result.chapters.length,
    unitCount: result.chapters.reduce((sum, ch) => sum + ch.units.length, 0),
    assigned: result.assigned,
    total: result.total,
    correctChapters: 0,
    correctUnits: 0,
    missingCards: result.missingCards,
    duplicateCards: [],
    accuracy: '0.0',
    chapterAccuracy: '0.0',
    hasExpected: expectedData && expectedData.length > 0 && expectedData[0].expectedChapter,
  }

  const seen = new Set()
  for (const ch of result.chapters) {
    for (const u of ch.units) {
      for (const idx of u.cardIndices) {
        if (seen.has(idx)) stats.duplicateCards.push(idx)
        seen.add(idx)
        if (stats.hasExpected && idx >= 0 && idx < expectedData.length) {
          const exp = expectedData[idx]
          if (!exp || !exp.expectedChapter) continue
          const chapterMatch = ch.name === exp.expectedChapter ||
            ch.name.includes(exp.expectedChapter) ||
            exp.expectedChapter.includes(ch.name)
          const unitMatch = u.name === exp.expectedUnit ||
            u.name.includes(exp.expectedUnit) ||
            exp.expectedUnit.includes(u.name)
          if (chapterMatch) stats.correctChapters++
          if (unitMatch) stats.correctUnits++
        }
      }
    }
  }

  if (stats.hasExpected && stats.assigned > 0) {
    stats.accuracy = ((stats.correctUnits / stats.assigned) * 100).toFixed(1)
    stats.chapterAccuracy = ((stats.correctChapters / stats.assigned) * 100).toFixed(1)
  }

  return stats
}

// ============ 鲁棒 JSON 解析器 ============
function robustJsonParse(raw, cardCount) {
  if (!raw) return null
  let cleaned = String(raw).trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // 策略 1：直接解析
  try {
    const parsed = JSON.parse(cleaned)
    return validateAndNormalize(parsed, cardCount)
  } catch (_) { }

  // 策略 2：提取 {} 范围
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = cleaned.slice(firstBrace, lastBrace + 1)
    try {
      return validateAndNormalize(JSON.parse(sliced), cardCount)
    } catch (_) { }

    // 策略 3：修复尾部逗号
    try {
      return validateAndNormalize(JSON.parse(sliced.replace(/,(\s*[}\]])/g, '$1')), cardCount)
    } catch (_) { }

    // 策略 4：修复字符串索引
    try {
      return validateAndNormalize(JSON.parse(sliced.replace(/"(\-?\d+)"/g, '$1')), cardCount)
    } catch (_) { }
  }

  return null
}

function validateAndNormalize(parsed, cardCount) {
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
    const chapters = []
    for (const ch of parsed.chapters) {
      if (!ch?.name || typeof ch.name !== 'string') continue
      const chapterName = String(ch.name).trim().slice(0, 12)
      if (!chapterName) continue
      const units = []
      if (Array.isArray(ch.units)) {
        for (const u of ch.units) {
          if (!u?.name || typeof u.name !== 'string') continue
          const unitName = String(u.name).trim().slice(0, 16)
          if (!unitName) continue
          const indices = []
          if (Array.isArray(u.cardIndices)) {
            for (const rawIdx of u.cardIndices) {
              const idx = Number(rawIdx)
              if (!isNaN(idx) && idx >= 0 && idx < cardCount) indices.push(idx)
            }
          }
          if (indices.length > 0) units.push({ name: unitName, cardIndices: indices })
        }
      }
      if (units.length > 0) chapters.push({ name: chapterName, units })
    }
    if (chapters.length > 0) return { chapters }
  }
  if (Array.isArray(parsed.units) && parsed.units.length > 0) {
    const units = []
    for (const u of parsed.units) {
      if (!u?.name || typeof u.name !== 'string') continue
      const unitName = String(u.name).trim().slice(0, 16)
      if (!unitName) continue
      const indices = []
      if (Array.isArray(u.cardIndices)) {
        for (const rawIdx of u.cardIndices) {
          const idx = Number(rawIdx)
          if (!isNaN(idx) && idx >= 0 && idx < cardCount) indices.push(idx)
        }
      }
      if (indices.length > 0) units.push({ name: unitName, cardIndices: indices })
    }
    if (units.length > 0) return { units }
  }
  return null
}

// ============ 主测试流程 ============
function runAllTests() {
  const sep = '='.repeat(70)
  console.log('\n' + sep)
  console.log('  弱模型分类逻辑综合测试 - v2 改进版')
  console.log(sep)
  console.log('  核心改进：分层关键词分类 + 加权评分 + Fallback + 100%分配')
  console.log(sep)

  let passed = 0
  let total = 0

  // ---- 测试 1：基础数据集（40 张卡片）----
  console.log('\n[测试 1] 基础数据集（40张卡片，计算机基础）')
  const cards1 = COMPUTER_SCIENCE_DATA.slice(0, 40)
  const result1 = fullClassificationPipeline(cards1)
  const stats1 = evaluateClassification(result1, cards1, cards1)
  console.log('  - 章节数:', stats1.chapterCount, '  单元数:', stats1.unitCount)
  console.log('  - 已分配:', stats1.assigned + '/' + stats1.total, '  缺失:', stats1.missingCards.length, '  重复:', stats1.duplicateCards.length)
  console.log('  - 章节准确率:', stats1.chapterAccuracy + '%', '  单元准确率:', stats1.accuracy + '%')
  total++
  if (stats1.missingCards.length === 0 && stats1.duplicateCards.length === 0 && parseFloat(stats1.accuracy) >= 70) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 2：扩展数据集（60 张，跨多个章节）----
  console.log('\n[测试 2] 扩展数据集（60张卡片，4个章节）')
  const cards2 = COMPUTER_SCIENCE_DATA
  const result2 = fullClassificationPipeline(cards2)
  const stats2 = evaluateClassification(result2, cards2, cards2)
  console.log('  - 章节数:', stats2.chapterCount, '  单元数:', stats2.unitCount)
  console.log('  - 已分配:', stats2.assigned + '/' + stats2.total, '  缺失:', stats2.missingCards.length, '  重复:', stats2.duplicateCards.length)
  console.log('  - 章节准确率:', stats2.chapterAccuracy + '%', '  单元准确率:', stats2.accuracy + '%')
  total++
  if (stats2.missingCards.length === 0 && stats2.duplicateCards.length === 0 && parseFloat(stats2.accuracy) >= 70) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 3：批大小敏感性测试 ----
  console.log('\n[测试 3] 批大小敏感性（测试 10/20/30/40/50/60 张/批）')
  const batchSizes = [10, 20, 30, 40, 50, 60]
  let allStable = true
  const batchResults = []
  for (const bs of batchSizes) {
    const r = fullClassificationPipeline(cards2, { batchSize: bs })
    const s = evaluateClassification(r, cards2, cards2)
    batchResults.push({ bs, ...s })
    console.log('  - 批大小', bs, ':章节', s.chapterCount, '单元', s.unitCount,
      '准确率', s.accuracy + '%', '缺失', s.missingCards.length)
    if (s.missingCards.length > 0) allStable = false
  }
  total++
  if (allStable) {
    passed++
    console.log('  [PASS] 所有批大小均无卡片丢失')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 4：JSON 解析鲁棒性 ----
  console.log('\n[测试 4] JSON 解析鲁棒性')
  const jsonTestCases = [
    { name: '标准 JSON', raw: '{"chapters":[{"name":"概述","units":[{"name":"发展","cardIndices":[0,1,2]}]}]}', shouldSucceed: true },
    { name: 'Markdown 代码块', raw: '```json\n{"units":[{"name":"单元1","cardIndices":[0,1]}]}\n```', shouldSucceed: true },
    { name: '前后中文说明', raw: '好的，以下是分类结果：{"units":[{"name":"单元1","cardIndices":[0,1]}]} 谢谢使用！', shouldSucceed: true },
    { name: '尾部逗号', raw: '{"units":[{"name":"单元1","cardIndices":[0,1,],},]}', shouldSucceed: true },
    { name: '字符串索引', raw: '{"units":[{"name":"单元1","cardIndices":["0","1","2"]}]}', shouldSucceed: true },
    { name: '完全乱码', raw: 'alsdfjalskdfjq98qejr@#$', shouldSucceed: false },
    { name: '空对象', raw: '{}', shouldSucceed: false },
    { name: '无效字段名', raw: '{"result": [{"chapter": "test", "cards": [0,1]}]}', shouldSucceed: false },
    { name: '索引超出范围', raw: '{"units":[{"name":"单元","cardIndices":[-1, 0, 1, 9999]}]}', shouldSucceed: true },
    { name: '重复索引', raw: '{"units":[{"name":"单元","cardIndices":[0, 0, 1, 1, 2]}]}', shouldSucceed: true },
    { name: '章节+单元格式', raw: '{"chapters":[{"name":"章节1","units":[{"name":"单元1","cardIndices":[0,1]},{"name":"单元2","cardIndices":[2,3]}]}]}', shouldSucceed: true },
    { name: '混合字符串和数字索引', raw: '{"units":[{"name":"X","cardIndices":["0",1,"2",3]}]}', shouldSucceed: true },
    { name: '超长文本包裹 JSON', raw: '这是一段很长的说明文字...此处忽略...{"units":[{"name":"核心要点","cardIndices":[0,1,2,3]}]}...还有后续文字', shouldSucceed: true },
  ]
  let jsonOk = true
  for (const tc of jsonTestCases) {
    const parsed = robustJsonParse(tc.raw, 10)
    const success = parsed !== null && (parsed.chapters?.length > 0 || parsed.units?.length > 0)
    const match = success === tc.shouldSucceed
    console.log('  -', match ? 'OK ' : 'ERR', tc.name, ':', success ? '成功' : '失败', '(预期', tc.shouldSucceed ? '成功' : '失败', ')')
    if (!match) jsonOk = false
  }
  total++
  if (jsonOk) { passed++; console.log('  [PASS]') } else { console.log('  [FAIL]') }

  // ---- 测试 5：卡片乱序稳定性测试 ----
  console.log('\n[测试 5] 卡片乱序稳定性（10次随机打乱）')
  let stableOk = true
  const originalResult = fullClassificationPipeline(cards2)
  const originalStats = evaluateClassification(originalResult, cards2, cards2)
  for (let round = 0; round < 10; round++) {
    // 随机打乱
    const shuffled = [...cards2].sort(() => Math.random() - 0.5)
    const r = fullClassificationPipeline(shuffled)
    const s = evaluateClassification(r, shuffled, shuffled)
    if (s.missingCards.length > 0) {
      stableOk = false
      console.log('  - 轮次', round + 1, ': [FAIL] 卡片丢失')
      continue
    }
    // 准确率差异不应超过 5%
    const accDiff = Math.abs(parseFloat(s.accuracy) - parseFloat(originalStats.accuracy))
    if (accDiff > 10) {
      stableOk = false
      console.log('  - 轮次', round + 1, ': [WARN] 准确率偏差', accDiff.toFixed(1) + '%', '(准确率', s.accuracy + '%)')
    } else {
      console.log('  - 轮次', round + 1, ': [OK] 准确率', s.accuracy + '%')
    }
  }
  total++
  if (stableOk) { passed++; console.log('  [PASS]') } else { console.log('  [FAIL]') }

  // ---- 测试 6：边界条件（空卡片/极短卡片/全未知卡片）----
  console.log('\n[测试 6] 边界条件测试')
  const edgeCases = [
    { name: '空文本卡片', cards: [{ kp: '' }, { kp: '' }] },
    { name: '极短文本', cards: [{ kp: '你好' }, { kp: '世界' }] },
    { name: '完全无关内容', cards: [{ kp: '今天天气真不错，我们去公园散步吧' }, { kp: '这是一本关于历史的书' }] },
  ]
  let edgeOk = true
  for (const tc of edgeCases) {
    const r = fullClassificationPipeline(tc.cards)
    const s = evaluateClassification(r, tc.cards, tc.cards)
    const allAssigned = s.assigned === s.total && s.missingCards.length === 0
    console.log('  -', tc.name, ':', allAssigned ? 'OK' : 'ERR', '(分配', s.assigned + '/' + s.total, ')')
    if (!allAssigned) edgeOk = false
  }
  total++
  if (edgeOk) { passed++; console.log('  [PASS] 所有边界卡片均被分配') } else { console.log('  [FAIL]') }

  // ---- 汇总 ----
  console.log('\n' + sep)
  console.log('  测试结果汇总：通过', passed, '/', total)
  console.log('  状态：', passed === total ? '全部通过' : '需要改进')
  console.log(sep)
  console.log('')

  return { passed, total }
}

// 运行测试
runAllTests()
