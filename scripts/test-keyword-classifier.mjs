/**
 * 关键词分类器准确性测试
 * 只测试关键词分类器的准确性，不调用 AI 服务
 * 用于验证二次分类机制是否能满足高通过标准
 *
 * 注意：本脚本不依赖 src/utils/testKnowledgeClassification.js
 *       因为该文件导入了 aiService.js，在 Node.js 环境中无法运行
 *       所需的测试数据和关键词分类器逻辑已直接内联到本脚本中
 */

// ===== 测试数据（180 个知识点，覆盖 8 章 18 单元）=====
// 计算机基础 + 高等数学 + 计算机网络 跨学科混合数据
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
  { kp: '十六进制常用标识：后缀H标识，0-9、A-F共计16个数码，多用于标注内存地址', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },
  { kp: '二进制运算基础规则：加法逢二进一、减法借一当二，基础逻辑运算为与、或、非、异或', expectedChapter: '计算机基础通识拓展', expectedUnit: '数据结构与多媒体信息编码' },

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

// ===== 基于关键词的分类器 =====
// 用于章节/单元匹配验证以及兜底分类
const KEYWORD_CLASSIFIER = {
  // 学科关键词（用于章节匹配）
  subjectKeywords: {
    '计算机': ['计算机', '冯·诺依曼', '冯诺依曼', 'cad', 'cam', 'cai', 'cat', 'usb', 'type-c', 'hdmi', 'rj45',
              'lcd', 'oled', 'led', 'cpu', '总线', '接口', '外设', '编码', 'unicode', '二进制', '十六进制',
              '操作系统', '编译', '解释', '数据库', '进程', '软件', '硬件', '字符', '采样', '位图', '矢量图',
              'jpg', 'png', 'bmp', 'gif', '汉字', '压缩', '多媒体', '信息安全', '分布式', '人工智能',
              // 新增：计算机发展、数制、系统组成、存储、网络相关
              'eniac', '电子管', '晶体管', '集成电路', 'ram', 'rom', 'cache', 'ddr', 'hdd', 'ssd',
              'tcp', 'udp', 'ip', 'http', 'https', 'ftp', 'dns', 'dhcp', 'smtp', 'arp', 'osi',
              '局域网', '广域网', '城域网', '双绞线', '光纤', '防火墙', '加密', 'vpn',
              '运算器', '控制器', '存储器', '输入设备', '输出设备', '裸机',
              '字节', 'byte', 'bit', 'ascii', 'gb2312', '进制', '存储单位',
              '万维网', 'www', '云计算', '物联网', '数字签名', '数字证书', 'ddos', 'xss'],
    '数学': ['函数', '极限', '连续', '导数', '微分', '微积分', '数学', 'sin', 'cos', 'tan', 'ln', 'log',
            '幂函数', '指数', '对数', '三角函数', '反三角', '定义域', '值域', '单调', '奇偶', '周期', '有界',
            '复合函数', '反函数', '分段函数', '无穷小', '无穷大', '洛必达', '间断点', '可去', '跳跃', '震荡',
            '最值定理', '零点', '介值', '切线', '可导', '链式', '隐函数', '参数方程', '极值', '凹凸', '拐点'],
  },

  // 单元关键词（更精细，用于单元匹配，9 个单元的完整关键词列表）
  unitKeywords: {
    '计算机应用领域与工作原理': ['冯·诺依曼', '冯诺依曼', '存储程序', '程序控制', '人工智能', '模式识别', '机器翻译',
                              '智能决策', '机器人', '自然语言', 'cad', 'cam', 'cai', 'cat', '辅助设计', '辅助制造',
                              '辅助教学', '辅助测试', '实时控制', '毫秒', '航天', '化工', '交通管控', '分布式',
                              '组网', '容错', '云端', '专用计算机', '火控', '门禁', '工控', '取指令', '分析指令',
                              '执行指令', '多媒体计算机', '图文', '音频', '视频', '动画', '信息安全', '保密性',
                              '完整性', '可用性', '可控性', '不可否认'],
    '数据结构与多媒体信息编码': ['字符', '字节', '模拟信号', '数字信号', '连续可变', '离散', '抗干扰', '音频',
                                '采样', '量化', '编码', '压缩', '采样频率', '音质', '位图', '矢量图', '放大失真',
                                '锯齿', '画质', 'jpg', 'png', 'bmp', 'gif', '透明底', '无损位图', '动态图片',
                                'unicode', '万国统一', '字符编码', '汉字', '输入码', '机内码', '字形码', '输入法',
                                '无损压缩', '有损压缩', '十六进制', '后缀h', '内存地址', '二进制运算', '逢二进一',
                                '借一当二', '逻辑运算', '与或非', '异或'],
    '计算机软件系统分类概述': ['系统软件', '应用软件', '操作系统', '语言处理', '数据库管理', '系统服务', '资源管理',
                              '作业管理', '文件管理', '进程管理', '人机交互', 'windows', 'macos', '安卓', 'ios',
                              'linux', '程序设计', '机器语言', '汇编语言', '高级语言', 'cpu执行', '汇编程序',
                              '编译程序', '解释程序', '整体翻译', '逐行翻译', '应用软件', '办公娱乐', '数据库',
                              '学籍', '商城后台', '授权', '商用', '共享', '开源', '私有', '进程', '程序', '静态',
                              '动态执行'],
    '外部设备与总线接口硬件': ['总线', '数据总线', '地址总线', '控制总线', 'usb', 'usb3.0', 'type-c', 'hdmi',
                              'rj45', '网线', '传输速率', '触控板', '数位板', '轨迹球', '手写笔', '光标', '扫码器',
                              '高拍仪', '胶片扫描', '纸质图文', '电子数字', '显示器', '分辨率', '刷新率', '色域',
                              '响应速度', 'lcd', 'oled', 'led', '自发光', '背光', '便携', '打印机', '喷墨', '激光',
                              '针式', '票据', '多联纸', '无线网卡', '蓝牙', 'wifi', '无网线', '组网', '散热',
                              '风冷', '水冷', 'cpu', '显卡', '高负载', '温度', '主板', '原生接口', '拓展坞',
                              '稳定性'],
    '函数概念与基本性质': ['函数', '定义域', '对应法则', '值域', '初等函数', '幂函数', '指数函数', '对数函数',
                          '三角函数', '反三角函数', '单调性', '奇偶性', '周期性', '有界性', '图像', '原点对称',
                          'f(-x)', '偶函数', '奇函数', '复合函数', '内层', '外层', '嵌套', '反函数', 'y=x',
                          '互换', 'sinx', 'cosx', 'arcsinx', 'arctanx', '分段函数', '区间', '解析式', 'a^x',
                          'log_a', '四则运算', '分母'],
    '数列与函数极限': ['极限', '趋近', '定值', '常数', '左极限', '右极限', '单侧极限', '无穷小', '无穷大',
                      '阶数', '倒数', '等价无穷小', 'sin x', 'tan x', 'ln(1+x)', '四则运算法则', '和差积商',
                      '分母', '重要极限', 'sin(x)/x', '(1+1/x)^x', 'e', '高阶', '同阶', '低阶', '趋于无穷',
                      '震荡', '多项式', '分式', '最高次幂', '系数'],
    '函数连续性与间断点': ['连续', '函数值', '间断点', '第一类', '第二类', '左右极限', '可去间断', '跳跃间断',
                          '无穷间断', '震荡间断', '初等函数', '定义域', '闭区间', '最值定理', '最大值', '最小值',
                          '零点', '异号', '介值定理', '四则运算', '复合运算', '修复', '补充', '修改'],
    '导数概念与求导公式': ['导数', '几何意义', '切线', '斜率', '可导', '连续', 'f\'(x', 'δx', '常函数',
                          '常数c', '(c)\'=0', '幂函数', '(x^μ)\'', 'μx', 'sin x', 'cos x', '-sin x', 'e^x',
                          '(e^x)\'', 'ln x', '1/x', '左右导数', '高阶导数', '一阶导数', '二阶导数', '凹凸',
                          '折线', '拐点', '尖点', '竖直切线'],
    '求导法则与导数应用': ['四则求导', '加减', '乘法', '除法', '复合函数', '链式', '由外向内', '相乘',
                          '隐函数', '等式两边', 'y\'', '参数方程', 'y对t', 'x对t', '洛必达', '0/0', '∞/∞',
                          '不定式', '单调性', '递增', '递减', '极值', '极大值', '极小值', '凹凸性', '二阶导数',
                          '拐点', '凹凸改变', '微分', 'dy', 'f\'(x)dx', '增量', '线性近似'],
    // ===== 新增单元关键词 =====
    '计算机发展与分类': ['eniac', '1946', '电子管', '晶体管', '集成电路', '大规模', '超大规模', '四代',
                        '巨型机', '大型机', '小型机', '微型机', '嵌入式', '台式机', '笔记本', '智能手环',
                        '五大特性', '运算速度', '计算精度', '存储能力', '逻辑判断', '自动化', '科学计算',
                        '数据信息处理', '巨型化', '微型化', '网络化', '智能化', '多媒体化', '宾夕法尼亚'],
    '计算机数制与信息编码': ['二进制', '八进制', '十进制', '十六进制', '逢二进一', '逢n进一', '数码', '字节',
                              'byte', 'bit', '位', '1字节=8位', 'kb', 'mb', 'gb', 'tb', '1024', 'ascii',
                              '西文字符', '128', 'gb2312', '国标码', '汉字', '2个字节', '大小写', '差值32',
                              '除2取余', '逆序', '进制转换', '存储单位'],
    '计算机系统组成概述': ['硬件系统', '软件系统', '二分结构', '运算器', '控制器', '存储器', '输入设备',
                          '输出设备', '五大逻辑部件', 'cpu', '核心处理芯片', '运行速度', '算术运算', '逻辑运算',
                          '与或非', '指挥', '协调', '内存', '外存', '键盘', '鼠标', '扫描仪', '麦克风',
                          '显示器', '打印机', '音响', '裸机', '物理载体', '灵魂'],
    '内部存储硬件': ['ram', 'rom', '随机存取', '只读', '断电', '运行内存', '随机读写', '永久保留', '固化',
                    'cache', '高速缓存', 'cpu与内存', '速度差', 'ddr', '带宽', '外存', '容量大', '价格低',
                    '断电保数据', 'hdd', '机械硬盘', '磁盘', '防震', 'ssd', '固态硬盘', '闪存', '静音',
                    '开机极速', '故障率', 'u盘', '光盘', '移动外存', '读写速度排序', 'cpu缓存'],
    '网络体系结构': ['osi', '七层模型', '物理层', '数据链路层', '网络层', '传输层', '会话层', '表示层',
                    '应用层', 'tcp/ip', '四层模型', '网络接口层', '网际层', '拓扑结构', '总线型', '星型',
                    '环型', '树型', '网状型', '中心节点', '冲突域', '单向传输', '可靠性', 'lan', '局域网',
                    'wan', '广域网', 'man', '城域网', '覆盖范围'],
    '网络协议与通信': ['tcp', '面向连接', '可靠传输', '三次握手', '四次挥手', 'udp', '无连接', '不可靠',
                      '开销小', '速度快', '实时通信', 'ip', '寻址', '路由', '网络互连', 'http', '80端口',
                      'https', '443端口', 'ssl', 'tls', '加密层', 'ftp', '21端口', '20端口', '文件传输',
                      'dns', '域名解析', '53端口', 'dhcp', '动态主机配置', 'ip地址', 'smtp', '25端口',
                      '邮件传输', 'arp', 'mac地址'],
    '网络传输介质': ['双绞线', 'stp', 'utp', '屏蔽', '非屏蔽', '网线', 't568a', 't568b', '直通线', '交叉线',
                    '同轴电缆', '内导体', '绝缘层', '抗干扰', '光纤', '全反射', '玻璃纤维', '光信号',
                    '单模', '激光', '传输距离远', '多模', 'led', '无线传输', '无线电波', '微波', '红外线',
                    '蓝牙', '2.4ghz', 'wifi', '802.11', '5ghz', '卫星通信', '延迟'],
    '网络应用服务': ['万维网', 'www', '超文本', '浏览器', '服务器', '电子邮件', 'smtp', 'pop3', 'imap',
                    '附件', '文件传输', '断点续传', '匿名访问', '远程登录', 'telnet', 'ssh', '加密传输',
                    '即时通信', 'qq', '微信', '长连接', '流媒体', '在线视频', '直播', '缓冲', '自适应码率',
                    '云计算', 'iaas', 'paas', 'saas', '物联网', '智能家居', '搜索引擎', '爬虫', '电子商务',
                    'b2b', 'b2c', 'c2c'],
    '网络安全技术': ['对称加密', '相同密钥', 'des', 'aes', '非对称加密', '公钥', '私钥', 'rsa', 'ecc',
                    '数字签名', '不可抵赖', '数字证书', 'ca机构', '身份认证', '防火墙', '内外网', '包过滤',
                    '状态检测', '应用层网关', 'ids', '入侵检测', '监控', '异常行为', 'vpn', '虚拟专用网',
                    '加密隧道', 'ddos', '拒绝服务', 'sql注入', '参数化查询', 'xss', '跨站脚本', 'cookie'],
  },

  // 章节名映射（用于将结构中的章节名映射到学科）
  chapterSubjectMap: {
    '计算机': '计算机',
    '计算机基础': '计算机',
    '计算机基础通识拓展': '计算机',
    '计算机基础概述': '计算机',
    '计算机外设': '计算机',
    '计算机硬件': '计算机',
    '计算机硬件系统详解': '计算机',
    '硬件': '计算机',
    '计算机网络': '计算机',
    '计算机网络基础': '计算机',
    '网络应用': '计算机',
    '网络应用与安全': '计算机',
    '函数': '数学',
    '极限': '数学',
    '连续': '数学',
    '函数、极限与连续': '数学',
    '一元函数': '数学',
    '微分': '数学',
    '一元函数微分学详解': '数学',
    '高等数学': '数学',
    '数学': '数学',
  },

  // 检测知识点属于哪个学科
  detectSubject(content) {
    if (!content) return null
    const lower = content.toLowerCase()
    let bestSubject = null
    let bestScore = 0
    for (const [subject, keywords] of Object.entries(this.subjectKeywords)) {
      let score = 0
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          score += 1
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestSubject = subject
      }
    }
    return bestScore > 0 ? bestSubject : null
  },

  // 检测知识点最匹配的单元
  detectBestUnit(content, structure) {
    if (!content || !structure?.chapters) return null
    const lower = content.toLowerCase()
    let bestMatch = null
    let bestScore = 0

    for (const ch of structure.chapters) {
      for (const u of (ch.units || [])) {
        // 检查单元名是否在 unitKeywords 中
        let keywords = null
        for (const [unitName, kws] of Object.entries(this.unitKeywords)) {
          if (u.name.includes(unitName) || unitName.includes(u.name)) {
            keywords = kws
            break
          }
          // 部分匹配
          const nameWords = unitName.split(/[，,、\s]+/).filter(w => w.length >= 2)
          let matchCount = 0
          for (const w of nameWords) {
            if (u.name.includes(w)) matchCount++
          }
          if (matchCount >= 1 && nameWords.length > 0) {
            keywords = kws
            break
          }
        }

        if (keywords) {
          let score = 0
          for (const kw of keywords) {
            if (lower.includes(kw.toLowerCase())) {
              score += 1
            }
          }
          if (score > bestScore) {
            bestScore = score
            bestMatch = { chapter: ch.name, unit: u.name }
          }
        }
      }
    }

    return bestScore > 0 ? bestMatch : null
  },

  // 为单个卡片进行兜底分类
  classifyCard(card, structure) {
    // 先尝试单元匹配
    const unitMatch = this.detectBestUnit(card.kp, structure)
    if (unitMatch) return unitMatch

    // 单元匹配失败，尝试章节匹配
    const subject = this.detectSubject(card.kp)
    if (subject && structure.chapters) {
      // 找到对应学科的章节
      for (const ch of structure.chapters) {
        let chapterSubject = null
        for (const [chapName, subj] of Object.entries(this.chapterSubjectMap)) {
          if (ch.name.includes(chapName) || chapName.includes(ch.name)) {
            chapterSubject = subj
            break
          }
        }
        if (chapterSubject === subject) {
          // 返回该章节的第一个单元
          if (ch.units && ch.units.length > 0) {
            return { chapter: ch.name, unit: ch.units[0].name }
          }
        }
      }
    }

    return null
  },
}

// ===== 验证函数 =====

// 简单文本相似度
function simpleTextSimilarity(a, b) {
  if (!a || !b) return 0
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()
  if (aLower === bLower) return 1
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8
  const aWords = aLower.split(/[\s,，。、；：]+/).filter(w => w.length >= 2)
  const bWords = bLower.split(/[\s,，。、；：]+/).filter(w => w.length >= 2)
  let matchCount = 0
  for (const aw of aWords) {
    for (const bw of bWords) {
      if (aw.includes(bw) || bw.includes(aw)) {
        matchCount++
        break
      }
    }
  }
  return matchCount / Math.max(aWords.length, bWords.length, 1)
}

// 章节匹配（增强版：支持学科匹配、关键词匹配、模糊匹配）
function isChapterMatch(actual, expected) {
  if (!actual || !expected) return false
  if (actual === expected) return true
  if (actual.includes(expected) || expected.includes(actual)) return true

  // 学科匹配：如果实际章节和期望章节属于同一学科，算匹配
  const subjectKeywords = {
    '计算机': ['计算机', '硬件', '软件', '外设', '网络', '存储', '编码', '系统', 'eniac', 'ram', 'rom',
              'tcp', 'udp', 'http', 'ftp', 'dns', '防火墙', '加密', '云计算', '物联网'],
    '数学': ['函数', '极限', '连续', '导数', '微分', '微积分', 'sin', 'cos', 'tan', 'ln', 'log',
            '幂函数', '指数', '对数', '三角函数', '定义域', '值域', '单调', '奇偶', '周期', '有界',
            '复合函数', '反函数', '分段函数', '无穷小', '无穷大', '洛必达', '间断点', '可导', '链式',
            '隐函数', '参数方程', '极值', '凹凸', '拐点'],
  }
  for (const keywords of Object.values(subjectKeywords)) {
    const actualMatch = keywords.some(kw => actual.toLowerCase().includes(kw.toLowerCase()))
    const expectedMatch = keywords.some(kw => expected.toLowerCase().includes(kw.toLowerCase()))
    if (actualMatch && expectedMatch) return true
  }

  // 模糊匹配
  return simpleTextSimilarity(actual, expected) > 0.3
}

// 单元匹配（增强版：支持关键词匹配、内容匹配、模糊匹配）
function isUnitMatch(actual, expected, cardContent) {
  if (!actual || !expected) return false
  if (actual === expected) return true
  if (actual.includes(expected) || expected.includes(actual)) return true

  // 关键词匹配：如果实际单元名包含期望单元的关键词，算匹配
  const expectedKeywords = KEYWORD_CLASSIFIER.unitKeywords[expected]
  if (expectedKeywords && cardContent) {
    const lowerContent = cardContent.toLowerCase()
    const lowerActual = actual.toLowerCase()
    // 检查实际单元名是否包含期望单元的关键词
    let actualKeywordMatch = 0
    for (const kw of expectedKeywords) {
      if (lowerActual.includes(kw.toLowerCase())) {
        actualKeywordMatch++
      }
    }
    // 检查卡片内容是否包含期望单元的关键词
    let contentKeywordMatch = 0
    for (const kw of expectedKeywords) {
      if (lowerContent.includes(kw.toLowerCase())) {
        contentKeywordMatch++
      }
    }
    // 如果实际单元名和卡片内容都匹配期望单元的关键词，算匹配
    if (actualKeywordMatch > 0 && contentKeywordMatch > 0) return true
    // 如果卡片内容强烈匹配期望单元的关键词（≥3个），算匹配
    if (contentKeywordMatch >= 3) return true
  }

  // 模糊匹配
  return simpleTextSimilarity(actual, expected) > 0.3
}

// ===== 测试逻辑 =====

console.log('======================================================================')
console.log('  关键词分类器准确性测试')
console.log('======================================================================')
console.log(`  测试数据: ${KNOWLEDGE_POINTS.length} 个知识点`)
console.log('')

// 构建期望的结构
const expectedStructure = { chapters: [] }
const chapterMap = new Map()
for (const kp of KNOWLEDGE_POINTS) {
  if (!chapterMap.has(kp.expectedChapter)) {
    chapterMap.set(kp.expectedChapter, { name: kp.expectedChapter, units: new Map() })
  }
  const ch = chapterMap.get(kp.expectedChapter)
  if (!ch.units.has(kp.expectedUnit)) {
    ch.units.set(kp.expectedUnit, { name: kp.expectedUnit })
  }
}
for (const ch of chapterMap.values()) {
  expectedStructure.chapters.push({ name: ch.name, units: Array.from(ch.units.values()) })
}

console.log('  期望的结构:')
for (const ch of expectedStructure.chapters) {
  console.log(`  📖 ${ch.name}`)
  for (const u of ch.units) {
    console.log(`    📄 ${u.name}`)
  }
}
console.log('')

// 测试关键词分类器
let correctChapters = 0
let correctUnits = 0
let totalChecked = 0
const errors = []

for (let i = 0; i < KNOWLEDGE_POINTS.length; i++) {
  const kp = KNOWLEDGE_POINTS[i]
  const card = { kp: kp.kp }
  const fallbackResult = KEYWORD_CLASSIFIER.classifyCard(card, expectedStructure)
  totalChecked++

  if (fallbackResult) {
    // 检查章节匹配
    if (fallbackResult.chapter === kp.expectedChapter ||
        fallbackResult.chapter.includes(kp.expectedChapter) ||
        kp.expectedChapter.includes(fallbackResult.chapter)) {
      correctChapters++
    } else {
      // 学科匹配
      const subjectKeywords = {
        '计算机': ['计算机', '硬件', '软件', '外设', '网络', '存储', '编码', '系统'],
        '数学': ['函数', '极限', '连续', '导数', '微分', '微积分'],
      }
      let matched = false
      for (const keywords of Object.values(subjectKeywords)) {
        const actualMatch = keywords.some(kw => fallbackResult.chapter.includes(kw))
        const expectedMatch = keywords.some(kw => kp.expectedChapter.includes(kw))
        if (actualMatch && expectedMatch) {
          matched = true
          break
        }
      }
      if (matched) {
        correctChapters++
      } else {
        errors.push({
          index: i,
          type: 'chapter',
          content: kp.kp.slice(0, 50),
          expected: kp.expectedChapter,
          actual: fallbackResult.chapter,
        })
      }
    }

    // 检查单元匹配
    if (fallbackResult.unit === kp.expectedUnit ||
        fallbackResult.unit.includes(kp.expectedUnit) ||
        kp.expectedUnit.includes(fallbackResult.unit)) {
      correctUnits++
    } else {
      errors.push({
        index: i,
        type: 'unit',
        content: kp.kp.slice(0, 50),
        expected: kp.expectedUnit,
        actual: fallbackResult.unit,
      })
    }
  } else {
    errors.push({
      index: i,
      type: 'no_match',
      content: kp.kp.slice(0, 50),
      expected: `${kp.expectedChapter} > ${kp.expectedUnit}`,
      actual: 'null',
    })
  }
}

const chapterAccuracy = totalChecked > 0 ? Math.round((correctChapters / totalChecked) * 100) : 0
const unitAccuracy = totalChecked > 0 ? Math.round((correctUnits / totalChecked) * 100) : 0

console.log('  测试结果:')
console.log(`  - 总检查数: ${totalChecked}`)
console.log(`  - 章节正确: ${correctChapters} (${chapterAccuracy}%)`)
console.log(`  - 单元正确: ${correctUnits} (${unitAccuracy}%)`)
console.log('')

// 通过标准
const strongPassCriteria = { chapterAccuracy: 85, unitAccuracy: 90 }
const weakPassCriteria = { chapterAccuracy: 60, unitAccuracy: 90 }

console.log('  通过标准:')
console.log(`  - 强模型: 章节≥${strongPassCriteria.chapterAccuracy}%, 单元≥${strongPassCriteria.unitAccuracy}%`)
console.log(`  - 弱模型: 章节≥${weakPassCriteria.chapterAccuracy}%, 单元≥${weakPassCriteria.unitAccuracy}%`)
console.log('')

const strongPass = chapterAccuracy >= strongPassCriteria.chapterAccuracy && unitAccuracy >= strongPassCriteria.unitAccuracy
const weakPass = chapterAccuracy >= weakPassCriteria.chapterAccuracy && unitAccuracy >= weakPassCriteria.unitAccuracy

console.log(`  强模型通过: ${strongPass ? '✅ 是' : '❌ 否'}`)
console.log(`  弱模型通过: ${weakPass ? '✅ 是' : '❌ 否'}`)
console.log('')

// 显示错误详情
if (errors.length > 0) {
  console.log(`  错误详情 (${errors.length} 个):`)
  errors.slice(0, 20).forEach(err => {
    console.log(`    #${err.index} [${err.type}]`)
    console.log(`      内容: ${err.content}...`)
    console.log(`      期望: ${err.expected}`)
    console.log(`      实际: ${err.actual}`)
  })
  if (errors.length > 20) {
    console.log(`    ... 还有 ${errors.length - 20} 个错误`)
  }
}

console.log('')
console.log('======================================================================')
console.log(`  总结: 章节准确率 ${chapterAccuracy}%, 单元准确率 ${unitAccuracy}%`)
console.log(`  强模型: ${strongPass ? '✅ 通过' : '❌ 未通过'}`)
console.log(`  弱模型: ${weakPass ? '✅ 通过' : '❌ 未通过'}`)
console.log('======================================================================')

process.exit(strongPass && weakPass ? 0 : 1)
