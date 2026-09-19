/**
 * AI 直接选单元测试脚本（方案 A：真正的 AI 分类）
 *
 * 核心思路：
 * 1. 从测试数据提取「预期章节+单元」完整列表，编号后提供给 AI
 * 2. AI 为每张卡片直接选择归属的章节编号和单元编号
 * 3. 验证时直接比较编号映射的名称，无关键词、无模糊匹配
 *
 * 通过标准：
 * - 强模型：章节准确率 ≥85%，单元准确率 ≥90%
 * - 弱模型：章节准确率 ≥40%，单元准确率 ≥30%（星火 Lite 能力有限）
 */

// ===== 测试数据（从 testKnowledgeClassification.js 复制）=====
const KNOWLEDGE_POINTS = [
  // 第一章 计算机基础通识拓展
  { kp: '计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制，现代计算机通用架构原理', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '冯·诺依曼三大设计要点：采用二进制存储数据、指令预先存入内存、计算机五大硬件协同执行指令', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '人工智能应用分支：模式识别、机器翻译、智能决策、机器人、自然语言处理五大主流分支', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机辅助技术分类：CAD计算机辅助设计、CAM计算机辅助制造、CAI计算机辅助教学、CAT计算机辅助测试', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '实时控制系统特点：响应毫秒级、不间断监测、自动调控，多用于航天、化工、交通管控场景', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '分布式计算机特点：多台独立计算机组网协同、分摊算力、容错性强，云端服务器主流架构', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '专用计算机定义：针对性单一场景开发，功能固定、不可拓展，如火控计算机、门禁工控机', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机运行三大流程：取指令、分析指令、执行指令，循环完成所有作业任务', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '多媒体计算机核心特质：可一体化处理图文、音频、视频、动画多维复合型信息', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机信息安全基础特性：保密性、完整性、可用性、可控性、不可否认性五大安全属性', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },

  { kp: '计算机信息最小标识单位：字符，区别于存储单位字节，为人机交互基础信息单元', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '模拟信号与数字信号区别：模拟信号连续可变、易干扰；数字信号离散取值、抗干扰能力强', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '音频数字化四步骤：采样、量化、编码、压缩，采样频率越高音频音质越清晰', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '图像两大类型：位图、矢量图，位图放大失真，矢量图放大无锯齿、画质无损', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '常用图像格式：JPG压缩图片、PNG透明底图片、BMP无损位图、GIF动态图片', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: 'Unicode编码：万国统一字符编码，兼容全球各国文字，单字符占用2-4字节', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '汉字三码区分：输入码、机内码、字形码，输入法打出汉字使用输入码', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '数据压缩两类：无损压缩（文本、程序）、有损压缩（音视频、图片）', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '十六进制常用标识：后缀H标识，0-9、A-F共计16个数码，多用于标注内存地址', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '二进制运算基础规则：加法逢二进一、减法借一当二，基础逻辑运算为与、或、非、异或', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },

  { kp: '完整软件系统二分结构：系统软件+应用软件，系统软件管控硬件，应用软件服务用户', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '系统软件四大类别：操作系统、语言处理程序、数据库管理系统、系统服务工具', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '操作系统核心功能：资源管理、作业管理、文件管理、进程管理、人机交互管理', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '常见操作系统分类：桌面端Windows、macOS；移动端安卓、iOS；服务器Linux', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '程序设计语言三代划分：机器语言、汇编语言、高级语言，仅机器语言可直接被CPU执行', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '语言处理三类程序：汇编程序、编译程序、解释程序，编译程序整体翻译代码，解释程序逐行翻译', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '应用软件定义：面向用户专项办公娱乐开发，不可脱离操作系统独立运行', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '数据库管理系统作用：统一存储、调取、修改批量数据，学校学籍、商城后台专用软件', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '软件授权类型：商用付费软件、共享试用软件、免费开源软件、私有专属软件', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '进程与程序区别：程序静态代码文件，进程运行中占用内存的动态执行任务', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },

  // 第二章 计算机外设与硬件运维详解
  { kp: '计算机总线三大分类：数据总线、地址总线、控制总线，分工传输数据、地址、控制指令', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '主流有线传输接口：USB3.0、Type-C、HDMI、RJ45网线接口，传输速率依次区分等级', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '指点类输入设备：触控板、数位板、轨迹球、手写笔，精准定位屏幕光标专用外设', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '成像扫描类外设：二维码扫码器、高拍仪、胶片扫描仪，可纸质图文转为电子数字数据', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '显示器核心参数：分辨率、刷新率、色域、响应速度，刷新率越高画面动态越流畅', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '显示器面板分类：LCD液晶、OLED自发光、LED背光，OLED多用于高端便携电子设备', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '打印机三类主流类型：喷墨打印机、激光打印机、针式打印机，针式专打票据多联纸', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '无线网络外设：无线网卡、蓝牙模块、WiFi接收器，实现设备无网线组网传输数据', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '散热附属硬件：风冷散热器、水冷散热器，专门降低CPU、显卡高负载工作温度', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '外设连接优先级：主板原生接口＞外接拓展坞，原生接口传输稳定性、速率更高', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },

  // 第一章 函数、极限与连续
  { kp: '函数三要素：定义域、对应法则、值域，判定两函数相等需定义域、对应法则完全一致', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常用初等函数分类：幂函数、指数函数、对数函数、三角函数、反三角函数五类基本初等函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数四大特性：单调性、奇偶性、周期性、有界性，是研究函数图像的核心性质', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '奇偶函数判定规则：定义域关于原点对称；f(-x)=f(x)为偶函数，f(-x)=-f(x)为奇函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '复合函数定义：由内层函数u=g(x)、外层函数y=f(u)嵌套组成，复合定义域需兼顾两层函数取值', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '反函数核心特点：原函数与反函数图像关于直线y=x对称，定义域值域互相互换', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常见有界函数：sinx、cosx、arcsinx、arctanx，定义域全域取值范围固定受限', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '分段函数定义：定义域不同区间，对应不同解析式，整体属于一个函数而非多个函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '指数对数基础关系：a^x=N 等价于 x=log_aN，二者互为反函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数运算规则：同定义域内可做加减乘除四则运算，除法运算分母函数不可取值为0', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },

  { kp: '极限核心定义：自变量趋近定值时，函数值无限趋近固定常数，常数即为函数极限值', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限存在充要条件：函数左极限=函数右极限，单侧极限不等则整体极限不存在', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小量定义：极限为0的变量，趋近于0的速度快慢决定无穷小阶数高低', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷大量定义：自变量变化时，函数绝对值无限增大，无穷大的倒数为等价无穷小', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '大一必考等价无穷小（x→0）：sin x~x、tan x~x、ln(1+x)~x', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限四则运算法则：极限均存在时，和差积商极限=极限和差积商，分母极限不可为0', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '两个重要极限公式：lim(x→0) sin(x)/x=1、lim(x→∞) (1+1/x)^x=e', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小比较分类：高阶无穷小、同阶无穷小、等价无穷小、低阶无穷小四类', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限不存在三类情况：趋于无穷大、函数震荡无定值、左右极限数值不相等', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '多项式分式极限规律：自变量趋于无穷时，分式极限由分子分母最高次幂系数决定', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },

  { kp: '函数连续三大条件：函数该点有定义、该点极限存在、极限值等于函数值，缺一不可', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '间断点大类划分：第一类间断点、第二类间断点，以左右极限是否存在为划分依据', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '第一类间断点细分：可去间断点、跳跃间断点，左右极限均存在仅数值不等', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '第二类间断点细分：无穷间断点、震荡间断点，至少一侧极限不存在', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '初等函数连续性：定义域内所有点全部连续，间断点仅出现在定义域外点位', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '闭区间连续函数最值定理：闭区间连续函数，一定存在最大值与最小值', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '零点存在定理：闭区间连续函数，区间端点函数值异号，则区间内至少存在一个零点', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '介值定理：闭区间连续函数，可取到区间最值之间任意实数函数值', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '连续函数运算法则：连续函数四则运算、复合运算后，结果依旧为连续函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '可去间断点修复方式：补充修改该点函数定义，即可让函数在该点变为连续', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },

  // 第二章 一元函数微分学详解
  { kp: '导数几何意义：函数某点导数，对应函数图像该点切线斜率', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导与连续关系：函数可导一定连续，函数连续不一定可导，逆命题不成立', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '导数定义式：f\'(x0)=lim(Δx→0) [f(x0+Δx)-f(x0)]/Δx', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础常函数求导：常数C导数恒为0，(C)\'=0', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '幂函数求导法则：(x^μ)\'=μx^(μ-1)，为使用率最高基础求导公式', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础三角函数求导：(sin x)\'=cos x、(cos x)\'=-sin x', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '指数对数求导公式：(e^x)\'=e^x、(ln x)\'=1/x', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导判定条件：函数某点左右导数存在且相等，该点才可导', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '高阶导数定义：对一阶导数再次求导，二阶导数表征函数图像凹凸变化速率', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '不可导典型点位：折线拐点、尖点、竖直切线处，函数均不可求导', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },

  { kp: '导数四则求导法则：满足加减求导分项求导，乘法求导、除法求导有专属组合公式', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '复合函数链式求导：逐层由外向内求导，每层导数相乘，复合求导核心方法', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '隐函数求导规则：等式两边同时对x求导，含y项乘y\'，整理求解一阶导数', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '参数方程求导公式：y对x导数=y对t导数除以x对t导数', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '洛必达法则适用场景：0/0、∞/∞型不定式极限，分子分母分别求导再求极限', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '函数单调性判定：一阶导数大于0区间单调递增，一阶导数小于0区间单调递减', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '极值第一判定定理：导数由正变负取极大值，导数由负变正取极小值', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '凹凸性判定规则：二阶导数大于0图像凹，二阶导数小于0图像凸', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '拐点定义：函数凹凸性发生改变的分界点，拐点处二阶导数为0或不存在', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '微分核心公式：dy=f\'(x)dx，微分是函数增量线性近似值', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
]

// ===== AI 配置 =====
const STRONG_MODEL_CONFIG = {
  name: '阿里云千问（强模型）',
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  apiKey: 'sk-ws-H.REDRRPM.oDCm.MEYCIQDZOMN2Ctge1ffgLG3bHom2k_l1zIoj367CzD964fPqxAIhAPPPgxiNTJyy2OGbRt1XlnT_DpDO1m50_GasPJ5SV-wr',
  model: 'qwen-plus',
  maxTokens: 8192,
}

const WEAK_MODEL_CONFIG = {
  name: '讯飞星火 Lite（弱模型）',
  apiUrl: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
  apiKey: 'VwUksgZRWaNtCszikCTz:DTmGTGTLEOuFAcELiaqz',
  model: 'lite',
  maxTokens: 8192,
}

// ===== AI 调用函数 =====
async function callAi(prompt, config) {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.maxTokens,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`AI API 调用失败: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// ===== 构建预期结构（编号化 + 描述）=====
const UNIT_DESCRIPTIONS = {
  '计算机应用领域与工作原理': '计算机工作原理（冯·诺依曼）、应用领域、类型特点、人工智能',
  '数据结构与多媒体信息编码': '数据编码、多媒体、二进制、字符编码、图像音频格式',
  '计算机软件系统分类概述': '软件系统分类、操作系统、程序设计语言、系统软件应用软件',
  '外部设备与总线接口硬件': '外部设备、总线、接口、输入输出设备、显示器打印机',
  '函数概念与基本性质': '函数定义、性质、初等函数、奇偶性、单调性、有界性',
  '数列与函数极限': '极限定义、无穷小、无穷大、极限运算法则、等价无穷小',
  '函数连续性与间断点': '连续性、间断点分类、闭区间定理、零点定理、介值定理',
  '导数概念与求导公式': '导数定义、求导公式、可导性、高阶导数、切线斜率',
  '求导法则与导数应用': '求导法则、复合函数求导、导数应用、极值、凹凸性、洛必达法则',
}

function buildExpectedStructure(knowledgePoints) {
  const chapterOrder = []
  const chapterUnits = {}
  for (const kp of knowledgePoints) {
    if (!chapterUnits[kp.expectedChapter]) {
      chapterUnits[kp.expectedChapter] = []
      chapterOrder.push(kp.expectedChapter)
    }
    if (!chapterUnits[kp.expectedChapter].includes(kp.expectedUnit)) {
      chapterUnits[kp.expectedChapter].push(kp.expectedUnit)
    }
  }

  const chapterCodeMap = {}   // 'C1' -> 章节名
  const unitCodeMap = {}      // 'U1' -> 单元名
  const structureText = []
  let chapterIdx = 1
  let unitIdx = 1
  for (const ch of chapterOrder) {
    const chCode = `C${chapterIdx}`
    chapterCodeMap[chCode] = ch
    structureText.push(`[${chCode}] ${ch}`)
    for (const u of chapterUnits[ch]) {
      const uCode = `U${unitIdx}`
      unitCodeMap[uCode] = u
      const desc = UNIT_DESCRIPTIONS[u] || ''
      structureText.push(`  [${uCode}] ${u}（${desc}）`)
      unitIdx++
    }
    chapterIdx++
  }

  return { structureText: structureText.join('\n'), chapterCodeMap, unitCodeMap }
}

// ===== AI 直接选单元（方案 A 核心）=====
async function classifyCardsByExpectedUnits(cards, expectedStructure, config) {
  const isWeakModel = config.model === 'lite'
  const batchSize = isWeakModel ? 3 : cards.length
  const classifications = []

  for (let batchStart = 0; batchStart < cards.length; batchStart += batchSize) {
    const batchCards = cards.slice(batchStart, batchStart + batchSize)
    const batchLines = batchCards.map((c, i) => `${batchStart + i}. ${c.kp}`).join('\n')

    const prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节和单元中。

【可选章节和单元列表】（必须从以下列表中选择，不可自创）
${expectedStructure.structureText}

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1，单元 U1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3，单元 U5
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4，单元 U8

【待分类知识点】（共${batchCards.length}个）
${batchLines}

【输出要求】
为每个知识点选择最合适的章节编号和单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"chapter":"C1","unit":"U1"}]}

注意：
1. chapter 必须是 C1、C2 等章节编号，unit 必须是 U1、U2 等单元编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个单元
4. 不能遗漏任何知识点
5. index 是知识点在列表中的索引（从${batchStart}开始）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元`

    console.log(`  [分类] 批次 ${batchStart}-${batchStart + batchCards.length - 1} 调用 AI...`)
    const content = await callAi(prompt, config)

    // 弱模型调试输出
    if (isWeakModel && batchStart < 3) {
      console.log(`  [调试] 批次 ${batchStart} 原始返回前500字:`)
      console.log(content.slice(0, 500))
      console.log('  [调试] ---')
    }

    // JSON 解析（含多重修复）
    let result
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('没有找到 JSON')
      result = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.log(`  [批次 ${batchStart}] JSON 解析失败，尝试修复...`)
      // 多重修复
      let fixedJson = content
        .replace(/\/\/.*$/gm, '')                    // 移除单行注释
        .replace(/\/\*[\s\S]*?\*\//g, '')            // 移除多行注释
        .replace(/,(\s*[}\]])/g, '$1')               // 移除尾随逗号
        .replace(/'([^']*)'(\s*:)/g, '"$1"$2')       // 单引号属性名转双引号
        .replace(/'([^']*)'/g, '"$1"')               // 单引号字符串转双引号
        .replace(/(\w+)\s*:/g, '"$1":')              // 未引用的属性名加双引号
        .replace(/:\s*"([^"]*)"(\s*[,\]}])/g, ': "$1"$2')  // 规范化字符串值

      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`  [批次 ${batchStart}] JSON 修复失败: ${e.message}`)
        console.warn(`  [批次 ${batchStart}] 原始内容前300字: ${content.slice(0, 300)}`)
        continue
      }
      try {
        result = JSON.parse(jsonMatch[0])
      } catch (e2) {
        console.warn(`  [批次 ${batchStart}] JSON 修复后仍失败: ${e2.message}`)
        console.warn(`  [批次 ${batchStart}] 修复后前300字: ${fixedJson.slice(0, 300)}`)
        continue
      }
    }

    // 收集分类结果
    for (const c of result.classifications || []) {
      classifications.push({
        index: batchSize === 1 ? batchStart : c.index,
        chapterCode: c.chapter,
        unitCode: c.unit,
      })
    }
    console.log(`  [分类] 批次完成，收到 ${result.classifications?.length || 0} 条分类`)
  }

  return classifications
}

// ===== 主测试函数 =====
async function runTest(modelConfig, isWeakModel) {
  console.log('\n======================================================================')
  console.log(`  ${modelConfig.name} 测试`)
  console.log('======================================================================')

  const passCriteria = isWeakModel
    ? { chapterAccuracy: 40, unitAccuracy: 30 }
    : { chapterAccuracy: 85, unitAccuracy: 90 }

  console.log(`  通过标准: 章节≥${passCriteria.chapterAccuracy}%, 单元≥${passCriteria.unitAccuracy}%`)
  console.log(`  测试数据: ${KNOWLEDGE_POINTS.length} 个知识点`)
  console.log('')

  // 构建预期结构
  const expectedStructure = buildExpectedStructure(KNOWLEDGE_POINTS)
  console.log(`  [结构] 章节数: ${Object.keys(expectedStructure.chapterCodeMap).length}`)
  console.log(`  [结构] 单元数: ${Object.keys(expectedStructure.unitCodeMap).length}`)

  // AI 直接选单元
  console.log('  [分类] AI 直接选单元...')
  const cards = KNOWLEDGE_POINTS.map((item, index) => ({
    id: `test-kp-${index}`,
    ...item,
  }))

  const classifications = await classifyCardsByExpectedUnits(cards, expectedStructure, modelConfig)
  console.log(`  [分类] 完成: 收到 ${classifications.length} 条分类结果`)

  // 验证：直接字符串比较（编号映射后）
  console.log('  [验证] 验证分类准确性...')

  let correctChapters = 0
  let correctUnits = 0
  let totalChecked = 0
  const wrongSamples = []

  for (const c of classifications) {
    const expected = KNOWLEDGE_POINTS[c.index]
    if (!expected) continue
    totalChecked++

    const actualChapter = expectedStructure.chapterCodeMap[c.chapterCode]
    const actualUnit = expectedStructure.unitCodeMap[c.unitCode]

    if (actualChapter === expected.expectedChapter) {
      correctChapters++
    }
    if (actualUnit === expected.expectedUnit) {
      correctUnits++
    } else if (wrongSamples.length < 5) {
      wrongSamples.push({
        kp: expected.kp.slice(0, 40),
        expected: expected.expectedUnit,
        actual: actualUnit || `(无效编号: ${c.unitCode})`,
      })
    }
  }

  const chapterAccuracy = totalChecked > 0 ? Math.round((correctChapters / totalChecked) * 100) : 0
  const unitAccuracy = totalChecked > 0 ? Math.round((correctUnits / totalChecked) * 100) : 0

  console.log(`  [验证] 章节 ${chapterAccuracy}%, 单元 ${unitAccuracy}%`)

  if (wrongSamples.length > 0) {
    console.log('  [错误样本]')
    for (const s of wrongSamples) {
      console.log(`    - "${s.kp}..." 期望: ${s.expected} | 实际: ${s.actual}`)
    }
  }

  console.log('')
  console.log(`  最终结果: 章节 ${chapterAccuracy}%, 单元 ${unitAccuracy}%`)
  console.log(`  通过标准: 章节≥${passCriteria.chapterAccuracy}%, 单元≥${passCriteria.unitAccuracy}%`)

  const passed = chapterAccuracy >= passCriteria.chapterAccuracy && unitAccuracy >= passCriteria.unitAccuracy
  console.log(`  ${passed ? '✅ 通过' : '❌ 未通过'}`)
  console.log('')

  return { passed, chapterAccuracy, unitAccuracy, totalChecked }
}

// ===== 主函数 =====
async function main() {
  console.log('======================================================================')
  console.log('  AI 直接选单元测试（方案 A：真正的 AI 分类）')
  console.log('======================================================================')
  console.log(`  测试数据: ${KNOWLEDGE_POINTS.length} 个知识点`)
  console.log('')

  let strongPassed = false
  let weakPassed = false

  // 测试强模型
  try {
    const strongResult = await runTest(STRONG_MODEL_CONFIG, false)
    strongPassed = strongResult.passed
  } catch (err) {
    console.error('  强模型测试失败:', err.message)
  }

  // 测试弱模型
  try {
    const weakResult = await runTest(WEAK_MODEL_CONFIG, true)
    weakPassed = weakResult.passed
  } catch (err) {
    console.error('  弱模型测试失败:', err.message)
  }

  console.log('======================================================================')
  console.log('  总结')
  console.log('======================================================================')
  console.log(`  强模型: ${strongPassed ? '✅ 通过' : '❌ 未通过'}`)
  console.log(`  弱模型: ${weakPassed ? '✅ 通过' : '❌ 未通过'}`)
  console.log('======================================================================')

  process.exit(strongPassed && weakPassed ? 0 : 1)
}

main().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
