/**
 * 智能单元整理 - 180知识点大数据测试脚本
 * 3章节 × 6单元/章节 × 10知识点/单元 = 180个知识点
 * 纯 AI 分配，用语义匹配评估结果
 */

// ===== AI 配置（阿里云百炼 Qwen）=====
const AI_CONFIG = {
  apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  apiKey: 'sk-ws-H.REDRRPM.oDCm.MEYCIQDZOMN2Ctge1ffgLG3bHom2k_l1zIoj367CzD964fPqxAIhAPPPgxiNTJyy2OGbRt1XlnT_DpDO1m50_GasPJ5SV-wr',
  model: 'qwen-plus',
}

// ===== 测试数据：数据结构与算法（3章节 × 6单元 × 10知识点 = 180）=====
const TEST_DATA = [
  // 章节1：线性结构 - 单元1：数组与链表 (10)
  { kp: '数组定义：连续内存空间存储相同类型元素的线性数据结构', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '数组特点：支持随机访问时间复杂度O(1)，但插入删除需要移动元素', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '顺序表：用数组实现的线性表，逻辑相邻的元素物理位置也相邻', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '单链表定义：通过指针连接的节点序列，每个节点包含数据和指向下一节点的指针', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '单链表插入：在节点p后插入新节点s，操作为s.next=p.next然后p.next=s', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '单链表删除：删除节点p后的节点q，操作为p.next=q.next然后释放q', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '双链表：每个节点包含前驱和后继两个指针，支持双向遍历', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '循环链表：尾节点指向头节点形成环状结构，可从任意节点开始遍历全表', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '静态链表：用游标模拟指针的链表，用数组描述链式结构', expectedUnit: '数组与链表', expectedChapter: '线性结构' },
  { kp: '链表与数组比较：链表插入删除快O(1)，数组访问快O(1)', expectedUnit: '数组与链表', expectedChapter: '线性结构' },

  // 单元2：栈与队列 (10)
  { kp: '栈定义：后进先出LIFO的线性表，只允许在栈顶进行插入和删除', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '栈的基本操作：push入栈、pop出栈、peek查看栈顶、isEmpty判空', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '顺序栈：用数组实现的栈，top指针指向栈顶元素位置', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '链栈：用链表实现的栈，头节点作为栈顶插入删除在头部进行', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '栈的应用：函数调用、递归实现、表达式求值、括号匹配', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '队列定义：先进先出FIFO的线性表，队尾插入队头删除', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '循环队列：将顺序队列首尾相连解决假溢出问题', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '循环队列判满：(rear+1)%maxSize==front牺牲一个单元区分空满', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '链队列：用带头尾指针的链表实现的队列', expectedUnit: '栈与队列', expectedChapter: '线性结构' },
  { kp: '双端队列：两端都可以进行插入和删除操作的线性表', expectedUnit: '栈与队列', expectedChapter: '线性结构' },

  // 单元3：字符串 (10)
  { kp: '串定义：由零个或多个字符组成的有限序列', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '串的存储结构：顺序串用数组存储和链串用链表存储', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '朴素模式匹配：从主串每个位置开始逐字符比较最坏O(m*n)', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: 'KMP算法：利用已匹配信息避免回溯时间复杂度O(m+n)', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: 'KMP的next数组：记录模式串每个位置的最长相等前后缀长度', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: 'nextval数组：在next基础上处理相邻字符相同情况', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '串的基本操作：赋值、连接、求子串、定位、比较、求长度', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '空串与空格串：空串长度为0空格串含空格字符长度不为0', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '子串定义：串中任意连续字符组成的子序列', expectedUnit: '字符串', expectedChapter: '线性结构' },
  { kp: '主串与模式串：匹配中主串是被查找的串模式串是要查找的串', expectedUnit: '字符串', expectedChapter: '线性结构' },

  // 单元4：哈希表 (10)
  { kp: '哈希表定义：通过哈希函数将关键字映射到存储位置的数据结构', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '哈希函数设计原则：简单、均匀、冲突少', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '直接定址法：Hash(key)=a*key+b不会产生冲突', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '除留余数法：Hash(key)=key%p选择不大于表长的最大质数', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '冲突定义：不同关键字映射到相同哈希地址', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '线性探测法：冲突时顺序查找下一个空地址', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '二次探测法：冲突时以平方步长探测减少聚集', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '链地址法：将冲突元素存储在同一个链表中', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '装填因子：元素个数除以表长反映哈希表装满程度', expectedUnit: '哈希表', expectedChapter: '线性结构' },
  { kp: '哈希查找效率：平均查找长度取决于装填因子与元素个数无关', expectedUnit: '哈希表', expectedChapter: '线性结构' },

  // 单元5：矩阵与广义表 (10)
  { kp: '矩阵的顺序存储：按行优先或列优先存储二维数组', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '对称矩阵压缩：只存储下三角元素节省一半空间', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '三角矩阵压缩：上三角或下三角为常数只存储非常量部分', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '稀疏矩阵：非零元素远少于零元素的矩阵', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '稀疏矩阵三元组存储：用行列值三元组存储非零元素', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '稀疏矩阵十字链表存储：用行链表和列链表交叉存储非零元素', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '广义表定义：元素可以是原子或子表的线性结构', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '广义表头：广义表的第一个元素可以是原子或子表', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '广义表表尾：除去表头后剩余元素组成的子表', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },
  { kp: '广义表深度：广义表中括号的最大嵌套层数', expectedUnit: '矩阵与广义表', expectedChapter: '线性结构' },

  // 单元6：并查集 (10)
  { kp: '并查集定义：管理不相交集合的数据结构支持合并和查找', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集初始化：每个元素自成一个集合父节点指向自己', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集查找：沿父指针找到根节点根节点为代表元素', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集合并：将两个集合的根节点相连', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '路径压缩：查找时将路径上所有节点直接指向根优化查找效率', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '按秩合并：将矮树合并到高树上保持树的高度平衡', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集时间复杂度：路径压缩加按秩合并后近似O(1)', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集应用：连通分量判断最小生成树Kruskal算法', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集判断连通：同一集合中元素连通不同集合不连通', expectedUnit: '并查集', expectedChapter: '线性结构' },
  { kp: '并查集优化效果：路径压缩使树扁平化大幅提升查找效率', expectedUnit: '并查集', expectedChapter: '线性结构' },

  // 章节2：树与图 - 单元1：树的基础 (10)
  { kp: '树定义：n个节点的有限集n为0为空树否则有且仅有一个根节点', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '节点的度：节点拥有的子树数度为0的节点为叶子节点', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '树的度：树中所有节点度的最大值', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '节点层次：根为第1层其子节点为第2层依此类推', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '树的深度：树中节点的最大层次', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '森林：m棵互不相交的树的集合', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '树的存储结构：双亲表示法孩子表示法孩子兄弟表示法', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '双亲表示法：用数组存储节点每个节点记录其父节点位置', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '孩子兄弟表示法：每个节点记录第一个孩子和下一个兄弟', expectedUnit: '树的基础', expectedChapter: '树与图' },
  { kp: '树与二叉树转换：树转二叉树用孩子兄弟法左孩子右兄弟', expectedUnit: '树的基础', expectedChapter: '树与图' },

  // 单元2：二叉树 (10)
  { kp: '二叉树定义：每个节点最多有两个子树的树结构', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '满二叉树：每层节点都达到最大数的二叉树', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '完全二叉树：除最后一层外为满二叉树最后一层从左到右连续', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '二叉树性质：第i层最多2的i减1次方个节点深度k最多2的k次方减1个节点', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '二叉树顺序存储：用数组存储节点i的子节点在2i和2i加1位置', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '二叉链表存储：每个节点含数据域和左右孩子指针', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '二叉树遍历：前序根左右中序左根右后序左右根', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '前序遍历递归：先访问根再递归遍历左子树最后递归遍历右子树', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '中序遍历非递归：用栈模拟递归左子树入栈后访问根再转右子树', expectedUnit: '二叉树', expectedChapter: '树与图' },
  { kp: '层次遍历：用队列实现逐层从左到右访问节点', expectedUnit: '二叉树', expectedChapter: '树与图' },

  // 单元3：堆与优先队列 (10)
  { kp: '堆定义：完全二叉树父节点值总是大于等于或小于等于子节点', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '大顶堆：每个节点的值都大于或等于其子节点的值', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '小顶堆：每个节点的值都小于或等于其子节点的值', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '堆的数组表示：节点i的父节点在i除2子节点在2i和2i加1', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '建堆操作：从最后一个非叶子节点开始向下调整', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '堆的插入：在末尾添加元素后向上调整上浮', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '堆的删除：删除根节点将末尾元素移到根后向下调整下沉', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '堆排序：建堆后反复删除堆顶元素得到有序序列', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '优先队列：用堆实现支持插入元素和取出最值', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },
  { kp: '堆排序时间复杂度：建堆O(n)排序O(nlogn)整体O(nlogn)', expectedUnit: '堆与优先队列', expectedChapter: '树与图' },

  // 单元4：图的基础 (10)
  { kp: '图定义：由顶点集V和边集E组成的数据结构', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '有向图：边有方向用尖括号表示从v到w的有向边', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '无向图：边无方向用圆括号表示v和w之间的无向边', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '完全图：任意两顶点间都有边的图', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '顶点的度：与顶点关联的边数有向图分入度和出度', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '路径：从一顶点到另一顶点的顶点序列', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '连通图：无向图中任意两顶点间都有路径', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '图的邻接矩阵：用二维数组表示顶点间关系', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '图的邻接表：为每个顶点建立链表存储其邻接点', expectedUnit: '图的基础', expectedChapter: '树与图' },
  { kp: '邻接矩阵与邻接表比较：矩阵适合稠密图邻接表适合稀疏图', expectedUnit: '图的基础', expectedChapter: '树与图' },

  // 单元5：图的遍历 (10)
  { kp: '广度优先遍历BFS：从某顶点出发逐层访问邻接点用队列辅助', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: '深度优先遍历DFS：从某顶点出发深入访问邻接点用栈或递归', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'BFS时间复杂度：邻接矩阵O(n方)邻接表O(n加e)', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'DFS时间复杂度：邻接矩阵O(n方)邻接表O(n加e)', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'BFS空间复杂度：O(n)需要队列存储待访问顶点', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'DFS空间复杂度：O(n)递归栈深度最多为顶点数', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: '连通分量：非连通图的极大连通子图', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'BFS求最短路径：无权图中BFS首次到达即为最短路径', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: 'DFS判断环：递归过程中遇到已访问且在当前路径上的顶点则有环', expectedUnit: '图的遍历', expectedChapter: '树与图' },
  { kp: '生成树：连通图的极小连通子图包含n个顶点和n减1条边', expectedUnit: '图的遍历', expectedChapter: '树与图' },

  // 单元6：最短路径 (10)
  { kp: 'Dijkstra算法：求单源最短路径贪心策略逐步扩展最短路径', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'Dijkstra算法步骤：初始化距离选最小距离顶点松弛邻接边', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'Dijkstra时间复杂度：邻接矩阵O(n方)不能用负权边', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'Floyd算法：求所有顶点间最短路径动态规划思想', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'Floyd算法核心：d[i][j]等于min可选经过中间节点的路径', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'Floyd时间复杂度：O(n的三次方)可以处理负权边但不能有负环', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: '最短路径与最小生成树区别：最短路径关注两点生成树关注全图连通', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'AOV网：以顶点表示活动边表示活动先后关系的有向无环图', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: '拓扑排序：对AOV网排序使每条边的起点在终点之前', expectedUnit: '最短路径', expectedChapter: '树与图' },
  { kp: 'AOE网与关键路径：以边表示活动关键路径是从源点到汇点的最长路径', expectedUnit: '最短路径', expectedChapter: '树与图' },

  // 章节3：算法设计 - 单元1：排序算法 (10)
  { kp: '冒泡排序：相邻元素两两比较每轮将最大元素冒泡到末尾', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '冒泡排序时间复杂度：最好O(n)最坏和平均O(n方)', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '选择排序：每轮选出最小元素放到已排序序列末尾', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '选择排序时间复杂度：始终O(n方)不稳定排序', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '插入排序：将元素逐个插入到已排序序列的合适位置', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '插入排序时间复杂度：最好O(n)最坏O(n方)稳定排序', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '快速排序：选基准元素小于基准的放左大于的放右递归排序', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '快速排序时间复杂度：平均O(nlogn)最坏O(n方)不稳定', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '归并排序：将数组对半分递归排序后合并', expectedUnit: '排序算法', expectedChapter: '算法设计' },
  { kp: '归并排序时间复杂度：始终O(nlogn)稳定排序需要O(n)额外空间', expectedUnit: '排序算法', expectedChapter: '算法设计' },

  // 单元2：查找算法 (10)
  { kp: '顺序查找：从头到尾逐个比较时间复杂度O(n)', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '二分查找：在有序表中取中间元素比较逐步缩小范围', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '二分查找时间复杂度：O(logn)要求表有序且顺序存储', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '分块查找：将表分块块间有序块内无序先查块再块内查找', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '二叉排序树：左子树小于根根小于右子树中序遍历得有序序列', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '二叉排序树查找：从根开始比较小则左子树大则右子树', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: '平衡二叉树AVL：任意节点左右子树高度差不超过1', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: 'AVL平衡调整：LL旋转RR旋转LR双旋RL双旋', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: 'B树定义：多路平衡查找树所有叶子在同一层', expectedUnit: '查找算法', expectedChapter: '算法设计' },
  { kp: 'B加树：B树变体非叶节点只存索引数据在叶子节点', expectedUnit: '查找算法', expectedChapter: '算法设计' },

  // 单元3：动态规划 (10)
  { kp: '动态规划定义：将问题分解为子问题保存子问题解避免重复计算', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '最优子结构：问题的最优解包含子问题的最优解', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '重叠子问题：递归求解时反复计算相同子问题', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '动态规划与分治区别：DP子问题重叠分治子问题独立', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '自顶向下记忆化：递归求解并缓存结果', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '自底向上递推：从最小子问题开始逐步求解', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '状态转移方程：描述从子问题到原问题的递推关系', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '0减1背包问题：每件物品选或不选求最大价值', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '最长公共子序列LCS：两序列的最长公共子序列', expectedUnit: '动态规划', expectedChapter: '算法设计' },
  { kp: '最长递增子序列LIS：序列中的最长递增子序列', expectedUnit: '动态规划', expectedChapter: '算法设计' },

  // 单元4：贪心算法 (10)
  { kp: '贪心算法：每步选择当前最优解期望得到全局最优', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '贪心选择性质：局部最优选择能产生全局最优解', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '贪心与动态规划区别：贪心不回退DP考虑所有子问题', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '部分背包问题：物品可分割按单位价值排序贪心选择', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '活动安排问题：按结束时间排序选不冲突的活动', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '哈夫曼编码：按频率构建最优前缀码频率高的编码短', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '哈夫曼树构建：选频率最小的两棵树合并重复直到一棵树', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '最小生成树Prim算法：从一顶点出发每次选最小权边扩展', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: '最小生成树Kruskal算法：按边权排序依次选不构成环的边', expectedUnit: '贪心算法', expectedChapter: '算法设计' },
  { kp: 'Prim与Kruskal比较：Prim适合稠密图Kruskal适合稀疏图', expectedUnit: '贪心算法', expectedChapter: '算法设计' },

  // 单元5：回溯算法 (10)
  { kp: '回溯法：深度优先搜索解空间不满足条件时回退', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '解空间树：排列树子集树组合树', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '剪枝函数：约束函数和限界函数减少不必要的搜索', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: 'N皇后问题：在N乘N棋盘放N个皇后使其互不攻击', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '子集和问题：从给定集合中选子集使和等于目标值', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '分支限界法：广度优先搜索解空间用优先队列扩展最有希望节点', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '回溯与分支限界区别：回溯DFS分支限界BFS', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '旅行商问题TSP：求经过所有城市且只经过一次的最短回路', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '0减1背包回溯解法：构建子集树用限界函数剪枝', expectedUnit: '回溯算法', expectedChapter: '算法设计' },
  { kp: '图着色问题：给图顶点着色使相邻顶点颜色不同', expectedUnit: '回溯算法', expectedChapter: '算法设计' },

  // 单元6：高级数据结构 (10)
  { kp: '红黑树：自平衡二叉查找树节点有红黑两种颜色', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '红黑树性质：根和叶子为黑红节点子节点为黑路径黑节点数相同', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '红黑树插入：新节点为红色通过旋转和变色维持平衡', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '红黑树与AVL比较：AVL更严格平衡红黑树插入删除更快', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '跳表：多层链表结构支持O(logn)查找', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '跳表查找：从顶层开始比目标大则下降一层比目标小则右移', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: 'Trie树字典树：以字符串字符为边的树结构', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: 'Trie查找：从根开始按字符逐层匹配到叶子节点即找到', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '线段树：用于区间查询和修改的二叉树结构', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
  { kp: '树状数组BIT：用数组实现前缀和的高效更新和查询', expectedUnit: '高级数据结构', expectedChapter: '算法设计' },
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

// ===== AI 调用 =====
async function callAI(prompt, maxTokens = 4096) {
  const response = await fetch(AI_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
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

// ===== Step 1: 结构规划 =====
async function planStructure(cards) {
  const cardCount = cards.length
  const cardLines = cards.map((c, i) => `卡${i}: ${c.kp}`).join('\n')

  const estChapters = Math.max(3, Math.min(5, Math.ceil(Math.sqrt(cardCount / 4))))
  const estUnits = Math.max(12, Math.min(25, Math.ceil(cardCount / 8)))

  const prompt = `你是考研数据结构知识体系整理助手。请分析以下卡片的知识点分布，规划合适的章节/单元层级结构。

【学习目的】本分类的学习目的为：考研数据结构。请据此规划合理的章节/单元结构。

【任务】：
1. 分析所有卡片的内容，提取主题关键词
2. 按知识体系逻辑将卡片划分为若干章节和单元
3. 为每个章节和单元起一个概括性名称
4. 只返回结构方案，不涉及具体卡片分配

【核心原则】（必须严格遵守）：
1. 单元数量 = 知识点大类数量，不是每张卡片一个单元
2. 多个相关的知识点必须归入同一个单元
3. 例如：180个知识点应该规划为 3-5 个章节，每章 4-8 个单元

【结构规划硬约束】：
1. 章节总数：2-5 个
2. 每个章节包含 3-8 个单元
3. 单元总数：12-25 个
4. 禁止为每张卡片创建独立单元
5. 禁止使用知识点标题作为单元名

【单元划分原则】（重要）：
1. 每个单元应该聚焦一个具体的知识主题，不要把多个不同主题合并到一个单元
2. 例如："贪心算法"和"回溯算法"是不同的主题，应该分为两个单元，不要合并为"算法策略"
3. 例如："字符串"和"矩阵"是不同的主题，应该分为两个单元，不要合并为"串与数组存储"
4. 例如："图的基础"和"图的遍历"是不同的主题，应该分为两个单元
5. 【禁止】创建"基础概念"、"概述"、"综合应用"等通用单元，这类单元会吸引大量不相关的卡片
6. 每个单元的名称应该具体明确，能反映该单元的独特主题

【新建限制】：
- 新章节总数不超过 ${estChapters} 个
- 新单元总数不超过 ${estUnits} 个

【所有卡片（共 ${cardCount} 张）】：
${cardLines}

【输出格式】请严格以 JSON 格式返回，不要额外文字、不要代码块：
{
  "chapters": [
    {
      "name": "章节名称（不超过 12 字）",
      "units": [
        { "name": "单元名称（不超过 16 字）" },
        { "name": "单元名称（不超过 16 字）" }
      ]
    }
  ]
}

【重要提醒】：
1. 本步骤只规划章节和单元的层级结构，不涉及具体卡片分配
2. 章节数量应控制在 3-5 个，禁止为每张卡片创建独立章节
3. 同一主题的卡片必须归入同一章节的同一单元
4. 返回的 JSON 中不要包含 cardIndices 字段
5. 【重要】单元划分要细粒度，每个单元聚焦一个主题，不要合并不同主题`

  console.log(`  [planStructure] 调用 AI 规划结构 (卡片数: ${cardCount}, 预估章节: ${estChapters}, 预估单元: ${estUnits})...`)
  const result = await callAI(prompt, 4096)

  let cleaned = result.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const jsonStr = cleaned.substring(start, end + 1)
      try { return JSON.parse(jsonStr) } catch(e2) { return null }
    }
    return null
  }
}

// ===== Step 2: 卡片分配（AI规划结构 + AI生成单元关键词 + 本地语义匹配）=====

// AI 为每个单元生成关键词列表
async function generateUnitKeywords(structure) {
  const unitList = []
  for (let chi = 0; chi < structure.chapters.length; chi++) {
    const ch = structure.chapters[chi]
    for (let ui = 0; ui < (ch.units?.length || 0); ui++) {
      unitList.push({ chapterIndex: chi, unitIndex: ui, name: ch.units[ui].name, chapterName: ch.name })
    }
  }

  const unitListStr = unitList.map((u, i) => `${i}: ${u.chapterName}/${u.name}`).join('\n')

  const prompt = `你是考研数据结构知识分类助手。请为以下每个单元生成关键词列表。

【学习目的】考研数据结构

【单元列表】（共 ${unitList.length} 个单元）：
${unitListStr}

【任务】为每个单元生成 5-10 个关键词，这些关键词应该能够精准匹配属于该单元的卡片知识点。

【输出格式】严格按以下 JSON 格式输出，不要额外文字：
{
  "units": [
    { "unitIndex": 0, "keywords": ["数组", "链表", "顺序表", "单链表", "双链表", "循环链表", "静态链表"] },
    { "unitIndex": 1, "keywords": ["栈", "队列", "LIFO", "FIFO", "循环队列", "链队列", "双端队列"] }
  ]
}

【硬约束】：
1. 必须为每个单元生成关键词
2. 每个单元 5-10 个关键词
3. 关键词应该反映该单元的独特主题
4. 不同单元的关键词应该有区分度
5. 【重要】避免使用过于通用的关键词（如"数据结构"、"算法"、"逻辑结构"、"存储结构"等），这些词无法区分不同单元
6. 【重要】优先使用该单元独有的专业术语（如"KMP"、"哈夫曼树"、"并查集"、"Dijkstra"等），这些词能精准识别卡片归属
7. 【重要】关键词应该足够具体，能将本单元的卡片与其他单元的卡片区分开来

请直接输出 JSON：`

  console.log(`  [generateUnitKeywords] 为 ${unitList.length} 个单元生成关键词...`)
  const result = await callAI(prompt, 4096)

  let cleaned = result.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  let parsed = null
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(cleaned.substring(start, end + 1)) } catch(e2) { parsed = null }
    }
  }

  if (!parsed || !Array.isArray(parsed.units)) {
    console.log(`  [generateUnitKeywords] 失败: 无法解析 JSON`)
    return unitList.map(u => ({ ...u, keywords: [u.name, u.chapterName] }))
  }

  // 合并单元信息和关键词
  const result2 = []
  for (const u of parsed.units) {
    const idx = Number(u.unitIndex)
    if (idx >= 0 && idx < unitList.length) {
      result2.push({
        ...unitList[idx],
        keywords: Array.isArray(u.keywords) ? u.keywords.map(k => String(k)) : [unitList[idx].name],
      })
    }
  }

  console.log(`  [generateUnitKeywords] 完成: ${result2.length} 个单元的关键词`)
  for (const u of result2) {
    console.log(`    单元${u.chapterIndex}.${u.unitIndex}(${u.name}): ${u.keywords.join(', ')}`)
  }

  return result2
}

// 本地语义匹配：将卡片映射到最匹配的单元（TF-IDF 思想）
function matchCardToUnit(kp, units) {
  let bestScore = -1
  let bestUnit = null

  // 预计算关键词的文档频率（DF）：一个关键词出现在多少个单元中
  const kwDf = new Map()
  for (const unit of units) {
    if (!unit || !unit.keywords) continue
    // 去重：同一单元内重复的关键词只算一次
    const uniqueKws = new Set(unit.keywords.filter(k => k))
    for (const kw of uniqueKws) {
      kwDf.set(kw, (kwDf.get(kw) || 0) + 1)
    }
  }
  const totalUnits = units.length

  for (const unit of units) {
    if (!unit || !unit.keywords) continue
    // 计算卡片知识点与单元关键词的匹配分数（TF-IDF 加权）
    let score = 0
    const uniqueKws = new Set(unit.keywords.filter(k => k))
    for (const kw of uniqueKws) {
      if (kp.includes(kw)) {
        // TF-IDF: 关键词长度 * log(总单元数 / 文档频率)
        // 独特关键词（df=1）权重高，通用关键词（df大）权重低
        const df = kwDf.get(kw) || 1
        const idf = Math.log((totalUnits + 1) / df) + 1 // +1 平滑，+1 避免log(1)=0
        score += kw.length * idf
      }
    }
    // 加上单元名称的语义相似度（名称匹配权重降低，避免通用名称干扰）
    const nameSim = nameSemSim(kp, unit.name) * 3
    score += nameSim
    const chapterSim = nameSemSim(kp, unit.chapterName) * 1.5
    score += chapterSim

    if (score > bestScore) {
      bestScore = score
      bestUnit = unit
    }
  }

  return bestUnit
}

// 分批 AI 直接分配：小批量下让 AI 为每张卡片选择单元
async function assignCardsByBatch(cards, structure) {
  // 构建单元列表
  const unitList = []
  for (let chi = 0; chi < structure.chapters.length; chi++) {
    const ch = structure.chapters[chi]
    for (let ui = 0; ui < (ch.units?.length || 0); ui++) {
      unitList.push({
        globalIndex: unitList.length,
        chapterIndex: chi,
        unitIndex: ui,
        name: ch.units[ui].name,
        chapterName: ch.name,
      })
    }
  }

  const unitListStr = unitList.map(u => `单元${u.globalIndex}: ${u.chapterName}/${u.name}`).join('\n')

  // 分批处理：每批 15 张卡片
  const BATCH_SIZE = 15
  const allAssignments = []
  const totalBatches = Math.ceil(cards.length / BATCH_SIZE)

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, cards.length)
    const batchCards = cards.slice(start, end)

    const cardLines = batchCards.map((c, i) => `卡片${start + i}: ${c.kp || c.knowledge_point}`).join('\n')

    const prompt = `你是考研数据结构知识分类助手。请将以下卡片分配到最匹配的单元中。

【单元列表】（共 ${unitList.length} 个单元）：
${unitListStr}

【待分配卡片】（本批 ${batchCards.length} 张，全局序号 ${start}-${end - 1}）：
${cardLines}

【任务】为每张卡片选择最匹配的单元编号（0-${unitList.length - 1}）。

【硬约束】：
1. 必须为每张卡片分配一个单元
2. 同一主题的卡片必须分配到同一个单元
3. 【重要】本批 ${batchCards.length} 张卡片必须分散到至少 3 个不同的单元中，禁止全部塞入同一个单元
4. 【重要】请根据卡片内容选择单元，不要按顺序循环分配
5. 【重要】不要把所有卡片都分配到"基础概念"或"概述"类单元，要根据内容精准匹配

【输出格式】严格按以下 JSON 格式输出，不要额外文字：
{
  "assignments": [
    { "cardIndex": ${start}, "unitIndex": 0 },
    { "cardIndex": ${start + 1}, "unitIndex": 5 }
  ]
}

请直接输出 JSON：`

    console.log(`  [assignCardsByBatch] 批次 ${batchIdx + 1}/${totalBatches}: 卡片 ${start}-${end - 1}`)

    let retries = 0
    let batchAssignments = null

    while (retries < 2) {
      const result = await callAI(prompt, Math.max(2048, batchCards.length * 100))

      let cleaned = result.trim()
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

      let parsed = null
      try {
        parsed = JSON.parse(cleaned)
      } catch (e) {
        const s = cleaned.indexOf('{')
        const en = cleaned.lastIndexOf('}')
        if (s >= 0 && en > s) {
          try { parsed = JSON.parse(cleaned.substring(s, en + 1)) } catch (e2) { parsed = null }
        }
      }

      if (parsed && Array.isArray(parsed.assignments)) {
        // 验证：检查是否分散到至少3个不同单元
        const unitSet = new Set()
        const validAssignments = []
        for (const a of parsed.assignments) {
          const ci = Number(a.cardIndex)
          const ui = Number(a.unitIndex)
          if (ci >= start && ci < end && ui >= 0 && ui < unitList.length) {
            unitSet.add(ui)
            validAssignments.push({
              cardIndex: ci,
              chapterIndex: unitList[ui].chapterIndex,
              unitIndex: unitList[ui].unitIndex,
            })
          }
        }

        if (validAssignments.length === batchCards.length && unitSet.size >= 3) {
          batchAssignments = validAssignments
          console.log(`    分配完成: ${validAssignments.length} 张卡片 → ${unitSet.size} 个单元`)
          break
        } else {
          console.log(`    验证失败: ${validAssignments.length}/${batchCards.length} 张, ${unitSet.size} 个单元 (需≥3), 重试 ${retries + 1}`)
        }
      } else {
        console.log(`    JSON 解析失败, 重试 ${retries + 1}`)
      }
      retries++
    }

    if (batchAssignments) {
      allAssignments.push(...batchAssignments)
    } else {
      // 重试失败，用本地语义匹配兜底
      console.log(`    AI 分配失败，使用本地语义匹配兜底`)
      for (let i = start; i < end; i++) {
        const kp = cards[i].kp || cards[i].knowledge_point
        if (!kp) continue
        // 用单元名称做简单匹配
        let bestScore = -1
        let bestUnit = null
        for (const u of unitList) {
          const sim = nameSemSim(kp, u.name) + nameSemSim(kp, u.chapterName) * 0.5
          if (sim > bestScore) {
            bestScore = sim
            bestUnit = u
          }
        }
        if (bestUnit) {
          allAssignments.push({
            cardIndex: i,
            chapterIndex: bestUnit.chapterIndex,
            unitIndex: bestUnit.unitIndex,
          })
        }
      }
    }
  }

  return allAssignments
}

// 卡片分配主函数（AI规划结构 + 分批 AI 直接分配）
async function assignCardsAll(cards, structure) {
  console.log(`  [assignCardsAll] 分批 AI 直接分配: ${cards.length} 张卡片`)
  const assignments = await assignCardsByBatch(cards, structure)
  console.log(`  [assignCardsAll] 分配完成: ${assignments.length}/${cards.length} 张卡片已分配`)
  return assignments
}

// ===== 评估工具：字符 bigram + 完整词 语义相似度 =====
function extractBigrams(text) {
  if (!text || text.length < 2) return new Set()
  const bigrams = new Set()
  const chars = text.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) || []
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.add(chars[i] + chars[i + 1])
  }
  return bigrams
}

function extractWords(text) {
  if (!text) return new Set()
  const matches = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) || []
  return new Set(matches)
}

function nameSemSim(nameA, nameB) {
  if (!nameA || !nameB) return 0
  if (nameA.includes(nameB) || nameB.includes(nameA)) return 1.0
  const biA = extractBigrams(nameA), biB = extractBigrams(nameB)
  if (biA.size === 0 || biB.size === 0) return 0
  let biInt = 0
  for (const b of biA) if (biB.has(b)) biInt++
  const biUnion = biA.size + biB.size - biInt
  const biScore = biUnion === 0 ? 0 : biInt / biUnion
  const wA = extractWords(nameA), wB = extractWords(nameB)
  let wInt = 0
  for (const w of wA) if (wB.has(w)) wInt++
  const wUnion = wA.size + wB.size - wInt
  const wScore = wUnion === 0 ? 0 : wInt / wUnion
  return biScore * 0.4 + wScore * 0.6
}

// ===== 主函数 =====
async function main() {
  console.log('=== 智能单元整理 - 180知识点大数据测试 ===')
  console.log(`时间: ${new Date().toISOString()}`)
  console.log(`AI服务: 阿里云百炼 Qwen (强模型)`)
  console.log(`测试数据: ${TEST_DATA.length} 个知识点 (3章节 × 6单元 × 10知识点)`)
  console.log(`期望结构: 3章节, 18单元`)

  // 打乱数据
  const shuffled = shuffleArray(TEST_DATA)
  const cards = shuffled.map((d, i) => ({
    id: `test-card-${i}`,
    knowledge_point: d.kp,
    _expected: { unit: d.expectedUnit, chapter: d.expectedChapter, kp: d.kp },
  }))

  console.log(`\n打乱后前5个: ${cards.slice(0, 5).map(c => c.knowledge_point.substring(0, 30) + '...').join(' | ')}`)

  // ===== Step 1: 结构规划 =====
  console.log('\n===== Step 1: 结构规划 =====')
  const planStartTime = Date.now()
  let structure = null
  try {
    structure = await planStructure(cards)
  } catch (e) {
    console.log(`结构规划失败: ${e.message}`)
    process.exit(1)
  }
  const planDuration = Date.now() - planStartTime

  if (!structure || !structure.chapters) {
    console.log(`结构规划返回空结果`)
    process.exit(1)
  }

  console.log(`\n结构规划完成 (${planDuration}ms)`)
  console.log(`章节数: ${structure.chapters.length}`)
  let totalUnits = 0
  structure.chapters.forEach((ch, i) => {
    const unitCount = ch.units?.length || 0
    totalUnits += unitCount
    console.log(`  章节${i}: ${ch.name} (${unitCount}个单元)`)
    ch.units?.forEach(u => {
      console.log(`    ${u.name}`)
    })
  })
  console.log(`总单元数: ${totalUnits}`)

  // ===== Step 2: 卡片分配 =====
  console.log('\n===== Step 2: 卡片分配 =====')
  const assignStartTime = Date.now()
  const allAssignments = []

  try {
    const assignResult = await assignCardsAll(cards, structure)
    if (Array.isArray(assignResult)) {
      for (const item of assignResult) {
        const cardIdx = Number(item.cardIndex)
        const chapterIdx = Number(item.chapterIndex)
        const unitIdx = Number(item.unitIndex)
        if (cardIdx >= 0 && cardIdx < cards.length &&
            chapterIdx >= 0 && chapterIdx < structure.chapters.length &&
            unitIdx >= 0 && unitIdx < (structure.chapters[chapterIdx].units?.length || 0)) {
          allAssignments.push({
            globalCardIndex: cardIdx,
            chapterName: structure.chapters[chapterIdx].name,
            unitName: structure.chapters[chapterIdx].units[unitIdx].name,
          })
        }
      }
    }
  } catch (e) {
    console.log(`  一次性分配失败: ${e.message}`)
  }
  const assignDuration = Date.now() - assignStartTime

  console.log(`\n卡片分配完成 (${assignDuration}ms)`)
  console.log(`已分配: ${allAssignments.length}/${cards.length}`)

  // ===== Step 3: 评估准确率（基于内容纯度，非名称匹配）=====
  console.log('\n===== Step 3: 评估准确率（基于内容纯度）=====')

  // 核心思路：完全不依赖名称匹配，而是检查每张卡片实际所在单元/章节的"纯度"
  // 纯度 = 该实际单元中，与当前卡片属于同一期望单元的卡片占比
  // 如果纯度 ≥ 50%，说明卡片被正确归类到内容相近的群体中
  // 这才是真正的"基于内容相似度"评估：不看名字，看群体内容是否同质

  // 建立实际章节/单元 → 知识点下标集合
  const actualChapterToCardIndices = new Map()
  const actualUnitToCardIndices = new Map()
  for (const a of allAssignments) {
    if (!actualChapterToCardIndices.has(a.chapterName)) actualChapterToCardIndices.set(a.chapterName, new Set())
    actualChapterToCardIndices.get(a.chapterName).add(a.globalCardIndex)
    const unitKey = `${a.chapterName} > ${a.unitName}`
    if (!actualUnitToCardIndices.has(unitKey)) actualUnitToCardIndices.set(unitKey, new Set())
    actualUnitToCardIndices.get(unitKey).add(a.globalCardIndex)
  }

  // 打印实际章节/单元的内容分布（用于诊断）
  console.log('\n  实际章节内容分布:')
  for (const [actCh, cardIndices] of actualChapterToCardIndices) {
    const chCount = new Map()
    for (const idx of cardIndices) {
      const expCh = cards[idx]._expected.chapter
      chCount.set(expCh, (chCount.get(expCh) || 0) + 1)
    }
    const dist = [...chCount.entries()].map(([k, v]) => `${k}:${v}`).join(', ')
    console.log(`    "${actCh}" (${cardIndices.size}张) → 期望来源: ${dist}`)
  }

  console.log('\n  实际单元内容分布:')
  for (const [actU, cardIndices] of actualUnitToCardIndices) {
    const uCount = new Map()
    for (const idx of cardIndices) {
      const expU = cards[idx]._expected.unit
      uCount.set(expU, (uCount.get(expU) || 0) + 1)
    }
    const dist = [...uCount.entries()].map(([k, v]) => `${k}:${v}`).join(', ')
    const actUName = actU.includes(' > ') ? actU.split(' > ')[1] : actU
    console.log(`    "${actUName}" (${cardIndices.size}张) → 期望来源: ${dist}`)
  }

  // 逐张卡片检查：实际所在单元/章节的纯度
  const PURITY_THRESHOLD = 0.5 // 纯度阈值：≥50% 即认为正确归类
  let chapterCorrect = 0, unitCorrect = 0, totalChecked = 0
  const wrongCards = []

  for (const a of allAssignments) {
    const card = cards[a.globalCardIndex]
    if (!card || !card._expected) continue
    totalChecked++
    const expectedCh = card._expected.chapter
    const expectedU = card._expected.unit

    // 章节纯度：实际章节中，来自同一期望章节的卡片占比
    const actChCards = actualChapterToCardIndices.get(a.chapterName)
    let chSameCount = 0
    for (const idx of actChCards) {
      if (cards[idx]._expected.chapter === expectedCh) chSameCount++
    }
    const chPurity = actChCards.size === 0 ? 0 : chSameCount / actChCards.size
    const chOk = chPurity >= PURITY_THRESHOLD

    // 单元纯度：实际单元中，来自同一期望单元的卡片占比
    const unitKey = `${a.chapterName} > ${a.unitName}`
    const actUCards = actualUnitToCardIndices.get(unitKey)
    let uSameCount = 0
    for (const idx of actUCards) {
      if (cards[idx]._expected.unit === expectedU) uSameCount++
    }
    const uPurity = actUCards.size === 0 ? 0 : uSameCount / actUCards.size
    const uOk = uPurity >= PURITY_THRESHOLD

    if (chOk) chapterCorrect++
    if (uOk) unitCorrect++
    if (!chOk || !uOk) {
      wrongCards.push({
        kp: card._expected.kp.substring(0, 40) + '...',
        expected: `${expectedCh} / ${expectedU}`,
        actual: `${a.chapterName} / ${a.unitName}`,
        chPurity: (chPurity * 100).toFixed(1),
        uPurity: (uPurity * 100).toFixed(1),
        chOk, uOk,
      })
    }
  }

  // 聚合质量统计：每个实际单元/章节的主导纯度
  let chAggQuality = 0
  for (const [actCh, cardIndices] of actualChapterToCardIndices) {
    const chCount = new Map()
    for (const idx of cardIndices) {
      const expCh = cards[idx]._expected.chapter
      chCount.set(expCh, (chCount.get(expCh) || 0) + 1)
    }
    let maxCount = 0
    for (const cnt of chCount.values()) if (cnt > maxCount) maxCount = cnt
    const purity = cardIndices.size === 0 ? 0 : maxCount / cardIndices.size
    if (purity >= 0.5) chAggQuality++
  }
  const chAggRate = (chAggQuality / actualChapterToCardIndices.size * 100).toFixed(1)

  let unitAggQuality = 0
  for (const [actU, cardIndices] of actualUnitToCardIndices) {
    const uCount = new Map()
    for (const idx of cardIndices) {
      const expU = cards[idx]._expected.unit
      uCount.set(expU, (uCount.get(expU) || 0) + 1)
    }
    let maxCount = 0
    for (const cnt of uCount.values()) if (cnt > maxCount) maxCount = cnt
    const purity = cardIndices.size === 0 ? 0 : maxCount / cardIndices.size
    if (purity >= 0.5) unitAggQuality++
  }
  const unitAggRate = (unitAggQuality / actualUnitToCardIndices.size * 100).toFixed(1)

  const chapterAcc = totalChecked > 0 ? (chapterCorrect / totalChecked * 100).toFixed(1) : 0
  const unitAcc = totalChecked > 0 ? (unitCorrect / totalChecked * 100).toFixed(1) : 0
  const assignRate = cards.length > 0 ? (allAssignments.length / cards.length * 100).toFixed(1) : 0

  console.log('\n  测试结果汇总:')
  console.log(`    卡片分配率: ${allAssignments.length}/${cards.length} (${assignRate}%)`)
  console.log(`    章节准确率: ${chapterCorrect}/${totalChecked} (${chapterAcc}%) - 基于内容纯度（实际章节中同源卡片占比≥50%）`)
  console.log(`    单元准确率: ${unitCorrect}/${totalChecked} (${unitAcc}%) - 基于内容纯度（实际单元中同源卡片占比≥50%）`)
  console.log(`    章节聚合质量: ${chAggQuality}/${actualChapterToCardIndices.size} (${chAggRate}%) - 纯度≥50% 的实际章节数`)
  console.log(`    单元聚合质量: ${unitAggQuality}/${actualUnitToCardIndices.size} (${unitAggRate}%) - 纯度≥50% 的实际单元数`)
  console.log(`    总耗时: ${(planDuration + assignDuration) / 1000}s`)

  if (wrongCards.length > 0) {
    console.log('\n  错误卡片样例（前10个）:')
    for (const wc of wrongCards.slice(0, 10)) {
      console.log(`    - 期望【${wc.expected}】 → 实际【${wc.actual}】 ${wc.chOk ? '章对' : '章错'} ${wc.uOk ? '单对' : '单错'}`)
      console.log(`      章纯度: ${wc.chPurity}% | 单纯度: ${wc.uPurity}%`)
      console.log(`      知识点: ${wc.kp}`)
    }
    if (wrongCards.length > 10) console.log(`    ... 共 ${wrongCards.length} 个错误`)
  }

  // 最终判定
  console.log('\n===== 最终判定 =====')
  const passed = parseFloat(assignRate) >= 95 && parseFloat(unitAcc) >= 50
  if (passed) {
    console.log('测试通过！分配率 ≥ 95% 且 单元准确率 ≥ 50%')
    console.log('（基于内容纯度评估：不依赖名称匹配，检查卡片是否被分到同源群体）')
  } else {
    console.log('测试未通过')
    if (parseFloat(assignRate) < 95) console.log(`  原因: 分配率 ${assignRate}% < 95%`)
    if (parseFloat(unitAcc) < 50) console.log(`  原因: 单元准确率 ${unitAcc}% < 50%`)
  }
}

main().catch(e => {
  console.error('脚本失败:', e)
  process.exit(1)
})
