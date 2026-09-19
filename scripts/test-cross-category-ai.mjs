/**
 * 跨分类归类 AI 真实分类测试（多轮对话策略 + 分批处理优化）
 *
 * 优化策略：
 * 1. 多轮对话：把复杂任务拆分成3轮简单任务
 *    - Round 1: 分类规划 + 卡片分配到分类（只返回分类名）
 *    - Round 2: 每个分类内规划章节 + 卡片分配到章节
 *    - Round 3: 每个章节内规划单元 + 卡片分配到单元
 * 2. 分批处理：每批20张卡片（与 aiService.js 的 WEAK_CROSS_CATEGORY_BATCH_SIZE 一致）
 *
 * 运行：node scripts/test-cross-category-ai.mjs
 *
 * 配置：使用讯飞 Spark Lite API（HTTP 方式）
 *   URL: https://spark-api-open.xf-yun.com/v1/chat/completions
 *   APIPassword: 从环境变量 SPARK_API_PASSWORD 读取
 */

import https from 'node:https'
import { URL } from 'node:url'

// ===== Spark Lite API 配置 =====
const SPARK_API_URL = 'https://spark-api-open.xf-yun.com/v1/chat/completions'
const SPARK_API_PASSWORD = process.env.SPARK_API_PASSWORD || ''

if (!SPARK_API_PASSWORD) {
  console.error('❌ 未配置 SPARK_API_PASSWORD 环境变量')
  console.error('   PowerShell: $env:SPARK_API_PASSWORD="APIKey:APISecret"; node scripts/test-cross-category-ai.mjs')
  process.exit(1)
}

// ===== 分批大小（与 aiService.js 的 WEAK_CROSS_CATEGORY_BATCH_SIZE 一致）=====
const BATCH_SIZE = 20

// ===== 测试数据集（90张真实数据）=====
const TEST_DATA = [
  // ===== 分类1：计算机基础（40张）=====
  { kp: '计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制，现代计算机通用架构原理', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '冯·诺依曼三大设计要点：采用二进制存储数据、指令预先存入内存、计算机五大硬件协同执行指令', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '人工智能应用分支：模式识别、机器翻译、智能决策、机器人、自然语言处理五大主流分支', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机辅助技术分类：CAD计算机辅助设计、CAM计算机辅助制造、CAI计算机辅助教学、CAT计算机辅助测试', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '实时控制系统特点：响应毫秒级、不间断监测、自动调控，多用于航天、化工、交通管控场景', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '分布式计算机特点：多台独立计算机组网协同、分摊算力、容错性强，云端服务器主流架构', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '专用计算机定义：针对性单一场景开发，功能固定、不可拓展，如火控计算机、门禁工控机', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机运行三大流程：取指令、分析指令、执行指令，循环完成所有作业任务', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '多媒体计算机核心特质：可一体化处理图文、音频、视频、动画多维复合型信息', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },
  { kp: '计算机信息安全基础特性：保密性、完整性、可用性、可控性、不可否认性五大安全属性', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机应用领域与工作原理' },

  { kp: '计算机信息最小标识单位：字符，区别于存储单位字节，为人机交互基础信息单元', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '模拟信号与数字信号区别：模拟信号连续可变、易干扰；数字信号离散取值、抗干扰能力强', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '音频数字化四步骤：采样、量化、编码、压缩，采样频率越高音频音质越清晰', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '图像两大类型：位图、矢量图，位图放大失真，矢量图放大无锯齿、画质无损', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '常用图像格式：JPG压缩图片、PNG透明底图片、BMP无损位图、GIF动态图片', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: 'Unicode编码：万国统一字符编码，兼容全球各国文字，单字符占用2-4字节', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '汉字三码区分：输入码、机内码、字形码，输入法打出汉字使用输入码', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '数据压缩两类：无损压缩（文本、程序）、有损压缩（音视频、图片）', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '十六进制常用标识：后缀H标识，0-9、A-F共计16个数码，多用于标注内存地址', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '二进制运算基础规则：加法逢二进一、减法借一当二，基础逻辑运算为与、或、非、异或', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },

  { kp: '完整软件系统二分结构：系统软件+应用软件，系统软件管控硬件，应用软件服务用户', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '系统软件四大类别：操作系统、语言处理程序、数据库管理系统、系统服务工具', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '操作系统核心功能：资源管理、作业管理、文件管理、进程管理、人机交互管理', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '常见操作系统分类：桌面端Windows、macOS；移动端安卓、iOS；服务器Linux', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '程序设计语言三代划分：机器语言、汇编语言、高级语言，仅机器语言可直接被CPU执行', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '语言处理三类程序：汇编程序、编译程序、解释程序，编译程序整体翻译代码，解释程序逐行翻译', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '应用软件定义：面向用户专项办公娱乐开发，不可脱离操作系统独立运行', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '数据库管理系统作用：统一存储、调取、修改批量数据，学校学籍、商城后台专用软件', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '软件授权类型：商用付费软件、共享试用软件、免费开源软件、私有专属软件', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },
  { kp: '进程与程序区别：程序静态代码文件，进程运行中占用内存的动态执行任务', expectedCategory: '计算机基础', expectedChapter: '计算机基础通识拓展', expectedUnit: '计算机软件系统分类概述' },

  { kp: '计算机总线三大分类：数据总线、地址总线、控制总线，分工传输数据、地址、控制指令', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '主流有线传输接口：USB3.0、Type-C、HDMI、RJ45网线接口，传输速率依次区分等级', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '指点类输入设备：触控板、数位板、轨迹球、手写笔，精准定位屏幕光标专用外设', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '成像扫描类外设：二维码扫码器、高拍仪、胶片扫描仪，可纸质图文转为电子数字数据', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '显示器核心参数：分辨率、刷新率、色域、响应速度，刷新率越高画面动态越流畅', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '显示器面板分类：LCD液晶、OLED自发光、LED背光，OLED多用于高端便携电子设备', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '打印机三类主流类型：喷墨打印机、激光打印机、针式打印机，针式专打票据多联纸', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '无线网络外设：无线网卡、蓝牙模块、WiFi接收器，实现设备无网线组网传输数据', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '散热附属硬件：风冷散热器、水冷散热器，专门降低CPU、显卡高负载工作温度', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },
  { kp: '外设连接优先级：主板原生接口＞外接拓展坞，原生接口传输稳定性、速率更高', expectedCategory: '计算机基础', expectedChapter: '计算机外设与硬件运维详解', expectedUnit: '外部设备与总线接口硬件' },

  // ===== 分类2：高等数学（50张）=====
  { kp: '函数三要素：定义域、对应法则、值域，判定两函数相等需定义域、对应法则完全一致', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常用初等函数分类：幂函数、指数函数、对数函数、三角函数、反三角函数五类基本初等函数', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数四大特性：单调性、奇偶性、周期性、有界性，是研究函数图像的核心性质', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '奇偶函数判定规则：定义域关于原点对称；f(-x)=f(x)为偶函数，f(-x)=-f(x)为奇函数', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '复合函数定义：由内层函数u=g(x)、外层函数y=f(u)嵌套组成，复合定义域需兼顾两层函数取值', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '反函数核心特点：原函数与反函数图像关于直线y=x对称，定义域值域互相互换', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常见有界函数：sinx、cosx、arcsinx、arctanx，定义域全域取值范围固定受限', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '分段函数定义：定义域不同区间，对应不同解析式，整体属于一个函数而非多个函数', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '指数对数基础关系：a^x=N 等价于 x=log_a N，二者互为反函数', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数运算规则：同定义域内可做加减乘除四则运算，除法运算分母函数不可取值为0', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },

  { kp: '极限核心定义：自变量趋近定值时，函数值无限趋近固定常数，常数即为函数极限值', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限存在充要条件：函数左极限=函数右极限，单侧极限不等则整体极限不存在', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小量定义：极限为0的变量，趋近于0的速度快慢决定无穷小阶数高低', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷大量定义：自变量变化时，函数绝对值无限增大，无穷大的倒数为等价无穷小', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '大一必考等价无穷小（x→0）：sin x等价于x、tan x等价于x、ln(1+x)等价于x', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限四则运算法则：极限均存在时，和差积商极限=极限和差积商，分母极限不可为0', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '两个重要极限公式：lim(x→0) sinx/x=1、lim(x→∞) (1+1/x)^x=e', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小比较分类：高阶无穷小、同阶无穷小、等价无穷小、低阶无穷小四类', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限不存在三类情况：趋于无穷大、函数震荡无定值、左右极限数值不相等', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '多项式分式极限规律：自变量趋于无穷时，分式极限由分子分母最高次幂系数决定', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },

  { kp: '函数连续三大条件：函数该点有定义、该点极限存在、极限值等于函数值，缺一不可', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '间断点大类划分：第一类间断点、第二类间断点，以左右极限是否存在为划分依据', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '第一类间断点细分：可去间断点、跳跃间断点，左右极限均存在仅数值不等', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '第二类间断点细分：无穷间断点、震荡间断点，至少一侧极限不存在', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '初等函数连续性：定义域内所有点全部连续，间断点仅出现在定义域外点位', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '闭区间连续函数最值定理：闭区间连续函数，一定存在最大值与最小值', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '零点存在定理：闭区间连续函数，区间端点函数值异号，则区间内至少存在一个零点', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '介值定理：闭区间连续函数，可取到区间最值之间任意实数函数值', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '连续函数运算法则：连续函数四则运算、复合运算后，结果依旧为连续函数', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },
  { kp: '可去间断点修复方式：补充修改该点函数定义，即可让函数在该点变为连续', expectedCategory: '高等数学', expectedChapter: '函数、极限与连续', expectedUnit: '函数连续性与间断点' },

  { kp: '导数几何意义：函数某点导数，对应函数图像该点切线斜率', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导与连续关系：函数可导一定连续，函数连续不一定可导，逆命题不成立', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '导数定义式：f\'(x0)=lim(Δx→0) [f(x0+Δx)-f(x0)]/Δx', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础常函数求导：常数C导数恒为0，(C)\'=0', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '幂函数求导法则：(x^μ)\'=μx^(μ-1)，为使用率最高基础求导公式', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础三角函数求导：(sinx)\'=cosx、(cosx)\'=-sinx', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '指数对数求导公式：(e^x)\'=e^x、(lnx)\'=1/x', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导判定条件：函数某点左右导数存在且相等，该点才可导', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '高阶导数定义：对一阶导数再次求导，二阶导数表征函数图像凹凸变化速率', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '不可导典型点位：折线拐点、尖点、竖直切线处，函数均不可求导', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },

  { kp: '导数四则求导法则：满足加减求导分项求导，乘法求导、除法求导有专属组合公式', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '复合函数链式求导：逐层由外向内求导，每层导数相乘，复合求导核心方法', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '隐函数求导规则：等式两边同时对x求导，含y项乘y\'，整理求解一阶导数', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '参数方程求导公式：y对x导数=y对t导数除以x对t导数', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '洛必达法则适用场景：0/0、∞/∞型不定式极限，分子分母分别求导再求极限', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '函数单调性判定：一阶导数大于0区间单调递增，一阶导数小于0区间单调递减', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '极值第一判定定理：导数由正变负取极大值，导数由负变正取极小值', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '凹凸性判定规则：二阶导数大于0图像凹，二阶导数小于0图像凸', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '拐点定义：函数凹凸性发生改变的分界点，拐点处二阶导数为0或不存在', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
  { kp: '微分核心公式：dy=f\'(x)dx，微分是函数增量线性近似值', expectedCategory: '高等数学', expectedChapter: '一元函数微分学详解', expectedUnit: '求导法则与导数应用' },
]

// ===== HTTP POST 工具函数 =====
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = JSON.stringify(body)
    const options = {
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) })
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ===== 调用 Spark Lite API =====
async function callSparkLite(prompt, { temperature = 0.3, max_tokens = 2048 } = {}) {
  const body = {
    model: 'lite',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens,
  }
  const headers = { 'Authorization': `Bearer ${SPARK_API_PASSWORD}` }
  const res = await httpPost(SPARK_API_URL, body, headers)
  if (res.statusCode !== 200) {
    throw new Error(`Spark API 错误 ${res.statusCode}: ${typeof res.body === 'string' ? res.body : JSON.stringify(res.body)}`)
  }
  const content = res.body?.choices?.[0]?.message?.content || ''
  return { content, tokens: res.body?.usage }
}

// ===== 解析 JSON（容错：去除 markdown 代码块、处理截断）=====
function parseJsonLoose(text) {
  if (!text) return null
  let s = String(text).trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '')

  try { return JSON.parse(s) } catch (e) {}

  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) {
    let sub = s.slice(start, end + 1)
    try { return JSON.parse(sub) } catch (e) {}
  }
  return tryRepairTruncatedJson(s)
}

function tryRepairTruncatedJson(s) {
  const start = s.indexOf('{')
  if (start < 0) return null
  let content = s.slice(start)

  // 策略1：去除末尾不完整内容，再补全括号
  let lastCompleteIdx = -1
  for (let i = content.length - 1; i >= 0; i--) {
    const ch = content[i]
    if (ch === ',' || ch === '{' || ch === '[' || ch === '}' || ch === ']') {
      lastCompleteIdx = i
      break
    }
  }
  let cleaned = content
  if (lastCompleteIdx >= 0 && lastCompleteIdx < content.length - 1) {
    cleaned = content.slice(0, lastCompleteIdx + 1)
  }
  cleaned = cleaned.replace(/,\s*$/, '')
  let result = closeBrackets(cleaned)
  if (result) return result

  // 策略2：直接补全括号
  result = closeBrackets(content)
  if (result) return result

  // 策略3：截断到最后一个 }
  let lastBrace = content.lastIndexOf('}')
  if (lastBrace > 0) {
    let truncated = content.slice(0, lastBrace + 1).replace(/,\s*$/, '')
    result = closeBrackets(truncated)
    if (result) return result
  }
  return null
}

function closeBrackets(s) {
  let open = 0, close = 0, openSq = 0, closeSq = 0
  for (const ch of s) {
    if (ch === '{') open++
    else if (ch === '}') close++
    else if (ch === '[') openSq++
    else if (ch === ']') closeSq++
  }
  let repaired = s
  for (let i = 0; i < openSq - closeSq; i++) repaired += ']'
  for (let i = 0; i < open - close; i++) repaired += '}'
  try { return JSON.parse(repaired) } catch (e) { return null }
}

// ============================================================
// 多轮对话策略：Round 1 - 分类规划 + 卡片分配到分类
// ============================================================
async function round1_PlanCategoriesAndAssign(cards) {
  const cardCount = cards.length
  console.log(`\n━━━ Round 1: 分类规划 + 卡片分配到分类 ━━━`)

  // 分批处理：每批 BATCH_SIZE 张
  const batches = []
  for (let i = 0; i < cardCount; i += BATCH_SIZE) {
    batches.push({ offset: i, cards: cards.slice(i, i + BATCH_SIZE) })
  }

  console.log(`   📦 分 ${batches.length} 批处理（每批 ${BATCH_SIZE} 张）`)

  // 第一批：让AI规划分类名 + 分配第一批卡片
  const firstBatch = batches[0]
  const firstCardLines = firstBatch.cards.map((c, i) => {
    const kp = String(c.kp || '').slice(0, 40)
    return `${firstBatch.offset + i}|${kp}`
  }).join('\n')
  // 动态生成示例索引
  const exampleIndices1 = firstBatch.cards.slice(0, Math.min(2, firstBatch.cards.length))
    .map((_, i) => firstBatch.offset + i).join(',')

  const prompt1 = `你是知识分类助手。请为以下卡片规划分类，并把每张卡片分配到一个分类。

【要求】：
1. 只创建 2-3 个分类，按大的学科领域归类（如"计算机基础"、"高等数学"）。
2. 分类名不超过 10 个字，不要把每张卡片当成一个分类。
3. 每张卡片必须分配到一个分类，不能遗漏。

【待分类卡片（共 ${firstBatch.cards.length} 张，下标从 ${firstBatch.offset} 开始）】：
${firstCardLines}

【输出格式】严格返回JSON，不要代码块：
{"categories":[{"name":"分类名","cardIndices":[${exampleIndices1}]}]}`

  const result1 = await callSparkLite(prompt1, { temperature: 0.3, max_tokens: 2048 })
  const parsed1 = parseJsonLoose(result1.content)
  if (!parsed1 || !Array.isArray(parsed1.categories)) {
    throw new Error('Round 1 第一批失败: ' + result1.content.slice(0, 200))
  }

  // 提取分类名
  const categoryNames = parsed1.categories.map(c => c.name)
  console.log(`   ✅ 第1批完成，AI规划分类：${categoryNames.join('、')}`)

  // 收集所有卡片分配结果
  const allCategories = parsed1.categories.map(c => ({
    name: c.name,
    cardIndices: [...(c.cardIndices || [])],
  }))

  // 后续批次：使用已确定的分类名，只做卡片分配
  for (let bi = 1; bi < batches.length; bi++) {
    const batch = batches[bi]
    const cardLines = batch.cards.map((c, i) => {
      const kp = String(c.kp || '').slice(0, 40)
      return `${batch.offset + i}|${kp}`
    }).join('\n')

    const prompt = `你是知识分类助手。请把以下卡片分配到已知的分类中。

【已知分类】：${categoryNames.join('、')}

【要求】：
1. 只能使用上述已知分类名，不要创建新分类。
2. 每张卡片必须分配到一个分类，不能遗漏。

【待分类卡片（共 ${batch.cards.length} 张，下标从 ${batch.offset} 开始）】：
${cardLines}

【输出格式】严格返回JSON，不要代码块：
{"categories":[{"name":"分类名","cardIndices":[${batch.offset}]}]}`

    const result = await callSparkLite(prompt, { temperature: 0.3, max_tokens: 2048 })
    const parsed = parseJsonLoose(result.content)
    if (!parsed || !Array.isArray(parsed.categories)) {
      console.warn(`   ⚠️ 第${bi + 1}批解析失败，跳过`)
      continue
    }

    // 合并到 allCategories
    for (const cat of parsed.categories) {
      const existing = allCategories.find(c => c.name === cat.name)
      if (existing) {
        existing.cardIndices.push(...(cat.cardIndices || []))
      } else {
        // AI 创建了新分类，添加进去
        allCategories.push({ name: cat.name, cardIndices: [...(cat.cardIndices || [])] })
        categoryNames.push(cat.name)
      }
    }
    console.log(`   ✅ 第${bi + 1}批完成`)
  }

  return { categories: allCategories }
}

// ============================================================
// 多轮对话策略：Round 2 - 每个分类内规划章节 + 卡片分配到章节
// ============================================================
async function round2_PlanChaptersAndAssign(cards, round1Result) {
  console.log(`\n━━━ Round 2: 每个分类内规划章节 + 卡片分配到章节 ━━━`)

  const result = { categories: [] }

  for (const cat of round1Result.categories) {
    const catCards = (cat.cardIndices || [])
      .filter(idx => idx >= 0 && idx < cards.length)
      .map(idx => ({ idx, card: cards[idx] }))

    if (catCards.length === 0) {
      console.warn(`   ⚠️ 分类"${cat.name}"没有卡片，跳过`)
      continue
    }

    console.log(`   📁 处理分类：${cat.name}（${catCards.length} 张卡片）`)

    // 分批处理
    const batches = []
    for (let i = 0; i < catCards.length; i += BATCH_SIZE) {
      batches.push(catCards.slice(i, i + BATCH_SIZE))
    }

    // 第一批：规划章节 + 分配
    const firstBatch = batches[0]
    const firstCardLines = firstBatch.map(c => `${c.idx}|${String(c.card.kp || '').slice(0, 40)}`).join('\n')
    const exampleChIndices = firstBatch.slice(0, Math.min(2, firstBatch.length)).map(c => c.idx).join(',')

    const prompt1 = `你是知识分类助手。请为以下"${cat.name}"分类的卡片规划章节，并把每张卡片分配到一个章节。

【要求】：
1. 只创建 1-3 个章节，按知识主题归类。
2. 章节名不超过 10 个字，不要把每张卡片当成一个章节。
3. 每张卡片必须分配到一个章节，不能遗漏。

【待分类卡片（共 ${firstBatch.length} 张）】：
${firstCardLines}

【输出格式】严格返回JSON，不要代码块：
{"chapters":[{"name":"章节名","cardIndices":[${exampleChIndices}]}]}`

    const result1 = await callSparkLite(prompt1, { temperature: 0.3, max_tokens: 2048 })
    const parsed1 = parseJsonLoose(result1.content)
    if (!parsed1 || !Array.isArray(parsed1.chapters)) {
      console.warn(`   ⚠️ 分类"${cat.name}"第1批章节规划失败，使用默认章节`)
      result.categories.push({
        name: cat.name,
        chapters: [{ name: cat.name + '基础', cardIndices: catCards.map(c => c.idx) }],
      })
      continue
    }

    const chapterNames = parsed1.chapters.map(c => c.name)
    console.log(`      ✅ 第1批完成，章节：${chapterNames.join('、')}`)

    const allChapters = parsed1.chapters.map(c => ({
      name: c.name,
      cardIndices: [...(c.cardIndices || [])],
    }))

    // 后续批次
    for (let bi = 1; bi < batches.length; bi++) {
      const batch = batches[bi]
      const cardLines = batch.map(c => `${c.idx}|${String(c.card.kp || '').slice(0, 40)}`).join('\n')

      const prompt = `你是知识分类助手。请把以下卡片分配到已知的章节中。

【已知章节】：${chapterNames.join('、')}

【要求】：
1. 只能使用上述已知章节名，不要创建新章节。
2. 每张卡片必须分配到一个章节，不能遗漏。

【待分类卡片（共 ${batch.length} 张）】：
${cardLines}

【输出格式】严格返回JSON，不要代码块：
{"chapters":[{"name":"章节名","cardIndices":[${batch[0].idx}]}]}`

      const res = await callSparkLite(prompt, { temperature: 0.3, max_tokens: 2048 })
      const parsed = parseJsonLoose(res.content)
      if (!parsed || !Array.isArray(parsed.chapters)) {
        console.warn(`      ⚠️ 第${bi + 1}批解析失败，跳过`)
        continue
      }

      for (const ch of parsed.chapters) {
        const existing = allChapters.find(c => c.name === ch.name)
        if (existing) {
          existing.cardIndices.push(...(ch.cardIndices || []))
        } else {
          allChapters.push({ name: ch.name, cardIndices: [...(ch.cardIndices || [])] })
          chapterNames.push(ch.name)
        }
      }
      console.log(`      ✅ 第${bi + 1}批完成`)
    }

    result.categories.push({ name: cat.name, chapters: allChapters })
  }

  return result
}

// ============================================================
// 多轮对话策略：Round 3 - 每个章节内规划单元 + 卡片分配到单元
// ============================================================
async function round3_PlanUnitsAndAssign(cards, round2Result) {
  console.log(`\n━━━ Round 3: 每个章节内规划单元 + 卡片分配到单元 ━━━`)

  const result = { categories: [] }

  for (const cat of round2Result.categories) {
    const catResult = { name: cat.name, chapters: [] }

    for (const ch of cat.chapters) {
      const chCards = (ch.cardIndices || [])
        .filter(idx => idx >= 0 && idx < cards.length)
        .map(idx => ({ idx, card: cards[idx] }))

      if (chCards.length === 0) {
        console.warn(`   ⚠️ 章节"${ch.name}"没有卡片，跳过`)
        continue
      }

      console.log(`   📂 处理章节：${cat.name} > ${ch.name}（${chCards.length} 张卡片）`)

      // 分批处理
      const batches = []
      for (let i = 0; i < chCards.length; i += BATCH_SIZE) {
        batches.push(chCards.slice(i, i + BATCH_SIZE))
      }

      // 第一批：规划单元 + 分配
      const firstBatch = batches[0]
      const firstCardLines = firstBatch.map(c => `${c.idx}|${String(c.card.kp || '').slice(0, 40)}`).join('\n')
      // 动态生成示例索引，避免访问不存在的元素
      const exampleIndices = firstBatch.slice(0, Math.min(2, firstBatch.length)).map(c => c.idx).join(',')

      const prompt1 = `你是知识分类助手。请为以下"${ch.name}"章节的卡片规划学习单元，并把每张卡片分配到一个单元。

【要求】：
1. 只创建 1-3 个单元，按知识点细分主题归类。
2. 单元名不超过 12 个字，必须是具体的知识主题名称（如"函数概念与性质"），不要用"单元名称"这种模板文字。
3. 每张卡片必须分配到一个单元，不能遗漏。

【待分类卡片（共 ${firstBatch.length} 张）】：
${firstCardLines}

【输出格式】严格返回JSON，不要代码块：
{"units":[{"name":"单元名","cardIndices":[${exampleIndices}]}]}`

      const result1 = await callSparkLite(prompt1, { temperature: 0.3, max_tokens: 2048 })
      const parsed1 = parseJsonLoose(result1.content)
      if (!parsed1 || !Array.isArray(parsed1.units)) {
        console.warn(`      ⚠️ 章节"${ch.name}"第1批单元规划失败，使用默认单元`)
        catResult.chapters.push({
          name: ch.name,
          units: [{ name: ch.name + '核心知识', cardIndices: chCards.map(c => c.idx) }],
        })
        continue
      }

      const unitNames = parsed1.units.map(u => u.name)
      console.log(`      ✅ 第1批完成，单元：${unitNames.join('、')}`)

      const allUnits = parsed1.units.map(u => ({
        name: u.name,
        cardIndices: [...(u.cardIndices || [])],
      }))

      // 后续批次
      for (let bi = 1; bi < batches.length; bi++) {
        const batch = batches[bi]
        const cardLines = batch.map(c => `${c.idx}|${String(c.card.kp || '').slice(0, 40)}`).join('\n')

        const prompt = `你是知识分类助手。请把以下卡片分配到已知的单元中。

【已知单元】：${unitNames.join('、')}

【要求】：
1. 只能使用上述已知单元名，不要创建新单元。
2. 每张卡片必须分配到一个单元，不能遗漏。

【待分类卡片（共 ${batch.length} 张）】：
${cardLines}

【输出格式】严格返回JSON，不要代码块：
{"units":[{"name":"单元名","cardIndices":[${batch[0].idx}]}]}`

        const res = await callSparkLite(prompt, { temperature: 0.3, max_tokens: 2048 })
        const parsed = parseJsonLoose(res.content)
        if (!parsed || !Array.isArray(parsed.units)) {
          console.warn(`      ⚠️ 第${bi + 1}批解析失败，跳过`)
          continue
        }

        for (const u of parsed.units) {
          const existing = allUnits.find(x => x.name === u.name)
          if (existing) {
            existing.cardIndices.push(...(u.cardIndices || []))
          } else {
            allUnits.push({ name: u.name, cardIndices: [...(u.cardIndices || [])] })
            unitNames.push(u.name)
          }
        }
        console.log(`      ✅ 第${bi + 1}批完成`)
      }

      catResult.chapters.push({ name: ch.name, units: allUnits })
    }

    result.categories.push(catResult)
  }

  return result
}

// ===== 字符串相似度 =====
function similarity(a, b) {
  const s1 = String(a || '').trim()
  const s2 = String(b || '').trim()
  if (s1 === s2) return 1.0
  if (!s1 || !s2) return 0
  const set1 = new Set(s1)
  const set2 = new Set(s2)
  let common = 0
  for (const ch of set1) {
    if (set2.has(ch)) common++
  }
  return common / Math.max(set1.size, set2.size)
}

// ===== 评估结果 =====
function evaluateAiResult(cards, aiResult) {
  const stats = {
    totalCards: cards.length,
    assignedCards: 0,
    missingCards: 0,
    duplicateCards: 0,
    categoryMatch: 0,
    chapterMatch: 0,
    unitMatch: 0,
    categorySimSum: 0,
    chapterSimSum: 0,
    unitSimSum: 0,
    mismatches: [],
  }

  const indexToAssignment = new Map()
  for (const cat of aiResult.categories || []) {
    for (const ch of cat.chapters || []) {
      for (const u of ch.units || []) {
        for (const idx of u.cardIndices || []) {
          if (indexToAssignment.has(idx)) {
            stats.duplicateCards++
          }
          indexToAssignment.set(idx, {
            category: cat.name,
            chapter: ch.name,
            unit: u.name,
          })
        }
      }
    }
  }

  for (let i = 0; i < cards.length; i++) {
    const expected = cards[i]
    const actual = indexToAssignment.get(i)
    if (!actual) {
      stats.missingCards++
      stats.mismatches.push({
        index: i,
        kp: expected.kp.slice(0, 50),
        expected: `${expected.expectedCategory} / ${expected.expectedChapter} / ${expected.expectedUnit}`,
        actual: '未分配',
      })
      continue
    }
    stats.assignedCards++

    const catSim = similarity(actual.category, expected.expectedCategory)
    const chSim = similarity(actual.chapter, expected.expectedChapter)
    const uSim = similarity(actual.unit, expected.expectedUnit)
    stats.categorySimSum += catSim
    stats.chapterSimSum += chSim
    stats.unitSimSum += uSim

    if (catSim >= 0.6) stats.categoryMatch++
    if (chSim >= 0.6) stats.chapterMatch++
    if (uSim >= 0.6) stats.unitMatch++

    if (uSim < 0.6) {
      stats.mismatches.push({
        index: i,
        kp: expected.kp.slice(0, 50),
        expected: `${expected.expectedCategory} / ${expected.expectedChapter} / ${expected.expectedUnit}`,
        actual: `${actual.category} / ${actual.chapter} / ${actual.unit}`,
      })
    }
  }

  return stats
}

// ===== 主测试流程 =====
async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  跨分类归类 AI 真实分类测试（多轮对话策略 + 分批优化）')
  console.log('  测试数据：90 张真实卡片（计算机基础 40 + 高等数学 50）')
  console.log('  优化策略：3轮对话 + 每批20张')
  console.log('═══════════════════════════════════════════════════\n')

  const cards = TEST_DATA.map((d, i) => ({ id: i, ...d }))
  console.log(`📋 测试数据：${cards.length} 张卡片`)
  console.log(`   - 计算机基础：${cards.filter(c => c.expectedCategory === '计算机基础').length} 张`)
  console.log(`   - 高等数学：${cards.filter(c => c.expectedCategory === '高等数学').length} 张`)
  console.log(`   - 批次大小：${BATCH_SIZE} 张/批`)

  const totalTimeStart = Date.now()

  // ===== Round 1: 分类规划 + 卡片分配到分类 =====
  const t1Start = Date.now()
  let round1Result
  try {
    round1Result = await round1_PlanCategoriesAndAssign(cards)
    console.log(`\n✅ Round 1 完成（耗时 ${((Date.now() - t1Start) / 1000).toFixed(1)}s）`)
    console.log(`   分类数：${round1Result.categories.length}`)
    for (const cat of round1Result.categories) {
      console.log(`   📁 ${cat.name}：${cat.cardIndices.length} 张`)
    }
  } catch (err) {
    console.error('❌ Round 1 失败:', err.message)
    process.exit(1)
  }

  // ===== Round 2: 章节规划 + 卡片分配到章节 =====
  const t2Start = Date.now()
  let round2Result
  try {
    round2Result = await round2_PlanChaptersAndAssign(cards, round1Result)
    console.log(`\n✅ Round 2 完成（耗时 ${((Date.now() - t2Start) / 1000).toFixed(1)}s）`)
    for (const cat of round2Result.categories) {
      console.log(`   📁 ${cat.name}：${cat.chapters.length} 个章节`)
      for (const ch of cat.chapters) {
        console.log(`      📂 ${ch.name}：${ch.cardIndices.length} 张`)
      }
    }
  } catch (err) {
    console.error('❌ Round 2 失败:', err.message)
    process.exit(1)
  }

  // ===== Round 3: 单元规划 + 卡片分配到单元 =====
  const t3Start = Date.now()
  let round3Result
  try {
    round3Result = await round3_PlanUnitsAndAssign(cards, round2Result)
    console.log(`\n✅ Round 3 完成（耗时 ${((Date.now() - t3Start) / 1000).toFixed(1)}s）`)
    for (const cat of round3Result.categories) {
      console.log(`   📁 ${cat.name}`)
      for (const ch of cat.chapters) {
        console.log(`      📂 ${ch.name}：${ch.units.length} 个单元`)
        for (const u of ch.units) {
          console.log(`         📄 ${u.name}：${u.cardIndices.length} 张`)
        }
      }
    }
  } catch (err) {
    console.error('❌ Round 3 失败:', err.message)
    process.exit(1)
  }

  const totalTime = ((Date.now() - totalTimeStart) / 1000).toFixed(1)

  // ===== 评估结果 =====
  console.log('\n━━━ 评估 AI 分类结果 ━━━')
  const stats = evaluateAiResult(cards, round3Result)

  console.log(`\n📊 分配覆盖统计：`)
  console.log(`   总卡片数：${stats.totalCards}`)
  console.log(`   已分配：${stats.assignedCards} (${(stats.assignedCards / stats.totalCards * 100).toFixed(1)}%)`)
  console.log(`   未分配：${stats.missingCards}`)
  console.log(`   重复分配：${stats.duplicateCards}`)

  console.log(`\n📊 分类准确率（相似度 ≥ 0.6 视为匹配）：`)
  console.log(`   分类匹配：${stats.categoryMatch}/${stats.totalCards} (${(stats.categoryMatch / stats.totalCards * 100).toFixed(1)}%)`)
  console.log(`   章节匹配：${stats.chapterMatch}/${stats.totalCards} (${(stats.chapterMatch / stats.totalCards * 100).toFixed(1)}%)`)
  console.log(`   单元匹配：${stats.unitMatch}/${stats.totalCards} (${(stats.unitMatch / stats.totalCards * 100).toFixed(1)}%)`)

  console.log(`\n📊 平均相似度：`)
  console.log(`   分类：${(stats.categorySimSum / stats.totalCards).toFixed(3)}`)
  console.log(`   章节：${(stats.chapterSimSum / stats.totalCards).toFixed(3)}`)
  console.log(`   单元：${(stats.unitSimSum / stats.totalCards).toFixed(3)}`)

  if (stats.mismatches.length > 0) {
    console.log(`\n⚠️ 不匹配卡片（前 10 个）：`)
    for (const m of stats.mismatches.slice(0, 10)) {
      console.log(`   卡${m.index}: ${m.kp}`)
      console.log(`      预期: ${m.expected}`)
      console.log(`      实际: ${m.actual}`)
    }
    if (stats.mismatches.length > 10) {
      console.log(`   ... 还有 ${stats.mismatches.length - 10} 个不匹配`)
    }
  }

  // ===== 测试结论 =====
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  测试结论（多轮对话策略 + 分批优化）')
  console.log('═══════════════════════════════════════════════════')
  const categoryAccuracy = stats.categoryMatch / stats.totalCards
  const unitAccuracy = stats.unitMatch / stats.totalCards
  const coverage = stats.assignedCards / stats.totalCards

  console.log(`\n✅ AI 语义分类能力验证：`)
  console.log(`   - 分类覆盖率：${(coverage * 100).toFixed(1)}% ${coverage >= 0.9 ? '✓ 完全覆盖' : coverage >= 0.7 ? '⚠ 良好' : '❌ 需优化'}`)
  console.log(`   - 分类准确率：${(categoryAccuracy * 100).toFixed(1)}% ${categoryAccuracy >= 0.9 ? '✓ 优秀' : categoryAccuracy >= 0.7 ? '⚠ 良好' : '❌ 需优化'}`)
  console.log(`   - 单元准确率：${(unitAccuracy * 100).toFixed(1)}% ${unitAccuracy >= 0.8 ? '✓ 优秀' : unitAccuracy >= 0.6 ? '⚠ 良好' : '❌ 需优化'}`)
  console.log(`   - 总耗时：${totalTime}s`)

  console.log(`\n💡 优化效果对比：`)
  console.log(`   优化前（单轮+40张/批）：分类 44.4%, 单元 0.0%, 耗时 34s`)
  console.log(`   优化后（3轮+20张/批）：分类 ${(categoryAccuracy * 100).toFixed(1)}%, 单元 ${(unitAccuracy * 100).toFixed(1)}%, 耗时 ${totalTime}s`)

  console.log(`\n📋 与本地关键词分类对比：`)
  console.log(`   - 本地关键词分类（v2脚本）：分类 100%, 单元 97.8%`)
  console.log(`   - AI 真实分类（优化后）：分类 ${(categoryAccuracy * 100).toFixed(1)}%, 单元 ${(unitAccuracy * 100).toFixed(1)}%`)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  测试完成')
  console.log('═══════════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
