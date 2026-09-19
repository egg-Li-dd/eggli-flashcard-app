import { describe, expect, test } from '@jest/globals'
import { ClassificationResult, Unit, Chapter, Topic, KnowledgePoint, CardAssignment } from '../services/ai/dataModels'
import { JsonParser } from '../services/ai/jsonParser'
import { ClassificationService } from '../services/ai/ClassificationService'

describe('数据模型校验', () => {
  test('ClassificationResult.validate - 有效结构', () => {
    const units = [new Unit('单元1', [0, 1, 2]), new Unit('单元2', [3, 4])]
    const result = new ClassificationResult([], units, [])
    const validation = result.validate(5)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  test('ClassificationResult.validate - 卡片丢失', () => {
    const units = [new Unit('单元1', [0, 1])]
    const result = new ClassificationResult([], units, [])
    const validation = result.validate(5)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('卡片分配不完整')
  })

  test('ClassificationResult.validate - 重复分配', () => {
    const units = [new Unit('单元1', [0, 1, 1])]
    const result = new ClassificationResult([], units, [])
    const validation = result.validate(2)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('重复分配')
  })

  test('ClassificationResult.validate - 章节结构验证', () => {
    const units = [new Unit('单元1', [0, 1]), new Unit('单元2', [2, 3])]
    const chapters = [new Chapter('章节1', units)]
    const result = new ClassificationResult(chapters, [], [])
    const validation = result.validate(4)
    expect(validation.valid).toBe(true)
  })

  test('Topic.fromJSON/toJSON - 序列化正确性', () => {
    const topic = new Topic('测试主题', [0, 1, 2], [new Unit('子单元', [0, 1])])
    const json = topic.toJSON()
    const restored = Topic.fromJSON(json)
    expect(restored.name).toBe('测试主题')
    expect(restored.pointIndices).toEqual([0, 1, 2])
    expect(restored.units).toHaveLength(1)
  })

  test('KnowledgePoint.fromJSON/toJSON - 序列化正确性', () => {
    const kp = new KnowledgePoint('kp-001', '知识点内容', 0)
    const json = kp.toJSON()
    const restored = KnowledgePoint.fromJSON(json)
    expect(restored.id).toBe('kp-001')
    expect(restored.content).toBe('知识点内容')
    expect(restored.sourceIndex).toBe(0)
  })

  test('CardAssignment.isValid - 有效分配', () => {
    const assignment = new CardAssignment(0, '章节1', '单元1')
    expect(assignment.isValid()).toBe(true)
  })

  test('CardAssignment.isValid - 无效分配', () => {
    const assignment = new CardAssignment(-1)
    expect(assignment.isValid()).toBe(false)
  })
})

describe('JSON解析策略', () => {
  test('直接解析 - 有效JSON', () => {
    const raw = '{"units": [{"name": "测试", "cardIndices": [0, 1]}]}'
    const result = JsonParser.parseWithFallback(raw)
    expect(result).toHaveProperty('units')
    expect(result.units).toHaveLength(1)
  })

  test('边界提取 - 包含额外文本', () => {
    const raw = '以下是结果：{"units": [{"name": "测试", "cardIndices": [0, 1]}]} 结束'
    const result = JsonParser.parseWithFallback(raw)
    expect(result).toHaveProperty('units')
    expect(result.units).toHaveLength(1)
  })

  test('代码块移除 - 包含markdown代码块', () => {
    const raw = '```json\n{"units": [{"name": "测试", "cardIndices": [0, 1]}]}\n```'
    const result = JsonParser.parseWithFallback(raw)
    expect(result).toHaveProperty('units')
    expect(result.units).toHaveLength(1)
  })

  test('尾部逗号修复 - 包含尾部逗号', () => {
    const raw = '{"units": [{"name": "测试", "cardIndices": [0, 1,]},]}'
    const result = JsonParser.parseWithFallback(raw)
    expect(result).toHaveProperty('units')
    expect(result.units).toHaveLength(1)
  })

  test('组合策略 - 包含多种格式问题', () => {
    const raw = '结果如下：\n```json\n{"units": [{"name": "测试", "cardIndices": [0, 1,]},]}\n```\n以上是结果'
    const result = JsonParser.parseWithFallback(raw)
    expect(result).toHaveProperty('units')
    expect(result.units).toHaveLength(1)
  })

  test('extractArray - 直接数组', () => {
    const raw = '[1, 2, 3]'
    const result = JsonParser.extractArray(raw)
    expect(result).toEqual([1, 2, 3])
  })

  test('extractArray - 嵌套在对象中', () => {
    const raw = '{"data": [1, 2, 3]}'
    const result = JsonParser.extractArray(raw)
    expect(result).toEqual([1, 2, 3])
  })

  test('extractArray - 解析失败返回空数组', () => {
    const raw = '无效内容'
    const result = JsonParser.extractArray(raw)
    expect(result).toEqual([])
  })

  test('safeParse - 解析失败返回fallback', () => {
    const raw = '无效内容'
    const result = JsonParser.safeParse(raw, { fallback: true })
    expect(result).toEqual({ fallback: true })
  })
})

describe('卡片丢失防护', () => {
  test('验证所有卡片都被分配', () => {
    const totalCards = 10
    const units = [
      new Unit('单元1', [0, 1, 2]),
      new Unit('单元2', [3, 4, 5]),
      new Unit('单元3', [6, 7, 8, 9])
    ]
    const result = new ClassificationResult([], units, [])
    const validation = result.validate(totalCards)
    expect(validation.valid).toBe(true)
    expect(result.getTotalCardCount()).toBe(totalCards)
  })

  test('检测未分配的卡片', () => {
    const totalCards = 5
    const units = [new Unit('单元1', [0, 1])]
    const result = new ClassificationResult([], units, [])
    const validation = result.validate(totalCards)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('卡片分配不完整')
  })

  test('检测超出范围的卡片索引', () => {
    const totalCards = 5
    const units = [new Unit('单元1', [0, 1, 10])]
    const result = new ClassificationResult([], units, [])
    const assignedCount = units[0].getCardCount()
    expect(assignedCount).toBe(2)
  })

  test('章节结构中的卡片完整性', () => {
    const totalCards = 8
    const chapters = [
      new Chapter('章节1', [
        new Unit('单元1', [0, 1, 2]),
        new Unit('单元2', [3, 4])
      ]),
      new Chapter('章节2', [
        new Unit('单元3', [5, 6, 7])
      ])
    ]
    const result = new ClassificationResult(chapters, [], [])
    const validation = result.validate(totalCards)
    expect(validation.valid).toBe(true)
    expect(result.getTotalCardCount()).toBe(totalCards)
  })
})

describe('分类服务初始化', () => {
  test('创建ClassificationService - DeepSeek', () => {
    const config = { aiServiceMode: 'deepseek', apiKey: 'test-key' }
    const service = new ClassificationService(config)
    expect(service).toBeInstanceOf(ClassificationService)
    expect(service.isStrongModel()).toBe(true)
  })

  test('创建ClassificationService - Spark Lite', () => {
    const config = { aiServiceMode: 'iflytek-spark', sparkApiKey: 'test-key' }
    const service = new ClassificationService(config)
    expect(service).toBeInstanceOf(ClassificationService)
    expect(service.isWeakModel()).toBe(true)
  })

  test('创建ClassificationService - 默认DeepSeek', () => {
    const config = { apiKey: 'test-key' }
    const service = new ClassificationService(config)
    expect(service.isStrongModel()).toBe(true)
  })

  test('状态机初始状态为IDLE', () => {
    const config = { apiKey: 'test-key' }
    const service = new ClassificationService(config)
    expect(service.getState()).toBe('IDLE')
  })

  test('订阅/取消订阅状态变化', () => {
    const config = { apiKey: 'test-key' }
    const service = new ClassificationService(config)
    let notified = false
    const listener = () => { notified = true }
    service.subscribe(listener)
    service.stateMachine.dispatch('START_EXTRACT')
    expect(notified).toBe(true)
    service.unsubscribe(listener)
    notified = false
    service.stateMachine.dispatch('START_CLUSTER')
    expect(notified).toBe(false)
  })
})

describe('分类结果模式检测', () => {
  test('unit-only模式', () => {
    const units = [new Unit('单元1', [0, 1])]
    const result = new ClassificationResult([], units, [])
    expect(result.getMode()).toBe('unit-only')
  })

  test('chapter-only模式', () => {
    const chapters = [new Chapter('章节1', [])]
    const result = new ClassificationResult(chapters, [], [])
    expect(result.getMode()).toBe('chapter-only')
  })

  test('chapter-and-unit模式', () => {
    const chapters = [new Chapter('章节1', [new Unit('单元1', [0, 1])])]
    const result = new ClassificationResult(chapters, [], [])
    expect(result.getMode()).toBe('chapter-and-unit')
  })
})
