import { describe, it, expect } from 'vitest'
import { __test__ } from '../services/testQuestionService'

const { normalizeQuestion, validateQuestion, isKnowledgeLabel, normalizeChoiceLabel, containsForbiddenKeyword, jaccardSimilarity } = __test__

describe('validateQuestion - 弱模型畸形题目防御', () => {
  describe('单选/多选 - label 严格校验', () => {
    it('label 是判断词 "正确" 应被拦截（用户截图中的实际场景）', () => {
      const q = {
        type: 'single_choice',
        stem: '内存(RAM)最主要的特点是？',
        options: [
          { label: '正确', text: '断电后数据会被清空' },
          { label: '错误', text: '断电后数据不会丢失' },
          { label: '待掌握', text: '内存(RAM)的特点' },
          { label: '待掌握', text: '外存的特点' },
        ],
        answer: '正确',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      // 必须命中 label 非标准 / label 用了判断/状态词 / 选项 text 是知识点标签 这几类
      const joined = errors.join('|')
      expect(joined).toMatch(/label/i)
    })

    it('label 是状态词 "待掌握" 应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪个是内存特点？',
        options: [
          { label: '待掌握', text: '断电后数据会被清空' },
          { label: '已掌握', text: '断电后数据不会丢失' },
        ],
        answer: '待掌握',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/label.*判断|状态词|label/i)
    })

    it('label 归一化：小写字母应能通过 normalize 转为大写', () => {
      expect(normalizeChoiceLabel('a', 0)).toBe('A')
      expect(normalizeChoiceLabel('b', 1)).toBe('B')
      expect(normalizeChoiceLabel('1', 0)).toBe('A')
      expect(normalizeChoiceLabel('2', 1)).toBe('B')
      expect(normalizeChoiceLabel('(A)', 0)).toBe('A')
      expect(normalizeChoiceLabel('A.', 0)).toBe('A')
      expect(normalizeChoiceLabel('甲', 0)).toBe('A')
      // 标准大小写
      expect(normalizeChoiceLabel('A', 0)).toBe('A')
      expect(normalizeChoiceLabel('D', 3)).toBe('D')
    })
  })

  describe('单选/多选 - 选项 text 校验', () => {
    it('选项 text 是知识点标签 "内存的特点" 应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪项是内存RAM的特点？',
        options: [
          { label: 'A', text: '内存(RAM)的特点' },
          { label: 'B', text: '外存的特点' },
          { label: 'C', text: 'CPU的特点' },
          { label: 'D', text: '主板的特点' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/知识点标签/)
    })

    it('选项 text 是判断词 "正确" 应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列说法正确的是？',
        options: [
          { label: 'A', text: '正确' },
          { label: 'B', text: '内存断电后数据被清空' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/判断词/)
    })

    it('选项 text 包含状态词 "待掌握" 应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪项是已学内容？',
        options: [
          { label: 'A', text: '关于待掌握的知识点' },
          { label: 'B', text: '已掌握的计算机基础' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/状态词/)
    })

    it('选项 text 过短（<2字符）应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪项正确？',
        options: [
          { label: 'A', text: 'A' },
          { label: 'B', text: '内存' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/过短/)
    })

    it('选项 text 纯数字/符号应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪个数最大？',
        options: [
          { label: 'A', text: '123' },
          { label: 'B', text: '456' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/纯数字/)
    })
  })

  describe('题干-选项 冗余校验', () => {
    it('题干直接复述答案 + 选项重复题干内容应被拦截（用户截图中的实际场景）', () => {
      const q = {
        type: 'single_choice',
        stem: '内存（RAM）的特点是断电后数据会被清空，用于临时存放运行程序，读写速度快',
        options: [
          { label: 'A', text: '断电后数据会被清空' },
          { label: 'B', text: '断电后数据不会被清空' },
          { label: 'C', text: '内存(RAM)的特点' },
          { label: 'D', text: '外存（如硬盘、U盘、固态硬盘SSD）的特点' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      const joined = errors.join('|')
      // 题干本身是陈述句 → 应命中"题干缺少问号或疑问词"
      // 题干与选项A text 高度相似 → 应命中"题干与选项内容高度重复"
      // 选项C/D 是知识点标签 → 应命中"知识点标签"
      expect(joined).toMatch(/问号|疑问词|重复|标签/)
    })

    it('两个选项 text 高度相似应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪项是内存的特点？',
        options: [
          { label: 'A', text: '内存断电后数据会被清空' },
          { label: 'B', text: '内存断电后数据会被清空' },  // 与 A 几乎一样
          { label: 'C', text: '内存断电后数据不会丢失' },
          { label: 'D', text: '外存断电后数据永久保存' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/选项.*重复/)
    })
  })

  describe('单选题 - 题干必须像问题', () => {
    it('题干缺少问号或疑问词应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '内存的特点',
        options: [
          { label: 'A', text: '断电后数据被清空' },
          { label: 'B', text: '断电后数据永久保存' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/问号|疑问词/)
    })

    it('题干含"的特点是"等陈述短语但缺问号应被拦截', () => {
      const q = {
        type: 'single_choice',
        stem: '内存(RAM)的特点是断电后数据被清空',
        options: [
          { label: 'A', text: '断电后数据被清空' },
          { label: 'B', text: '断电后数据永久保存' },
        ],
        answer: 'A',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      const joined = errors.join('|')
      expect(joined).toMatch(/问号|疑问词|特点是/)
    })

    it('正常单选题（题干含问号 + 完整选项）应通过', () => {
      const q = {
        type: 'single_choice',
        stem: '下列哪项是内存(RAM)最主要的特点？',
        options: [
          { label: 'A', text: '断电后数据会被清空' },
          { label: 'B', text: '断电后数据永久保存' },
          { label: 'C', text: '存储容量比硬盘大' },
          { label: 'D', text: '读写速度比硬盘慢' },
        ],
        answer: 'A',
        analysis: 'RAM 是随机存取存储器，断电后数据丢失是其核心特点',
        difficulty: 2,
        knowledgePoint: '内存与外存的区别',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeNull()
    })
  })

  describe('多选题 - 必须含"多选"标记', () => {
    it('题干缺少"多选"标记应被拦截', () => {
      const q = {
        type: 'multi_choice',
        stem: '下列哪些是内存的特点？',  // 没有"多选"或"可多选"
        options: [
          { label: 'A', text: '断电后数据被清空' },
          { label: 'B', text: '读写速度快' },
          { label: 'C', text: '容量无限' },
          { label: 'D', text: '可被CPU直接访问' },
        ],
        answer: 'ABD',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/多选/)
    })

    it('答案选项少于 2 个应被拦截', () => {
      const q = {
        type: 'multi_choice',
        stem: '下列哪些是内存的特点？（多选题）',
        options: [
          { label: 'A', text: '断电后数据被清空' },
          { label: 'B', text: '读写速度快' },
          { label: 'C', text: '容量无限' },
        ],
        answer: 'A',  // 只有一个
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/至少 2 个/)
    })
  })

  describe('判断题 - 严格校验', () => {
    it('判断题 options 数量不是 2 应被拦截', () => {
      const q = {
        type: 'true_false',
        stem: '判断以下说法是否正确：内存断电后数据会被清空。',
        options: [
          { label: '正确', text: '正确' },
          // 故意缺少"错误"选项
        ],
        answer: '正确',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/2 个选项|必须包含/)
    })

    it('判断题 options label 不是"正确/错误"应被拦截', () => {
      const q = {
        type: 'true_false',
        stem: '判断以下说法是否正确：内存断电后数据会被清空。',
        options: [
          { label: 'A', text: '正确' },
          { label: 'B', text: '错误' },
        ],
        answer: '正确',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/必须包含/)
    })

    it('判断题答案不是"正确/错误"应被拦截', () => {
      const q = {
        type: 'true_false',
        stem: '判断以下说法是否正确：内存断电后数据会被清空。',
        options: [
          { label: '正确', text: '正确' },
          { label: '错误', text: '错误' },
        ],
        answer: 'A',  // 错！判断题答案应该是"正确"或"错误"
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/必须.*正确.*错误/)
    })
  })

  describe('填空题 - 必须含 ____', () => {
    it('题干缺少 ____ 标记应被拦截', () => {
      const q = {
        type: 'fill_blank',
        stem: '内存断电后数据会被清空',
        options: [],
        answer: '清空',
      }
      const errors = validateQuestion(q)
      expect(errors).toBeTruthy()
      expect(errors.join('|')).toMatch(/填空标记|____/)
    })
  })
})

describe('normalizeQuestion - 自动修正', () => {
  it('小写 label 归一为大写', () => {
    const q = {
      type: 'single_choice',
      stem: '下列哪项是内存特点？',
      options: [
        { label: 'a', text: '断电后数据被清空' },
        { label: 'b', text: '断电后数据永久保存' },
      ],
      answer: 'a',
    }
    const norm = normalizeQuestion(q)
    expect(norm.options[0].label).toBe('A')
    expect(norm.options[1].label).toBe('B')
    expect(norm.answer).toBe('A')
  })

  it('多选题答案 "BAC" 排序去重为 "ABC"', () => {
    const q = {
      type: 'multi_choice',
      stem: '下列哪些是内存特点？（多选题）',
      options: [
        { label: 'A', text: '断电后数据被清空' },
        { label: 'B', text: '读写速度快' },
        { label: 'C', text: '容量大' },
      ],
      answer: 'BAC',
    }
    const norm = normalizeQuestion(q)
    expect(norm.answer).toBe('ABC')
  })

  it('判断题答案 "true" 归一为 "正确"', () => {
    const q = {
      type: 'true_false',
      stem: '判断以下说法是否正确：内存断电后数据会被清空。',
      options: [
        { label: '正确', text: '正确' },
        { label: '错误', text: '错误' },
      ],
      answer: 'true',
    }
    const norm = normalizeQuestion(q)
    expect(norm.answer).toBe('正确')
  })

  it('判断题题干缺前缀自动补"判断以下说法是否正确："', () => {
    const q = {
      type: 'true_false',
      stem: '内存断电后数据会被清空。',
      options: [
        { label: '正确', text: '正确' },
        { label: '错误', text: '错误' },
      ],
      answer: '正确',
    }
    const norm = normalizeQuestion(q)
    expect(norm.stem).toMatch(/^判断以下说法是否正确：内存断电后数据会被清空/)
  })

  it('字符串数组形式的 options 正确解析', () => {
    const q = {
      type: 'single_choice',
      stem: '下列哪项是内存特点？',
      options: ['A. 断电后数据被清空', 'B. 断电后数据永久保存'],
      answer: 'A',
    }
    const norm = normalizeQuestion(q)
    expect(Array.isArray(norm.options)).toBe(true)
    expect(norm.options[0].label).toBe('A')
    expect(norm.options[0].text).toBe('断电后数据被清空')
  })
})

describe('isKnowledgeLabel - 知识点标签检测', () => {
  it('"内存的特点" 应被识别为标签', () => {
    expect(isKnowledgeLabel('内存的特点')).toBe(true)
    expect(isKnowledgeLabel('外存的特点')).toBe(true)
    expect(isKnowledgeLabel('OSI七层模型的定义')).toBe(true)
  })

  it('正常陈述句不应被识别为标签', () => {
    expect(isKnowledgeLabel('断电后数据会被清空')).toBe(false)
    expect(isKnowledgeLabel('内存(RAM)最主要的特点是断电后数据被清空')).toBe(false)
  })
})

describe('containsForbiddenKeyword - 关键词检测', () => {
  it('应能检测状态词和判断词', () => {
    expect(containsForbiddenKeyword('关于待掌握的内容', ['待掌握', '已掌握'])).toBe('待掌握')
    expect(containsForbiddenKeyword('正常内容', ['待掌握', '已掌握'])).toBeNull()
  })
})

describe('jaccardSimilarity - 文本相似度', () => {
  it('高度相似的文本应返回高值', () => {
    const sim = jaccardSimilarity('内存断电后数据会被清空', '内存断电后数据会被清空')
    expect(sim).toBe(1)
  })

  it('部分相似文本应返回中等值', () => {
    const sim = jaccardSimilarity('内存断电后数据被清空', '外存断电后数据被保存')
    expect(sim).toBeGreaterThan(0.2)
    expect(sim).toBeLessThan(0.5)
  })

  it('完全不同文本应返回低值', () => {
    const sim = jaccardSimilarity('苹果是红色的水果', '编程语言的类型系统')
    expect(sim).toBeLessThan(0.2)
  })
})

describe('集成 - 用户截图中的畸形题目应被完整拦截', () => {
  it('用户截图的完整题目应被校验拒绝', () => {
    // 模拟用户截图：题干"内存(RAM)的特点是断电后数据会被清空…"
    // + 4 个选项 label 分别是"正确/错误/待掌握/待掌握"
    // + 选项 text 是"断电后数据会被清空/断电后数据不会被清空/内存(RAM)的特点/外存的特点"
    const userQuestion = {
      type: 'single_choice',
      stem: '内存（RAM）的特点是断电后数据会被清空，用于临时存放运行程序，读写速度快。',
      options: [
        { label: '正确', text: '断电后数据会被清空' },
        { label: '错误', text: '断电后数据不会被清空' },
        { label: '待掌握', text: '内存（RAM）的特点' },
        { label: '待掌握', text: '外存（如硬盘、U盘、固态硬盘SSD）的特点' },
      ],
      answer: '正确',
    }
    const errors = validateQuestion(userQuestion)
    expect(errors).toBeTruthy()
    const joined = errors.join(' | ')
    console.log('用户截图题目被拦截的错误:', joined)
    // 至少命中 label 非标准、label 判断词、text 知识点标签、题干缺问号 这几类
    expect(joined).toMatch(/label/)
    expect(joined).toMatch(/知识点标签/)
  })
})
