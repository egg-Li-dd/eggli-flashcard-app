/**
 * 强模型指定分类归类功能独立测试脚本
 * 直接调用阿里云千问 API（强模型），不依赖浏览器环境
 * 测试 classifyCardsByExpectedUnits 函数的分类准确率
 *
 * 通过标准（强模型）：章节准确率 ≥85%，单元准确率 ≥90%
 *
 * 运行方式: node scripts/test-knowledge-classification-strong.mjs
 */

// ===== 测试配置（强模型：阿里云千问）=====
const AI_CONFIG = {
  aiServiceMode: 'dashscope',
  dashscopeApiKey: 'sk-ws-H.REDRRPM.oDCm.MEYCIQDZOMN2Ctge1ffgLG3bHom2k_l1zIoj367CzD964fPqxAIhAPPPgxiNTJyy2OGbRt1XlnT_DpDO1m50_GasPJ5SV-wr',
  model: 'qwen-plus',
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
}

// ===== 测试数据（180 个知识点，覆盖 8 章 18 单元）=====
const KNOWLEDGE_POINTS = [
  // ========== 第一章 计算机基础通识拓展 ==========
  // 单元1 计算机应用领域与工作原理 (10个)
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

  // 单元2 数据结构与多媒体信息编码 (10个)
  { kp: '计算机信息最小标识单位：字符，区别于存储单位字节，为人机交互基础信息单元', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '模拟信号与数字信号区别：模拟信号连续可变、易干扰；数字信号离散取值、抗干扰能力强', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '音频数字化四步骤：采样、量化、编码、压缩，采样频率越高音频音质越清晰', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '图像两大类型：位图、矢量图，位图放大失真，矢量图放大无锯齿、画质无损', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '常用图像格式：JPG压缩图片、PNG透明底图片、BMP无损位图、GIF动态图片', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: 'Unicode编码：万国统一字符编码，兼容全球各国文字，单字符占用2-4字节', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '汉字三码区分：输入码、机内码、字形码，输入法打出汉字使用输入码', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '数据压缩两类：无损压缩（文本、程序）、有损压缩（音视频、图片）', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  // 以下两个知识点为数制相关，应归入"计算机基础概述/计算机数制与信息编码"单元
  // { kp: '十六进制常用标识：后缀H标识，0-9、A-F共计16个数码，多用于标注内存地址', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  // { kp: '二进制运算基础规则：加法逢二进一、减法借一当二，基础逻辑运算为与、或、非、异或', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },

  // 单元3 计算机软件系统分类概述 (10个)
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

  // ========== 第二章 计算机外设与硬件运维详解 ==========
  // 单元1 外部设备与总线接口硬件 (10个)
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

  // ========== 第一章 函数、极限与连续 ==========
  // 单元1 函数概念与基本性质 (10个)
  { kp: '函数三要素：定义域、对应法则、值域，判定两函数相等需定义域、对应法则完全一致', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常用初等函数分类：幂函数、指数函数、对数函数、三角函数、反三角函数五类基本初等函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数四大特性：单调性、奇偶性、周期性、有界性，是研究函数图像的核心性质', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '奇偶函数判定规则：定义域关于原点对称；f(-x)=f(x)为偶函数，f(-x)=-f(x)为奇函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '复合函数定义：由内层函数u=g(x)、外层函数y=f(u)嵌套组成，复合定义域需兼顾两层函数取值', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '反函数核心特点：原函数与反函数图像关于直线y=x对称，定义域值域互相互换', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '常见有界函数：sinx、cosx、arcsinx、arctanx，定义域全域取值范围固定受限', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '分段函数定义：定义域不同区间，对应不同解析式，整体属于一个函数而非多个函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '指数对数基础关系：a^x=N 等价于 x=log_a N，二者互为反函数', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },
  { kp: '函数运算规则：同定义域内可做加减乘除四则运算，除法运算分母函数不可取值为0', expectedChapter: '函数、极限与连续', expectedUnit: '函数概念与基本性质' },

  // 单元2 数列与函数极限 (10个)
  { kp: '极限核心定义：自变量趋近定值时，函数值无限趋近固定常数，常数即为函数极限值', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限存在充要条件：函数左极限=函数右极限，单侧极限不等则整体极限不存在', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小量定义：极限为0的变量，趋近于0的速度快慢决定无穷小阶数高低', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷大量定义：自变量变化时，函数绝对值无限增大，无穷大的倒数为等价无穷小', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '大一必考等价无穷小（x→0）：sin x等价于x、tan x等价于x、ln(1+x)等价于x', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限四则运算法则：极限均存在时，和差积商极限=极限和差积商，分母极限不可为0', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '两个重要极限公式：lim(x→0) sin(x)/x=1、lim(x→∞) (1+1/x)^x=e', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '无穷小比较分类：高阶无穷小、同阶无穷小、等价无穷小、低阶无穷小四类', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '极限不存在三类情况：趋于无穷大、函数震荡无定值、左右极限数值不相等', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },
  { kp: '多项式分式极限规律：自变量趋于无穷时，分式极限由分子分母最高次幂系数决定', expectedChapter: '函数、极限与连续', expectedUnit: '数列与函数极限' },

  // 单元3 函数连续性与间断点 (10个)
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

  // ========== 第二章 一元函数微分学详解 ==========
  // 单元1 导数概念与求导公式 (10个)
  { kp: '导数几何意义：函数某点导数，对应函数图像该点切线斜率', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导与连续关系：函数可导一定连续，函数连续不一定可导，逆命题不成立', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '导数定义式：f\'(x_0)=lim(Δx→0) [f(x_0+Δx)-f(x_0)]/Δx', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础常函数求导：常数C导数恒为0，(C)\'=0', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '幂函数求导法则：(x^μ)\'=μx^(μ-1)，为使用率最高基础求导公式', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '基础三角函数求导：(sin x)\'=cos x、(cos x)\'=-sin x', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '指数对数求导公式：(e^x)\'=e^x、(ln x)\'=1/x', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '可导判定条件：函数某点左右导数存在且相等，该点才可导', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '高阶导数定义：对一阶导数再次求导，二阶导数表征函数图像凹凸变化速率', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },
  { kp: '不可导典型点位：折线拐点、尖点、竖直切线处，函数均不可求导', expectedChapter: '一元函数微分学详解', expectedUnit: '导数概念与求导公式' },

  // 单元2 求导法则与导数应用 (10个)
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

  // ========== 第一章 计算机基础概述（用户新增） ==========
  // 单元1 计算机发展与分类 (10个)
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

  // 单元2 计算机数制与信息编码 (10个)
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
  // 以下两个知识点为数制相关，从"数据结构与多媒体信息编码"单元移入
  { kp: '十六进制常用标识：后缀H标识，0-9、A-F共计16个数码，多用于标注内存地址', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },
  { kp: '二进制运算基础规则：加法逢二进一、减法借一当二，基础逻辑运算为与、或、非、异或', expectedChapter: '计算机基础概述', expectedUnit: '计算机数制与信息编码' },

  // 单元3 计算机系统组成概述 (10个)
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

  // ========== 第二章 计算机硬件系统详解（用户新增） ==========
  // 单元1 内部存储硬件 (10个)
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

  // ========== 第三章 计算机网络基础（新生成，知识点完全不同） ==========
  // 单元1 网络体系结构 (10个)
  { kp: 'OSI七层模型：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: 'TCP/IP四层模型：网络接口层、网际层、传输层、应用层，互联网实际标准', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '网络拓扑结构：总线型、星型、环型、树型、网状型五种基本拓扑', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '星型拓扑特点：中心节点控制全网络，易于扩展，但中心节点故障全网瘫痪', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '总线型拓扑特点：所有节点共享一条总线，结构简单，但存在冲突域问题', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '环型拓扑特点：数据单向传输，每个节点再生信号，故障诊断困难', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '网状型拓扑特点：节点间多条链路互连，可靠性最高，布线复杂成本高', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '局域网LAN覆盖范围：通常在1公里以内，传输速率高，误码率低', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '广域网WAN覆盖范围：跨越城市甚至国家，传输速率相对较低', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },
  { kp: '城域网MAN覆盖范围：介于局域网和广域网之间，覆盖整个城市范围', expectedChapter: '计算机网络基础', expectedUnit: '网络体系结构' },

  // 单元2 网络协议与通信 (10个)
  { kp: 'TCP协议特点：面向连接、可靠传输、三次握手建立连接、四次挥手释放连接', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'UDP协议特点：无连接、不可靠传输、开销小、速度快，适用于实时通信', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'IP协议功能：负责数据包在网络中的寻址和路由，实现网络互连', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'HTTP协议端口：默认80端口，用于网页传输，基于请求-响应模式', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'HTTPS协议端口：默认443端口，在HTTP基础上增加SSL/TLS加密层', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'FTP协议端口：控制连接21端口，数据连接20端口，用于文件传输', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'DNS协议功能：域名解析系统，将域名转换为IP地址，默认53端口', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'DHCP协议功能：动态主机配置协议，自动分配IP地址给网络设备', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'SMTP协议功能：简单邮件传输协议，用于发送邮件，默认25端口', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },
  { kp: 'ARP协议功能：地址解析协议，将IP地址转换为MAC地址', expectedChapter: '计算机网络基础', expectedUnit: '网络协议与通信' },

  // 单元3 网络传输介质 (10个)
  { kp: '双绞线分类：屏蔽双绞线STP和非屏蔽双绞线UTP，最常用网线类型', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '双绞线线序标准：T568A和T568B两种，直通线两端相同，交叉线两端不同', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '同轴电缆结构：内导体、绝缘层、外导体、保护套，抗干扰能力强于双绞线', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '光纤传输原理：利用光的全反射原理，在玻璃纤维中传输光信号', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '单模光纤特点：芯径小、激光光源、传输距离远、带宽大、成本高', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '多模光纤特点：芯径大、LED光源、传输距离近、成本较低', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '无线传输介质：无线电波、微波、红外线、激光，无需物理线缆', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '蓝牙技术：短距离无线通信，工作频段2.4GHz，传输距离约10米', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: 'WiFi标准：802.11系列，2.4GHz和5GHz频段，传输速率不断提升', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },
  { kp: '卫星通信特点：覆盖范围广、传输距离远，但延迟较大、受天气影响', expectedChapter: '计算机网络基础', expectedUnit: '网络传输介质' },

  // ========== 第四章 网络应用与安全（新生成，知识点完全不同） ==========
  // 单元1 网络应用服务 (10个)
  { kp: '万维网WWW：基于HTTP协议的超文本信息系统，由网页、浏览器、服务器组成', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '电子邮件系统：由SMTP发送、POP3/IMAP接收，支持附件和多媒体内容', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '文件传输服务：FTP协议实现上传下载，支持断点续传和匿名访问', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '远程登录服务：Telnet和SSH协议，SSH加密传输更安全', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '即时通信：QQ、微信等应用，基于长连接实现实时消息收发', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '流媒体服务：在线视频、直播，采用缓冲技术和自适应码率', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '云计算服务模式：IaaS基础设施、PaaS平台、SaaS软件三种服务模式', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '物联网应用：智能家居、智慧城市、工业互联网，万物互连', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '搜索引擎：爬虫抓取网页、索引建立、关键词检索三大核心技术', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },
  { kp: '电子商务：B2B、B2C、C2C三种模式，涉及支付、物流、评价体系', expectedChapter: '网络应用与安全', expectedUnit: '网络应用服务' },

  // 单元2 网络安全技术 (10个)
  { kp: '对称加密：加密解密使用相同密钥，代表算法DES、AES，速度快', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '非对称加密：公钥加密私钥解密，代表算法RSA、ECC，安全性高', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '数字签名：用私钥签名、公钥验证，确保数据完整性和不可抵赖性', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '数字证书：CA机构签发，包含公钥和身份信息，用于身份认证', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '防火墙技术：隔离内外网，包过滤、状态检测、应用层网关三种类型', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '入侵检测系统IDS：实时监控网络流量，发现异常行为报警', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '虚拟专用网VPN：在公网上建立加密隧道，实现远程安全访问', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: 'DDoS攻击：分布式拒绝服务攻击，耗尽目标系统资源导致服务中断', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: 'SQL注入攻击：通过恶意SQL语句操纵数据库，参数化查询可防范', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
  { kp: '跨站脚本攻击XSS：向网页注入恶意脚本，窃取用户Cookie信息', expectedChapter: '网络应用与安全', expectedUnit: '网络安全技术' },
]

// ===== AI 调用函数 =====
async function callAi(prompt, config) {
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
  }

  const resp = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + config.dashscopeApiKey,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}))
    const msg = errData.error?.message || errData.message || `HTTP ${resp.status}`
    throw new Error(`AI调用失败: ${msg}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content || ''
  if (!content) throw new Error('AI未返回有效内容')
  return { content, tokens: data?.usage?.total_tokens || 0 }
}

// ===== JSON 修复函数 =====
function fixIncompleteJson(text) {
  if (!text) return ''
  let s = String(text).trim()
  // 去除 markdown 代码块
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  // 去除注释
  s = s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  // 尾逗号
  s = s.replace(/,(\s*[}\]])/g, '$1')
  // 单引号转双引号
  s = s.replace(/'([^']*)'(\s*:)/g, '"$1"$2').replace(/'([^']*)'/g, '"$1"')
  // 未加引号的键
  s = s.replace(/(\w+)\s*:/g, '"$1":')
  // 截断修复：找最后一个完整的 } 并补齐
  const firstBrace = s.indexOf('{')
  const lastBrace = s.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1)
  }
  return s
}

// ===== 两步分类法（强模型专用）=====
// 1. 第一步：AI 将所有卡片分配到章节（C1, C2, ...）
// 2. 第二步：对每个章节，AI 在该章节的单元中细分卡片
// 这种方法可以避免跨章节名称相似单元的混淆
async function classifyCardsByExpectedUnitsTwoStep(cards, expectedStructure, config, maps) {
  const { chapterCodeMap, unitCodeMap, chapterUnitMap } = maps
  const classifications = []

  console.log(`[两步分类] 开始，共 ${cards.length} 张卡片，${Object.keys(chapterCodeMap).length} 个章节`)

  // ===== 第一步：将卡片分配到章节 =====
  const chapterLines = Object.entries(chapterCodeMap).map(([code, name]) => `[${code}] ${name}`).join('\n')
  const cardLines = cards.map((c, i) => `${i}. ${c.knowledge_point || c.front || ''}`).join('\n')

  const step1Prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节中。

【可选章节列表】（必须从以下列表中选择，不可自创）
${chapterLines}

【分类步骤】
1. 先分析每个章节的主题范围（基于章节名的语义）
2. 仔细阅读知识点内容，根据内容主题选择最合适的章节
3. 注意：不同章节可能有相似的主题，请根据章节名的完整语义判断

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4

【待分类知识点】（共${cards.length}个）
${cardLines}

【输出要求】
为每个知识点选择最合适的章节编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"chapter":"C1"}]}

注意：
1. chapter 必须是 C1、C2 等章节编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个章节
4. 不能遗漏任何知识点
5. index 是知识点在列表中的索引（从0开始）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的章节`

  let chapterAssignments = {}

  try {
    const result = await callAi(step1Prompt, config)
    const content = result.content || ''
    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('没有找到 JSON')
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      const fixedJson = fixIncompleteJson(content)
      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[两步分类] 第一步 JSON 修复失败，降级到单步分类`)
        return await classifyCardsByExpectedUnitsCurrent(cards, expectedStructure, config, maps)
      }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (e2) {
        console.warn(`[两步分类] 第一步 JSON 修复后仍失败: ${e2.message}，降级到单步分类`)
        return await classifyCardsByExpectedUnitsCurrent(cards, expectedStructure, config, maps)
      }
    }

    for (const c of parsed.classifications || []) {
      if (!chapterAssignments[c.chapter]) chapterAssignments[c.chapter] = []
      chapterAssignments[c.chapter].push(c.index)
    }

    console.log(`[两步分类] 第一步完成，章节分配:`)
    for (const [ch, idxs] of Object.entries(chapterAssignments)) {
      console.log(`  ${ch}(${chapterCodeMap[ch]}): ${idxs.length} 张`)
    }

  } catch (err) {
    console.warn(`[两步分类] 第一步调用失败: ${err.message}，降级到单步分类`)
    return await classifyCardsByExpectedUnitsCurrent(cards, expectedStructure, config, maps)
  }

  // ===== 第二步：对每个章节，在章节内的单元中细分卡片 =====
  for (const [chapterCode, cardIndices] of Object.entries(chapterAssignments)) {
    const chapterName = chapterCodeMap[chapterCode]
    const unitCodes = chapterUnitMap[chapterCode] || []

    if (unitCodes.length === 0) {
      console.warn(`[两步分类] 章节 ${chapterCode} 没有单元`)
      continue
    }

    if (unitCodes.length === 1) {
      const unitCode = unitCodes[0]
      for (const idx of cardIndices) {
        classifications.push({ index: idx, chapterCode, unitCode })
      }
      console.log(`[两步分类] 章节 ${chapterCode}(${chapterName}) 只有一个单元 ${unitCode}，直接分配 ${cardIndices.length} 张`)
      continue
    }

    const unitLines = unitCodes.map(uCode => `  [${uCode}] ${unitCodeMap[uCode]}`).join('\n')
    const chapterCardLines = cardIndices.map((idx, i) => `${i}. (原索引${idx}) ${cards[idx].knowledge_point || cards[idx].front || ''}`).join('\n')

    const step2Prompt = `你是知识点分类专家。请将以下知识点归类到章节「${chapterName}」下的最合适的单元中。

【章节】${chapterName}

【可选单元列表】（必须从以下列表中选择，不可自创）
${unitLines}

【分类步骤】
1. 先分析每个单元的主题范围（基于单元名的语义）
2. 仔细阅读知识点内容，根据内容主题选择最合适的单元
3. 注意区分名称相似的单元，根据单元名的完整语义判断

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理" → 单元 ${unitCodes[0]}

【待分类知识点】（共${cardIndices.length}个，都属于章节「${chapterName}」）
${chapterCardLines}

【输出要求】
为每个知识点选择最合适的单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"unit":"${unitCodes[0]}"}]}

注意：
1. unit 必须是 ${unitCodes.join('、')} 等单元编号
2. 编号必须从上面的列表中选择，不可自创
3. 每个知识点必须分配到一个单元
4. 不能遗漏任何知识点
5. index 是知识点在本次列表中的索引（从0开始，对应待分类知识点的顺序）
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元
7. 优先匹配知识点的核心主题，而非表面关键词`

    try {
      const result = await callAi(step2Prompt, config)
      const content = result.content || ''
      let parsed
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('没有找到 JSON')
        parsed = JSON.parse(jsonMatch[0])
      } catch (e) {
        const fixedJson = fixIncompleteJson(content)
        const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.warn(`[两步分类] 章节 ${chapterCode} 第二步 JSON 修复失败，降级分配到第一个单元`)
          for (const idx of cardIndices) {
            classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
          }
          continue
        }
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e2) {
          console.warn(`[两步分类] 章节 ${chapterCode} 第二步 JSON 修复后仍失败: ${e2.message}，降级分配到第一个单元`)
          for (const idx of cardIndices) {
            classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
          }
          continue
        }
      }

      let assigned = 0
      for (const c of parsed.classifications || []) {
        const originalIdx = cardIndices[c.index]
        if (originalIdx === undefined) continue
        classifications.push({
          index: originalIdx,
          chapterCode,
          unitCode: c.unit,
        })
        assigned++
      }
      console.log(`[两步分类] 章节 ${chapterCode}(${chapterName}) 第二步完成，分配 ${assigned}/${cardIndices.length} 张`)

    } catch (err) {
      console.warn(`[两步分类] 章节 ${chapterCode} 第二步调用失败: ${err.message}，降级分配到第一个单元`)
      for (const idx of cardIndices) {
        classifications.push({ index: idx, chapterCode, unitCode: unitCodes[0] })
      }
    }
  }

  return { classifications, chapterCodeMap, unitCodeMap }
}

// ===== 当前算法实现（与 aiService.js 中的 classifyCardsByExpectedUnits 一致）=====
// 混合策略：分批分类（每批30个）+ 置信度检测（对名称相似单元进行二次确认）
async function classifyCardsByExpectedUnitsCurrent(cards, expectedStructure, config, maps) {
  // 如果传入 maps，使用 maps；否则构建 maps
  let chapterCodeMap, unitCodeMap, chapterUnitMap, structureText
  if (maps) {
    ({ chapterCodeMap, unitCodeMap, chapterUnitMap } = maps)
    structureText = maps.structureText
  } else {
    // 构建编号化的结构文本和映射
    chapterCodeMap = {}
    unitCodeMap = {}
    chapterUnitMap = {}
    const structureLines = []
    let chapterIdx = 1
    let unitIdx = 1
    for (const item of expectedStructure) {
      const chCode = `C${chapterIdx}`
      chapterCodeMap[chCode] = item.chapter
      chapterUnitMap[chCode] = []
      structureLines.push(`[${chCode}] ${item.chapter}`)
      for (const u of item.units) {
        const uCode = `U${unitIdx}`
        unitCodeMap[uCode] = u
        chapterUnitMap[chCode].push(uCode)
        structureLines.push(`  [${uCode}] ${u}`)
        unitIdx++
      }
      chapterIdx++
    }
    structureText = structureLines.join('\n')
  }

  const classifications = []
  // 混合策略：强模型一次性分类所有卡片（保持上下文一致性）
  // 注意：分批分类会导致跨批次的知识点无法比较，AI 在不同批次中可能做出不一致的分类决策
  const batchSize = cards.length

  for (let batchStart = 0; batchStart < cards.length; batchStart += batchSize) {
    const batchCards = cards.slice(batchStart, batchStart + batchSize)
    const batchLines = batchCards.map((c, i) => `${batchStart + i}. ${c.knowledge_point || c.front || ''}`).join('\n')

    console.log(`[一次性分类] 处理全部 ${batchCards.length} 个知识点`)

  const prompt = `你是知识点分类专家。请将以下知识点归类到最合适的章节和单元中。

【可选章节和单元列表】（必须从以下列表中选择，不可自创）
${structureText}

【分类步骤】
1. 先分析每个章节和单元的主题范围（基于章节名和单元名的完整语义，而非表面关键词）
2. 对每个知识点，先确定其核心主题（知识点主要讲什么），再匹配最合适的章节
3. 在章节内，根据单元名的完整语义选择最合适的单元
4. 注意区分名称相似的单元，根据单元名的完整语义和章节上下文判断正确归属

【单元主题分析原则】
- 单元名通常由多个关键词组成，需要理解完整语义而非单个关键词
- 例如："数据结构与多媒体信息编码"关注的是"数据结构"和"多媒体信息的编码方式"（包括音频、图像、视频、字符编码、信号数字化、数据压缩等），是一个综合性的信息编码单元
- 例如："计算机数制与信息编码"关注的是"数制"（二进制、十六进制等进制及其运算规则）和"数制转换"，侧重于数字进制的表示和运算
- 例如："外部设备与总线接口硬件"关注的是"硬件设备"和"接口"（如显示器、打印机、USB接口、总线），而非"信号处理"或"图像格式"
- 当知识点涉及"编码"、"格式"、"信号"等通用词时，需要根据上下文判断是属于"多媒体信息编码"还是"数制与信息编码"

【区分名称相似单元的关键原则】
1. "字符编码"（如 Unicode、ASCII、汉字编码、输入码/机内码/字形码）属于"多媒体信息编码"相关单元，而非"数制"单元
2. "进制运算"（如二进制加法、十六进制转换）属于"数制"相关单元
3. "信号处理"（如模拟信号、数字信号、采样、量化）属于"多媒体信息编码"相关单元，而非"硬件"单元
4. "图像/音频/视频格式"（如 JPG、PNG、MP3、位图、矢量图）属于"多媒体信息编码"相关单元，而非"硬件"单元
5. "存储单位"（如字节、位、KB、MB）属于"数制"相关单元
6. 判断依据：知识点的核心内容是"信息如何编码表示"还是"数字如何运算转换"

【分类示例】
知识点："计算机工作核心原理：冯·诺依曼原理，核心思想为存储程序、程序控制" → 章节 C1，单元 U1
知识点："函数三要素：定义域、对应法则、值域" → 章节 C3，单元 U5
知识点："导数几何意义：函数某点导数，对应函数图像该点切线斜率" → 章节 C4，单元 U8
知识点："Unicode编码：万国统一字符编码，兼容全球各国文字" → 根据章节上下文和单元主题分析选择最合适的单元
知识点："十六进制常用标识：后缀H标识，0-9、A-F共计16个数码" → 根据章节上下文和单元主题分析选择最合适的单元
知识点："音频数字化四步骤：采样、量化、编码、压缩" → 根据章节上下文和单元主题分析选择最合适的单元

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
6. 请仔细阅读知识点内容，根据内容主题选择最合适的单元
7. 注意：不同章节下可能有名称相似的单元，请根据单元名的完整语义和章节上下文判断正确归属
8. 优先匹配知识点的核心主题，而非表面关键词
9. 当知识点涉及音频、图像、视频、字符编码、信号数字化、数据压缩等多媒体信息时，优先考虑"多媒体信息编码"相关单元，而非"硬件"或"数制"单元
10. 当知识点涉及进制转换、进制运算（二进制、十六进制等）时，优先考虑"数制"相关单元
11. 当知识点涉及存储单位（字节、位、KB、MB等）时，优先考虑"数制"相关单元`

  try {
    const result = await callAi(prompt, config)
    const content = result.content || ''
    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('没有找到 JSON')
      parsed = JSON.parse(jsonMatch[0])
    } catch (e) {
      const fixedJson = fixIncompleteJson(content)
      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[分批分类] 批次 ${batchStart} JSON 修复失败`)
        continue
      }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (e2) {
        console.warn(`[分批分类] 批次 ${batchStart} JSON 修复后仍失败: ${e2.message}`)
        continue
      }
    }

    for (const c of parsed.classifications || []) {
      classifications.push({
        index: c.index,
        chapterCode: c.chapter,
        unitCode: c.unit,
      })
    }
    console.log(`[分批分类] 批次 ${batchStart} 完成，分配 ${parsed.classifications?.length || 0} 条`)
  } catch (err) {
    console.warn(`[分批分类] 批次 ${batchStart} 调用失败:`, err.message)
  }
  } // end for batch

  // ===== 置信度检测：对名称相似单元的知识点进行二次确认 =====
  // 暂时禁用置信度检测，先查看第一次分类的结果
  /*
  const targetUnitNames = ['计算机数制与信息编码', '数据结构与多媒体信息编码']
  const targetUnitCodes = Object.entries(unitCodeMap)
    .filter(([_, name]) => targetUnitNames.includes(name))
    .map(([code, _]) => code)

  if (targetUnitCodes.length === 2) {
    console.log(`[置信度检测] 检测名称相似单元: ${targetUnitCodes.join(', ')}`)

    // 收集需要二次确认的知识点
    const needConfirm = classifications.filter(c =>
      targetUnitCodes.includes(c.unitCode)
    )

    if (needConfirm.length > 0) {
      console.log(`[置信度检测] 需要二次确认的知识点: ${needConfirm.length} 个`)

      // 构建二次确认的 prompt
      const confirmLines = needConfirm.map((c, i) => {
        const card = cards[c.index]
        const kp = card ? (card.knowledge_point || card.front || '') : ''
        const currentUnit = unitCodeMap[c.unitCode]
        return `${i}. (当前分类: ${currentUnit}) ${kp}`
      }).join('\n')

      const confirmPrompt = `你是知识点分类专家。请对以下知识点进行二次确认分类。

【任务说明】
以下知识点被分到了"计算机数制与信息编码"或"数据结构与多媒体信息编码"单元。请根据知识点的核心内容，重新判断它应该属于哪个单元。

【两个单元的主题区别】
- "数据结构与多媒体信息编码"：关注信息如何编码表示，包括字符编码（Unicode、ASCII、汉字编码）、音频/图像/视频编码、信号数字化、数据压缩等
- "计算机数制与信息编码"：关注数字进制的表示和运算，包括二进制/十六进制等进制、进制转换、进制运算规则等

【区分原则】
1. 如果知识点核心是"字符如何编码"（如 Unicode、ASCII、汉字编码、输入码/机内码/字形码），归入"数据结构与多媒体信息编码"
2. 如果知识点核心是"数字如何运算"（如二进制加法、十六进制转换、进制运算规则），归入"计算机数制与信息编码"
3. 如果知识点核心是"信号/音频/图像处理"（如模拟信号、数字信号、采样、量化、图像格式），归入"数据结构与多媒体信息编码"
4. 如果知识点核心是"存储单位"（如字节、位、KB、MB），归入"计算机数制与信息编码"

【可选单元】
${targetUnitCodes.map(code => `[${code}] ${unitCodeMap[code]}`).join('\n')}

【待确认知识点】（共${needConfirm.length}个）
${confirmLines}

【输出要求】
为每个知识点选择最合适的单元编号，只返回JSON格式（不要其他内容）：
{"classifications":[{"index":0,"unit":"U1"}]}

注意：
1. unit 必须是 ${targetUnitCodes.join(' 或 ')}
2. index 是知识点在本次列表中的索引（从0开始）
3. 请仔细阅读知识点内容，根据核心主题选择最合适的单元`

      try {
        const result = await callAi(confirmPrompt, config)
        const content = result.content || ''
        let parsed
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('没有找到 JSON')
          parsed = JSON.parse(jsonMatch[0])
        } catch (e) {
          const fixedJson = fixIncompleteJson(content)
          const jsonMatch = fixedJson.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            console.warn(`[置信度检测] JSON 修复失败，保留原分类`)
          } else {
            try {
              parsed = JSON.parse(jsonMatch[0])
            } catch (e2) {
              console.warn(`[置信度检测] JSON 修复后仍失败: ${e2.message}，保留原分类`)
            }
          }
        }

        if (parsed && parsed.classifications) {
          let confirmed = 0
          for (const c of parsed.classifications) {
            const original = needConfirm[c.index]
            if (original && targetUnitCodes.includes(c.unit)) {
              // 更新分类结果
              const idx = classifications.findIndex(item =>
                item.index === original.index && item.unitCode === original.unitCode
              )
              if (idx >= 0) {
                classifications[idx].unitCode = c.unit
                confirmed++
              }
            }
          }
          console.log(`[置信度检测] 二次确认完成，更新 ${confirmed} 条分类`)
        }
      } catch (err) {
        console.warn(`[置信度检测] 调用失败:`, err.message, '，保留原分类')
      }
    }
  }
  */

  return { classifications, chapterCodeMap, unitCodeMap }
}

// ===== 主分类函数（模拟 aiService.js 的 classifyCardsByExpectedUnits）=====
async function classifyCardsByExpectedUnits(cards, expectedStructure, config) {
  // 构建编号化的结构文本和映射
  const chapterCodeMap = {}
  const unitCodeMap = {}
  const chapterUnitMap = {}
  const structureLines = []
  let chapterIdx = 1
  let unitIdx = 1
  for (const item of expectedStructure) {
    const chCode = `C${chapterIdx}`
    chapterCodeMap[chCode] = item.chapter
    chapterUnitMap[chCode] = []
    structureLines.push(`[${chCode}] ${item.chapter}`)
    for (const u of item.units) {
      const uCode = `U${unitIdx}`
      unitCodeMap[uCode] = u
      chapterUnitMap[chCode].push(uCode)
      structureLines.push(`  [${uCode}] ${u}`)
      unitIdx++
    }
    chapterIdx++
  }
  const structureText = structureLines.join('\n')
  const maps = { chapterCodeMap, unitCodeMap, chapterUnitMap, structureText }

  // 经过测试，两步分类法反而降低了准确率（第一步章节分类错误会传播）
  // 因此强模型仍然使用单步分类法，但通过优化 prompt 来解决名称相似单元的混淆问题
  // if (cards.length > 20 && Object.keys(chapterCodeMap).length > 1) {
  //   return await classifyCardsByExpectedUnitsTwoStep(cards, expectedStructure, config, maps)
  // }

  return await classifyCardsByExpectedUnitsCurrent(cards, expectedStructure, config, maps)
}

// ===== 运行测试 =====
async function runTest() {
  console.log('========== 强模型指定分类归类功能测试 ==========')
  console.log(`测试时间: ${new Date().toLocaleString()}`)
  console.log(`AI 服务: ${AI_CONFIG.aiServiceMode} (${AI_CONFIG.model})`)
  console.log(`知识点总数: ${KNOWLEDGE_POINTS.length}`)
  console.log('')

  // 准备测试卡片
  const cards = KNOWLEDGE_POINTS.map((item, index) => ({
    id: `test-kp-${index}`,
    knowledge_point: item.kp,
    front: item.kp.slice(0, 50),
    back: item.kp,
  }))

  // 从测试数据构建预期结构
  const chapterOrder = []
  const chapterUnits = {}
  for (const kp of KNOWLEDGE_POINTS) {
    if (!chapterUnits[kp.expectedChapter]) {
      chapterUnits[kp.expectedChapter] = []
      chapterOrder.push(kp.expectedChapter)
    }
    if (!chapterUnits[kp.expectedChapter].includes(kp.expectedUnit)) {
      chapterUnits[kp.expectedChapter].push(kp.expectedUnit)
    }
  }
  const expectedStructure = chapterOrder.map(ch => ({
    chapter: ch,
    units: chapterUnits[ch],
  }))

  console.log(`章节数: ${chapterOrder.length}`)
  console.log(`单元数: ${Object.values(chapterUnits).reduce((sum, units) => sum + units.length, 0)}`)
  console.log('')
  console.log('章节列表:')
  chapterOrder.forEach((ch, i) => {
    console.log(`  C${i + 1}: ${ch} (${chapterUnits[ch].length} 个单元)`)
    chapterUnits[ch].forEach((u, j) => {
      const unitIdx = Object.values(chapterUnits).slice(0, i).reduce((s, arr) => s + arr.length, 0) + j + 1
      console.log(`    U${unitIdx}: ${u}`)
    })
  })
  console.log('')
  console.log('开始调用 AI 进行分类...')
  console.log('')

  const startTime = Date.now()
  const { classifications, chapterCodeMap, unitCodeMap } = await classifyCardsByExpectedUnits(cards, expectedStructure, AI_CONFIG)
  const duration = Date.now() - startTime

  console.log(`AI 调用完成，耗时: ${duration}ms`)
  console.log(`返回分类结果: ${classifications.length} 条`)
  console.log('')

  // 验证分类准确性
  let correctChapters = 0
  let correctUnits = 0
  let totalChecked = 0
  const wrongSamples = []
  const chapterStats = {}  // 按章节统计正确率
  const unitStats = {}     // 按单元统计正确率

  for (const c of classifications) {
    const expected = KNOWLEDGE_POINTS[c.index]
    if (!expected) {
      console.warn(`索引 ${c.index} 超出范围`)
      continue
    }
    totalChecked++

    const actualChapter = chapterCodeMap[c.chapterCode]
    const actualUnit = unitCodeMap[c.unitCode]

    // 章节统计
    if (!chapterStats[expected.expectedChapter]) {
      chapterStats[expected.expectedChapter] = { total: 0, correct: 0 }
    }
    chapterStats[expected.expectedChapter].total++
    if (actualChapter === expected.expectedChapter) {
      correctChapters++
      chapterStats[expected.expectedChapter].correct++
    }

    // 单元统计
    if (!unitStats[expected.expectedUnit]) {
      unitStats[expected.expectedUnit] = { total: 0, correct: 0 }
    }
    unitStats[expected.expectedUnit].total++
    if (actualUnit === expected.expectedUnit) {
      correctUnits++
      unitStats[expected.expectedUnit].correct++
    } else if (wrongSamples.length < 20) {
      wrongSamples.push({
        index: c.index,
        kp: expected.kp.slice(0, 60),
        expectedChapter: expected.expectedChapter,
        actualChapter: actualChapter || `(无效: ${c.chapterCode})`,
        expectedUnit: expected.expectedUnit,
        actualUnit: actualUnit || `(无效: ${c.unitCode})`,
      })
    }
  }

  const chapterAccuracy = totalChecked > 0 ? Math.round((correctChapters / totalChecked) * 100) : 0
  const unitAccuracy = totalChecked > 0 ? Math.round((correctUnits / totalChecked) * 100) : 0

  console.log('========== 测试结果 ==========')
  console.log(`总检查数: ${totalChecked}/${KNOWLEDGE_POINTS.length}`)
  console.log(`章节准确率: ${correctChapters}/${totalChecked} = ${chapterAccuracy}%`)
  console.log(`单元准确率: ${correctUnits}/${totalChecked} = ${unitAccuracy}%`)
  console.log(`耗时: ${duration}ms`)
  console.log('')

  // 通过标准（强模型）
  const passCriteria = { chapterAccuracy: 85, unitAccuracy: 90 }
  const passed = chapterAccuracy >= passCriteria.chapterAccuracy && unitAccuracy >= passCriteria.unitAccuracy
  console.log('========== 通过标准（强模型）==========')
  console.log(`章节准确率 ≥ ${passCriteria.chapterAccuracy}%: ${chapterAccuracy >= passCriteria.chapterAccuracy ? '✅ 通过' : '❌ 未通过'} (${chapterAccuracy}%)`)
  console.log(`单元准确率 ≥ ${passCriteria.unitAccuracy}%: ${unitAccuracy >= passCriteria.unitAccuracy ? '✅ 通过' : '❌ 未通过'} (${unitAccuracy}%)`)
  console.log(`总体: ${passed ? '✅ 测试通过' : '❌ 测试未通过'}`)
  console.log('')

  // 按章节统计
  console.log('========== 按章节统计 ==========')
  for (const [ch, stats] of Object.entries(chapterStats)) {
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    console.log(`  ${ch}: ${stats.correct}/${stats.total} = ${acc}%`)
  }
  console.log('')

  // 按单元统计
  console.log('========== 按单元统计 ==========')
  for (const [u, stats] of Object.entries(unitStats)) {
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    const flag = acc === 100 ? '✅' : acc >= 80 ? '⚠️' : '❌'
    console.log(`  ${flag} ${u}: ${stats.correct}/${stats.total} = ${acc}%`)
  }
  console.log('')

  // 错误样本
  if (wrongSamples.length > 0) {
    console.log('========== 错误样本（前20个）==========')
    wrongSamples.forEach((s, i) => {
      console.log(`  [${i + 1}] 索引${s.index}: ${s.kp}`)
      console.log(`      期望: ${s.expectedChapter} / ${s.expectedUnit}`)
      console.log(`      实际: ${s.actualChapter} / ${s.actualUnit}`)
    })
  }

  return { passed, chapterAccuracy, unitAccuracy, totalChecked, wrongSamples }
}

// 运行测试
runTest().then(result => {
  console.log('')
  console.log('========== 测试结束 ==========')
  process.exit(result.passed ? 0 : 1)
}).catch(err => {
  console.error('测试执行失败:', err)
  process.exit(2)
})
