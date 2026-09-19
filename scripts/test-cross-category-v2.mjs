/**
 * 跨分类归类逻辑测试 V2（使用用户提供的真实数据）
 * 测试数据：计算机基础（40张）+ 高等数学（40张）= 80张卡片
 *
 * 运行：node scripts/test-cross-category-v2.mjs
 */

// ===== 测试数据集（用户提供）=====
const TEST_DATA = [
  // ===== 分类1：计算机基础（40张）=====
  // 第一章 单元1 计算机应用领域与工作原理
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

  // 第一章 单元2 数据结构与多媒体信息编码
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

  // 第一章 单元3 计算机软件系统分类概述
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

  // 第二章 单元1 外部设备与总线接口硬件
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

  // ===== 分类2：高等数学（40张）=====
  // 第一章 单元1 函数概念与基本性质
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

  // 第一章 单元2 数列与函数极限
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

  // 第一章 单元3 函数连续性与间断点
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

  // 第二章 单元1 导数概念与求导公式
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

  // 第二章 单元2 求导法则与导数应用
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

// ===== 关键词映射 =====
const CATEGORY_KEYWORDS = {
  '计算机基础': [
    '冯·诺依曼', '存储程序', '程序控制', '计算机', '人工智能', '模式识别', '机器翻译', '智能决策',
    '机器人', '自然语言处理', 'CAD', 'CAM', 'CAI', 'CAT', '计算机辅助', '实时控制', '分布式',
    '专用计算机', '取指令', '多媒体', '信息安全', '保密性', '完整性', '可用性', '字符',
    '模拟信号', '数字信号', '音频', '采样', '量化', '编码', '压缩', '位图', '矢量图',
    'JPG', 'PNG', 'BMP', 'GIF', 'Unicode', '汉字', '输入码', '机内码', '字形码',
    '十六进制', '二进制', '系统软件', '应用软件', '操作系统', '语言处理', '数据库管理',
    '程序设计语言', '机器语言', '汇编语言', '高级语言', '编译程序', '解释程序',
    '软件授权', '商用', '共享', '开源', '专属', '进程与程序', '静态代码', '动态执行',
    '总线', 'USB', 'Type-C', 'HDMI', 'RJ45', '触控板', '数位板', '轨迹球', '手写笔',
    '扫码器', '高拍仪', '扫描仪', '显示器', '分辨率', '刷新率', '色域', 'LCD', 'OLED', 'LED',
    '打印机', '喷墨', '激光', '针式', '无线网卡', '蓝牙', 'WiFi', '散热器', '风冷', '水冷',
    '主板', '拓展坞', '外设', '硬件', '原生接口',
  ],
  '高等数学': [
    '函数', '定义域', '值域', '对应法则', '幂函数', '指数函数', '对数函数', '三角函数', '反三角函数',
    '单调性', '奇偶性', '周期性', '有界性', '偶函数', '奇函数', '复合函数', '反函数',
    '有界函数', 'sinx', 'cosx', 'arcsinx', 'arctanx', '分段函数', '极限', '无穷小', '无穷大',
    '等价无穷小', '左极限', '右极限', '洛必达法则', '连续', '间断点', '可去间断点', '跳跃间断点',
    '无穷间断点', '震荡间断点', '最值定理', '零点定理', '介值定理', '导数', '切线', '可导',
    '求导', '链式求导', '隐函数', '参数方程', '极值', '凹凸性', '拐点', '微分',
    '高阶导数', '二阶导数', '一阶导数', '多项式', '初等函数', '单调递增', '单调递减',
  ],
}

const CHAPTER_KEYWORDS = {
  '计算机基础通识拓展': [
    '冯·诺依曼', '存储程序', '人工智能', '模式识别', 'CAD', 'CAM', '实时控制', '分布式',
    '多媒体', '信息安全', '字符', '模拟信号', '数字信号', '音频', '位图', '矢量图',
    'Unicode', '汉字', '编码', '系统软件', '应用软件', '操作系统', '程序设计语言',
    '软件授权', '商用', '共享', '开源', '专属', '进程与程序', '静态代码', '动态执行',
  ],
  '计算机外设与硬件运维详解': [
    '总线', 'USB', 'HDMI', 'RJ45', '触控板', '数位板', '扫描仪', '显示器', '分辨率',
    '刷新率', 'LCD', 'OLED', '打印机', '喷墨', '激光', '针式', '无线网卡', '蓝牙',
    'WiFi', '散热器', '风冷', '水冷', '主板', '外设', '拓展坞', '原生接口',
  ],
  '函数、极限与连续': [
    '定义域', '值域', '幂函数', '指数函数', '对数函数', '三角函数', '单调性',
    '奇偶性', '复合函数', '反函数', '极限', '无穷小', '无穷大', '等价无穷小',
    '连续性', '间断点', '最值定理', '零点定理', '介值定理',
  ],
  '一元函数微分学详解': [
    '导数', '切线', '可导', '求导', '链式求导', '隐函数', '参数方程', '洛必达法则',
    '极值', '凹凸性', '拐点', '微分', '二阶导数', '高阶导数', '一阶导数',
    '单调递增', '单调递减', '函数单调性', '函数可导', '函数连续',
  ],
}

const UNIT_KEYWORDS = {
  '计算机应用领域与工作原理': [
    '冯·诺依曼', '存储程序', '程序控制', '人工智能', '模式识别', '机器翻译', '智能决策',
    '机器人', '自然语言处理', 'CAD', 'CAM', 'CAI', 'CAT', '计算机辅助', '实时控制',
    '分布式', '专用计算机', '取指令', '多媒体', '信息安全',
  ],
  '数据结构与多媒体信息编码': [
    '字符', '模拟信号', '数字信号', '音频', '采样', '量化', '编码', '压缩', '位图',
    '矢量图', 'JPG', 'PNG', 'BMP', 'GIF', 'Unicode', '汉字', '输入码', '机内码',
    '字形码', '十六进制', '二进制',
  ],
  '计算机软件系统分类概述': [
    '系统软件', '应用软件', '操作系统', '语言处理', '数据库管理', '程序设计语言',
    '机器语言', '汇编语言', '高级语言', '编译程序', '解释程序', '软件授权', '商用',
    '共享', '开源', '专属', '进程与程序', '静态代码', '动态执行',
  ],
  '外部设备与总线接口硬件': [
    '总线', 'USB', 'Type-C', 'HDMI', 'RJ45', '触控板', '数位板', '轨迹球', '手写笔',
    '扫码器', '高拍仪', '扫描仪', '显示器', '分辨率', '刷新率', 'LCD', 'OLED',
    '打印机', '喷墨', '激光', '针式', '无线网卡', '蓝牙', 'WiFi', '散热器', '风冷', '水冷',
    '外设连接', '原生接口', '拓展坞', '主板',
  ],
  '函数概念与基本性质': [
    '函数三要素', '定义域', '值域', '对应法则', '幂函数', '指数函数', '对数函数', '三角函数',
    '反三角函数', '单调性', '奇偶性', '周期性', '有界性', '偶函数', '奇函数',
    '复合函数', '反函数', '有界函数', '分段函数', '初等函数',
  ],
  '数列与函数极限': [
    '极限', '无穷小', '无穷大', '等价无穷小', '左极限', '右极限', '极限四则运算',
    '重要极限', '无穷小比较', '多项式分式', '极限不存在',
  ],
  '函数连续性与间断点': [
    '连续', '间断点', '可去间断点', '跳跃间断点', '无穷间断点', '震荡间断点',
    '最值定理', '零点定理', '介值定理', '连续函数运算', '连续三大条件', '极限值',
    '初等函数连续', '可去间断点修复',
  ],
  '导数概念与求导公式': [
    '导数几何意义', '切线斜率', '可导与连续', '导数定义式', '常函数求导', '幂函数求导',
    '三角函数求导', '指数对数求导', '高阶导数定义', '不可导', '折线拐点', '尖点',
    '竖直切线', '左右导数', '一阶导数', '二阶导数', '高阶导数', '基础求导',
  ],
  '求导法则与导数应用': [
    '求导法则', '链式求导', '隐函数求导', '参数方程求导', '洛必达法则',
    '单调性判定', '极值', '凹凸性', '拐点', '微分', '单调递增', '单调递减',
    '极值第一判定', '极大值', '极小值', '由正变负', '由负变正',
    '凹凸性判定', '微分核心公式', '函数单调性',
  ],
}

// ===== 分类→章节→单元层级映射 =====
const CATEGORY_CHAPTERS = {
  '计算机基础': ['计算机基础通识拓展', '计算机外设与硬件运维详解'],
  '高等数学': ['函数、极限与连续', '一元函数微分学详解'],
}

const CHAPTER_UNITS = {
  '计算机基础通识拓展': ['计算机应用领域与工作原理', '数据结构与多媒体信息编码', '计算机软件系统分类概述'],
  '计算机外设与硬件运维详解': ['外部设备与总线接口硬件'],
  '函数、极限与连续': ['函数概念与基本性质', '数列与函数极限', '函数连续性与间断点'],
  '一元函数微分学详解': ['导数概念与求导公式', '求导法则与导数应用'],
}

// ===== 工具函数 =====
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
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length)
  let tempText = text
  for (const kw of sortedKeywords) {
    const kwLower = kw.toLowerCase()
    let idx = tempText.indexOf(kwLower)
    while (idx !== -1) {
      score += kw.length * weight
      tempText = tempText.substring(0, idx) + ' '.repeat(kwLower.length) + tempText.substring(idx + kwLower.length)
      idx = tempText.indexOf(kwLower)
    }
  }
  return score
}

function classifyCardLocal(kp) {
  const text = String(kp || '').toLowerCase()

  // 1. 计算分类得分
  const categoryScores = {}
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    categoryScores[category] = calculateKeywordScore(text, CATEGORY_KEYWORDS[category], 2)
  }

  const sortedCategories = Object.entries(categoryScores).sort((a, b) => b[1] - a[1])
  const bestCategory = sortedCategories[0]

  if (!bestCategory || bestCategory[1] === 0) {
    return { category: '未归类', chapter: '未归类', unit: '未归类', score: 0 }
  }

  // 2. 计算章节得分（只考虑最佳分类下的章节）
  const allowedChapters = CATEGORY_CHAPTERS[bestCategory[0]] || []
  const chapterScores = {}
  for (const chapter of allowedChapters) {
    if (CHAPTER_KEYWORDS[chapter]) {
      chapterScores[chapter] = calculateKeywordScore(text, CHAPTER_KEYWORDS[chapter], 2)
    }
  }

  const sortedChapters = Object.entries(chapterScores).sort((a, b) => b[1] - a[1])
  const bestChapter = sortedChapters[0]

  // 3. 计算单元得分（只考虑最佳章节下的单元）
  const allowedUnits = (bestChapter && CHAPTER_UNITS[bestChapter[0]]) || []
  const unitScores = {}
  for (const unit of allowedUnits) {
    if (UNIT_KEYWORDS[unit]) {
      unitScores[unit] = calculateKeywordScore(text, UNIT_KEYWORDS[unit], 3)
    }
  }

  const sortedUnits = Object.entries(unitScores).sort((a, b) => b[1] - a[1])
  const bestUnit = sortedUnits[0]

  // 调试输出
  if (global.debugClassify) {
    console.log('  [DEBUG] 文本:', text.slice(0, 50))
    console.log('  [DEBUG] 最佳分类:', bestCategory[0], '=', bestCategory[1])
    console.log('  [DEBUG] 章节得分:', sortedChapters.map(s => `${s[0]}=${s[1]}`).join(', '))
    console.log('  [DEBUG] 单元得分:', sortedUnits.map(s => `${s[0]}=${s[1]}`).join(', '))
  }

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
    wrongCards: [],
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
                const catOk = isNameMatch(cat.name, expected.expectedCategory)
                const chOk = isNameMatch(ch.name, expected.expectedChapter)
                const uOk = isNameMatch(u.name, expected.expectedUnit)
                if (catOk) stats.correctCategories++
                if (chOk) stats.correctChapters++
                if (uOk) stats.correctUnits++
                if (!catOk || !uOk) {
                  stats.wrongCards.push({
                    idx: cardIdx,
                    content: (card.kp || card.knowledge_point || '').slice(0, 60),
                    expected: `${expected.expectedCategory}>${expected.expectedChapter}>${expected.expectedUnit}`,
                    actual: `${cat.name}>${ch.name}>${u.name}`,
                  })
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
  console.log('  跨分类归类逻辑测试 V2（用户真实数据）')
  console.log(sep)
  console.log('  测试数据：80 张卡片，2 个分类（计算机基础40张/高等数学40张）')
  console.log('  测试模式：本地模拟（最长匹配优先关键词分类器）+ 数据打乱')
  console.log(sep)

  // 开启调试模式，分析错误卡片
  global.debugClassify = true

  // 先对已知错误的卡片进行调试
  console.log('\n[调试] 分析已知错误卡片:')
  const debugIndices = [28, 29, 39, 60, 83, 85, 86]
  for (const idx of debugIndices) {
    if (idx < TEST_DATA.length) {
      const card = TEST_DATA[idx]
      console.log(`\n  卡片 #${idx}:`)
      console.log(`    内容: ${card.kp.slice(0, 80)}...`)
      console.log(`    期望: ${card.expectedCategory}>${card.expectedChapter}>${card.expectedUnit}`)
      const result = classifyCardLocal(card.kp)
      console.log(`    实际: ${result.category}>${result.chapter}>${result.unit}`)
    }
  }

  global.debugClassify = false

  let passed = 0
  let total = 0

  // ---- 测试 1：基础分类测试（不打乱）----
  console.log('\n[测试 1] 基础分类测试（不打乱，全部80张）')
  total++
  const cards1 = TEST_DATA.map((d, i) => ({ ...d, _testIdx: i }))
  const result1 = localSimulationClassify(cards1)
  const stats1 = evaluateResult(result1, TEST_DATA)
  console.log('  - 分类数:', stats1.categoryCount, '(期望 2)')
  console.log('  - 章节数:', stats1.chapterCount, '(期望 4)')
  console.log('  - 单元数:', stats1.unitCount, '(期望 9)')
  console.log('  - 已分配:', stats1.assignedCards + '/' + stats1.totalCards)
  console.log('  - 缺失:', stats1.missingCards, '  重复:', stats1.duplicateCards)
  console.log('  - 分类准确率:', stats1.categoryAccuracy + '%')
  console.log('  - 章节准确率:', stats1.chapterAccuracy + '%')
  console.log('  - 单元准确率:', stats1.unitAccuracy + '%')
  if (stats1.wrongCards.length > 0 && stats1.wrongCards.length <= 10) {
    console.log('  - 错误卡片详情:')
    stats1.wrongCards.forEach(w => {
      console.log(`    #${w.idx}: 期望[${w.expected}] 实际[${w.actual}]`)
      console.log(`      内容: ${w.content}...`)
    })
  }
  if (stats1.missingCards === 0 && stats1.duplicateCards === 0 &&
      parseFloat(stats1.categoryAccuracy) >= 95 && parseFloat(stats1.unitAccuracy) >= 80) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 2：打乱后分类测试 ----
  console.log('\n[测试 2] 打乱后分类测试（全部80张）')
  total++
  const shuffled = shuffleArray(TEST_DATA)
  const cards2 = shuffled.map((d, i) => ({ ...d, _testIdx: TEST_DATA.indexOf(d) }))
  const result2 = localSimulationClassify(cards2)
  const stats2 = evaluateResult(result2, TEST_DATA)
  console.log('  - 分类数:', stats2.categoryCount, '(期望 2)')
  console.log('  - 已分配:', stats2.assignedCards + '/' + stats2.totalCards)
  console.log('  - 缺失:', stats2.missingCards, '  重复:', stats2.duplicateCards)
  console.log('  - 分类准确率:', stats2.categoryAccuracy + '%')
  console.log('  - 章节准确率:', stats2.chapterAccuracy + '%')
  console.log('  - 单元准确率:', stats2.unitAccuracy + '%')
  if (stats2.wrongCards.length > 0 && stats2.wrongCards.length <= 10) {
    console.log('  - 错误卡片详情:')
    stats2.wrongCards.forEach(w => {
      console.log(`    #${w.idx}: 期望[${w.expected}] 实际[${w.actual}]`)
      console.log(`      内容: ${w.content}...`)
    })
  }
  if (stats2.missingCards === 0 && stats2.duplicateCards === 0 &&
      parseFloat(stats2.categoryAccuracy) >= 95 && parseFloat(stats2.unitAccuracy) >= 80) {
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
    const shuffledRound = shuffleArray(TEST_DATA)
    const cardsRound = shuffledRound.map((d, i) => ({ ...d, _testIdx: TEST_DATA.indexOf(d) }))
    const resultRound = localSimulationClassify(cardsRound)
    const statsRound = evaluateResult(resultRound, TEST_DATA)
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

  // ---- 测试 4：随机抽取部分数据测试 ----
  console.log('\n[测试 4] 随机抽取部分数据测试（抽取30张）')
  total++
  const sampleSize = 30
  const sampledIndices = []
  const tempIndices = [...Array(TEST_DATA.length).keys()]
  for (let i = 0; i < sampleSize; i++) {
    const randIdx = Math.floor(Math.random() * tempIndices.length)
    sampledIndices.push(tempIndices.splice(randIdx, 1)[0])
  }
  const sampledData = sampledIndices.map(i => TEST_DATA[i])
  const cards4 = sampledData.map((d, i) => ({ ...d, _testIdx: TEST_DATA.indexOf(d) }))
  const result4 = localSimulationClassify(cards4)
  const stats4 = evaluateResult(result4, TEST_DATA)
  console.log('  - 抽取数量:', sampleSize)
  console.log('  - 分类数:', stats4.categoryCount)
  console.log('  - 已分配:', stats4.assignedCards + '/' + stats4.totalCards)
  console.log('  - 缺失:', stats4.missingCards, '  重复:', stats4.duplicateCards)
  console.log('  - 分类准确率:', stats4.categoryAccuracy + '%')
  console.log('  - 单元准确率:', stats4.unitAccuracy + '%')
  if (stats4.wrongCards.length > 0 && stats4.wrongCards.length <= 10) {
    console.log('  - 错误卡片详情:')
    stats4.wrongCards.forEach(w => {
      console.log(`    #${w.idx}: 期望[${w.expected}] 实际[${w.actual}]`)
      console.log(`      内容: ${w.content}...`)
    })
  }
  if (stats4.assignedCards === sampleSize && stats4.duplicateCards === 0 &&
      parseFloat(stats4.categoryAccuracy) >= 90) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 5：关联检测测试 ----
  console.log('\n[测试 5] 关联检测测试（验证每张卡片分类正确）')
  total++
  let associationOk = true
  let correctCount = 0
  const wrongAssociation = []
  for (let i = 0; i < TEST_DATA.length; i++) {
    const card = TEST_DATA[i]
    const { category } = classifyCardLocal(card.kp)
    if (isNameMatch(category, card.expectedCategory)) {
      correctCount++
    } else {
      wrongAssociation.push({ idx: i, expected: card.expectedCategory, actual: category, content: card.kp.slice(0, 50) })
      associationOk = false
    }
  }
  console.log(`  - 关联检测正确率: ${correctCount}/${TEST_DATA.length} (${(correctCount / TEST_DATA.length * 100).toFixed(1)}%)`)
  if (wrongAssociation.length > 0 && wrongAssociation.length <= 10) {
    console.log('  - 错误详情:')
    wrongAssociation.forEach(w => {
      console.log(`    #${w.idx}: 期望 "${w.expected}", 实际 "${w.actual}"`)
      console.log(`      内容: ${w.content}...`)
    })
  }
  if (associationOk && correctCount >= TEST_DATA.length * 0.95) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
  }

  // ---- 测试 6：跨分类随机混合抽取测试 ----
  console.log('\n[测试 6] 跨分类随机混合抽取测试（每类抽15张，共30张）')
  total++
  const csCards = TEST_DATA.filter(d => d.expectedCategory === '计算机基础')
  const mathCards = TEST_DATA.filter(d => d.expectedCategory === '高等数学')
  const sampled6 = [
    ...shuffleArray(csCards).slice(0, 15),
    ...shuffleArray(mathCards).slice(0, 15),
  ]
  const shuffled6 = shuffleArray(sampled6)
  const cards6 = shuffled6.map((d, i) => ({ ...d, _testIdx: TEST_DATA.indexOf(d) }))
  const result6 = localSimulationClassify(cards6)
  const stats6 = evaluateResult(result6, TEST_DATA)
  console.log('  - 抽取: 计算机基础15张 + 高等数学15张 = 30张')
  console.log('  - 分类数:', stats6.categoryCount, '(期望 2)')
  console.log('  - 已分配:', stats6.assignedCards + '/' + stats6.totalCards)
  console.log('  - 分类准确率:', stats6.categoryAccuracy + '%')
  console.log('  - 单元准确率:', stats6.unitAccuracy + '%')
  if (stats6.wrongCards.length > 0 && stats6.wrongCards.length <= 10) {
    console.log('  - 错误卡片详情:')
    stats6.wrongCards.forEach(w => {
      console.log(`    #${w.idx}: 期望[${w.expected}] 实际[${w.actual}]`)
      console.log(`      内容: ${w.content}...`)
    })
  }
  if (stats6.assignedCards === 30 && stats6.duplicateCards === 0 &&
      parseFloat(stats6.categoryAccuracy) >= 90) {
    passed++
    console.log('  [PASS]')
  } else {
    console.log('  [FAIL]')
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
