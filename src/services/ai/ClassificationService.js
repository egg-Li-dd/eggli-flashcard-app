import { AiServiceInterface } from './AiServiceInterface'
import { DeepSeekAdapter, SparkLiteAdapter, DashscopeAdapter, VolcanoEngineAdapter } from './adapters'
import { ClassificationStateMachine, CLASSIFICATION_STATES } from './ClassificationStateMachine'
import { ClassificationResult, Unit, Chapter, Topic, KnowledgePoint, CardAssignment } from './dataModels'
import { AiTimeoutError } from '../aiService'

const MODEL_TYPES = { STRONG: 'strong', WEAK: 'weak' }

export class ClassificationService {
  constructor(config) {
    this.config = config
    this.aiAdapter = this._createAiAdapter(config)
    this.stateMachine = new ClassificationStateMachine()
    this.currentResult = null
    this.abortController = null
  }

  _createAiAdapter(config) {
    const mode = config.aiServiceMode || 'deepseek'
    switch (mode) {
      case 'iflytek-spark':
        return new SparkLiteAdapter(config)
      case 'volcano':
        return new VolcanoEngineAdapter(config)
      case 'dashscope':
        return new DashscopeAdapter(config)
      default:
        return new DeepSeekAdapter(config)
    }
  }

  getModelType() {
    return this.aiAdapter.getModelType()
  }

  isStrongModel() {
    return this.aiAdapter.getModelType() === MODEL_TYPES.STRONG
  }

  isWeakModel() {
    return this.aiAdapter.getModelType() === MODEL_TYPES.WEAK
  }

  subscribe(listener) {
    return this.stateMachine.subscribe(listener)
  }

  unsubscribe(listener) {
    return this.stateMachine.unsubscribe(listener)
  }

  getState() {
    return this.stateMachine.state
  }

  getContext() {
    return this.stateMachine.context
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.stateMachine.dispatch('CANCEL')
  }

  async reorganizeUnits(categoryName, allCards, existingUnitNames = [], existingChapters = [], options = {}) {
    if (!allCards || allCards.length === 0) {
      throw new Error('该分类下没有卡片，无法整理')
    }

    this.abortController = new AbortController()
    this.stateMachine.dispatch('START_EXTRACT')

    try {
      const hasChapters = existingChapters && existingChapters.length > 0
      this.stateMachine.dispatch('SET_CONTEXT', { categoryName, totalCards: allCards.length, hasChapters })

      if (this.isWeakModel()) {
        return await this._reorganizeUnitsWeakModel(categoryName, allCards, existingUnitNames, existingChapters, options)
      } else {
        return await this._reorganizeUnitsStrongModel(categoryName, allCards, existingUnitNames, existingChapters, options)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.stateMachine.dispatch('CANCEL')
        throw new Error('操作已取消')
      }
      this.stateMachine.dispatch('FAIL', { error: error.message })
      throw error
    } finally {
      this.abortController = null
    }
  }

  async _reorganizeUnitsStrongModel(categoryName, allCards, existingUnitNames, existingChapters, options) {
    this.stateMachine.dispatch('START_MERGE')
    const result = await this.aiAdapter.reorganizeUnits(categoryName, allCards, existingUnitNames, {
      ...options,
      existingChapters,
      signal: this.abortController?.signal
    })

    const classificationResult = this._parseReorganizeResult(result, allCards.length)
    if (!classificationResult.validate(allCards.length).valid) {
      throw new Error('AI返回的单元结构验证失败')
    }

    this.currentResult = classificationResult
    this.stateMachine.dispatch('MERGE_COMPLETE', { result: classificationResult })
    return classificationResult
  }

  async _reorganizeUnitsWeakModel(categoryName, allCards, existingUnitNames, existingChapters, options) {
    this.stateMachine.dispatch('START_MERGE')
    const BATCH_SIZE = 50
    const batches = []
    for (let i = 0; i < allCards.length; i += BATCH_SIZE) {
      batches.push(allCards.slice(i, i + BATCH_SIZE))
    }

    const batchResults = []
    let failedBatchCount = 0
    const failedBatches = []

    for (let i = 0; i < batches.length; i++) {
      if (this.abortController?.signal?.aborted) {
        throw new Error('操作已取消')
      }

      const batch = batches[i]
      const offset = i * BATCH_SIZE
      this.stateMachine.dispatch('SET_CONTEXT', { batchIndex: i + 1, totalBatches: batches.length })

      try {
        const batchResult = await this.aiAdapter.reorganizeUnits(categoryName, batch, existingUnitNames, {
          ...options,
          existingChapters,
          signal: this.abortController?.signal
        })
        batchResults.push({ result: batchResult, offset })
      } catch (err) {
        console.warn('弱模型分批整理失败，跳过该批:', err.message)
        failedBatchCount++
        failedBatches.push({ batchIndex: i, offset, error: err.message })
        
        for (let j = offset; j < Math.min(offset + BATCH_SIZE, allCards.length); j++) {
          if (!batchResults.some(br => {
            const start = br.offset
            const end = start + (br.result?.units?.reduce((sum, u) => sum + (u.cardIndices?.length || 0), 0) || BATCH_SIZE)
            return j >= start && j < end
          })) {
            console.warn(`卡片 ${j} 因批次失败未被处理`)
          }
        }
      }
    }

    const mergedResult = this._mergeBatchResults(batchResults, allCards.length)
    
    mergedResult.failedBatches = failedBatches
    mergedResult.failedBatchCount = failedBatchCount

    if (!mergedResult.validate(allCards.length).valid) {
      throw new Error('合并后的单元结构验证失败')
    }

    this.currentResult = mergedResult

    if (failedBatchCount > 0) {
      this.stateMachine.dispatch('MERGE_PARTIAL', { 
        result: mergedResult,
        failedBatches: failedBatchCount,
        totalBatches: batches.length,
        message: `${failedBatchCount} 个批次处理失败，已将未处理卡片放入"未分类"单元`
      })
    } else {
      this.stateMachine.dispatch('MERGE_COMPLETE', { result: mergedResult })
    }

    return mergedResult
  }

  _mergeBatchResults(batchResults, totalCards) {
    const chaptersMap = new Map()
    const unitsMap = new Map()
    const assignedSet = new Set()
    const invalidIndices = []
    const duplicateAssignments = []

    for (const { result, offset } of batchResults) {
      if (offset < 0 || offset >= totalCards) {
        console.warn(`[ClassificationService] 无效的批次偏移量: ${offset}, 总卡片数: ${totalCards}`)
        continue
      }

      if (result.chapters && result.chapters.length > 0) {
        for (const ch of result.chapters) {
          let chapter = chaptersMap.get(ch.name)
          if (!chapter) {
            chapter = new Chapter(ch.name)
            chaptersMap.set(ch.name, chapter)
          }
          for (const u of ch.units || []) {
            let unit = unitsMap.get(u.name)
            if (!unit) {
              unit = new Unit(u.name)
              unitsMap.set(u.name, unit)
              chapter.addUnit(unit)
            }
            const rawIndices = u.cardIndices || []
            for (const rawIdx of rawIndices) {
              if (typeof rawIdx !== 'number' || isNaN(rawIdx)) {
                invalidIndices.push({ rawIdx, offset, reason: '索引不是有效数字', unitName: u.name })
                continue
              }
              const adjustedIdx = rawIdx + offset
              if (adjustedIdx < 0) {
                invalidIndices.push({ rawIdx, adjustedIdx, offset, reason: '调整后索引为负数', unitName: u.name })
                continue
              }
              if (adjustedIdx >= totalCards) {
                invalidIndices.push({ rawIdx, adjustedIdx, offset, reason: '调整后索引越界', unitName: u.name })
                continue
              }
              if (assignedSet.has(adjustedIdx)) {
                duplicateAssignments.push({ cardIndex: adjustedIdx, unitName: u.name })
                continue
              }
              unit.addCard(adjustedIdx)
              assignedSet.add(adjustedIdx)
            }
          }
        }
      } else if (result.units && result.units.length > 0) {
        for (const u of result.units) {
          let unit = unitsMap.get(u.name)
          if (!unit) {
            unit = new Unit(u.name)
            unitsMap.set(u.name, unit)
          }
          const rawIndices = u.cardIndices || []
          for (const rawIdx of rawIndices) {
            if (typeof rawIdx !== 'number' || isNaN(rawIdx)) {
              invalidIndices.push({ rawIdx, offset, reason: '索引不是有效数字', unitName: u.name })
              continue
            }
            const adjustedIdx = rawIdx + offset
            if (adjustedIdx < 0) {
              invalidIndices.push({ rawIdx, adjustedIdx, offset, reason: '调整后索引为负数', unitName: u.name })
              continue
            }
            if (adjustedIdx >= totalCards) {
              invalidIndices.push({ rawIdx, adjustedIdx, offset, reason: '调整后索引越界', unitName: u.name })
              continue
            }
            if (assignedSet.has(adjustedIdx)) {
              duplicateAssignments.push({ cardIndex: adjustedIdx, unitName: u.name })
              continue
            }
            unit.addCard(adjustedIdx)
            assignedSet.add(adjustedIdx)
          }
        }
      }
    }

    const missingCards = []
    for (let i = 0; i < totalCards; i++) {
      if (!assignedSet.has(i)) missingCards.push(i)
    }

    if (missingCards.length > 0) {
      let fallbackChapter = chaptersMap.get('其他')
      if (!fallbackChapter) {
        fallbackChapter = new Chapter('其他')
        chaptersMap.set('其他', fallbackChapter)
      }
      const fallbackUnit = new Unit('未分类卡片')
      for (const idx of missingCards) {
        fallbackUnit.addCard(idx)
        assignedSet.add(idx)
      }
      fallbackChapter.addUnit(fallbackUnit)
    }

    for (const chapter of chaptersMap.values()) {
      chapter.units = chapter.units.filter(u => u.getCardCount() > 0)
    }

    const chapters = Array.from(chaptersMap.values()).filter(c => c.getUnitCount() > 0 || c.getCardCount() > 0)
    const units = chapters.length > 0 ? [] : Array.from(unitsMap.values()).filter(u => u.getCardCount() > 0)

    const classificationResult = new ClassificationResult(chapters, units, [])
    classificationResult.missingCards = missingCards.map(idx => ({ cardIndex: idx, reason: '未被分配' }))
    classificationResult.invalidIndices = invalidIndices
    classificationResult.duplicateAssignments = duplicateAssignments
    classificationResult.totalCards = totalCards
    classificationResult.assignedCount = assignedSet.size

    return classificationResult
  }

  _parseReorganizeResult(result, totalCards) {
    const chapters = []
    const units = []
    const topics = []

    if (result.topics && result.topics.length > 0) {
      for (const t of result.topics) {
        const topic = new Topic(t.name)
        if (t.chapters && t.chapters.length > 0) {
          for (const ch of t.chapters) {
            const chapter = new Chapter(ch.name)
            if (ch.units && ch.units.length > 0) {
              for (const u of ch.units) {
                const unit = new Unit(u.name)
                for (const idx of u.cardIndices || []) {
                  if (typeof idx === 'number' && idx >= 0 && idx < totalCards) {
                    unit.addCard(idx)
                  }
                }
                for (const kp of u.knowledgePoints || []) {
                  unit.addKnowledgePoint(new KnowledgePoint(`kp-${Date.now()}-${Math.random().toString(36).slice(2)}`, kp.content || ''))
                }
                if (unit.getCardCount() > 0) {
                  chapter.addUnit(unit)
                }
              }
            }
            if (chapter.getUnitCount() > 0) {
              topic.addChapter(chapter)
            }
          }
        }
        if (t.units && t.units.length > 0) {
          for (const u of t.units) {
            const unit = new Unit(u.name)
            for (const idx of u.cardIndices || []) {
              if (typeof idx === 'number' && idx >= 0 && idx < totalCards) {
                unit.addCard(idx)
              }
            }
            for (const kp of u.knowledgePoints || []) {
              unit.addKnowledgePoint(new KnowledgePoint(`kp-${Date.now()}-${Math.random().toString(36).slice(2)}`, kp.content || ''))
            }
            if (unit.getCardCount() > 0) {
              topic.units.push(unit)
            }
          }
        }
        if (topic.getChapterCount() > 0 || topic.getUnitCount() > 0) {
          topics.push(topic)
        }
      }
      return new ClassificationResult([], [], [], topics)
    }

    if (result.chapters && result.chapters.length > 0) {
      for (const ch of result.chapters) {
        const chapter = new Chapter(ch.name)
        if (ch.units && ch.units.length > 0) {
          for (const u of ch.units) {
            const unit = new Unit(u.name)
            for (const idx of u.cardIndices || []) {
              if (typeof idx === 'number' && idx >= 0 && idx < totalCards) {
                unit.addCard(idx)
              }
            }
            for (const kp of u.knowledgePoints || []) {
              unit.addKnowledgePoint(new KnowledgePoint(`kp-${Date.now()}-${Math.random().toString(36).slice(2)}`, kp.content || ''))
            }
            if (unit.getCardCount() > 0) {
              chapter.addUnit(unit)
            }
          }
        }
        if (chapter.getUnitCount() > 0 || chapter.getCardCount() > 0) {
          chapters.push(chapter)
        }
      }
    } else if (result.units && result.units.length > 0) {
      for (const u of result.units) {
        const unit = new Unit(u.name)
        for (const idx of u.cardIndices || []) {
          if (typeof idx === 'number' && idx >= 0 && idx < totalCards) {
            unit.addCard(idx)
          }
        }
        for (const kp of u.knowledgePoints || []) {
          unit.addKnowledgePoint(new KnowledgePoint(`kp-${Date.now()}-${Math.random().toString(36).slice(2)}`, kp.content || ''))
        }
        if (unit.getCardCount() > 0) {
          units.push(unit)
        }
      }
    }

    return new ClassificationResult(chapters, units, [])
  }

  async classifyByAi(categoryName, allCards, options = {}) {
    if (!allCards || allCards.length === 0) {
      throw new Error('该分类下没有卡片，无法分类')
    }

    this.abortController = new AbortController()
    this.stateMachine.dispatch('START_EXTRACT')

    try {
      const granularity = options.granularity || 'standard'
      const maxMergeRounds = options.maxMergeRounds || 2

      this.stateMachine.dispatch('SET_CONTEXT', {
        categoryName,
        totalCards: allCards.length,
        granularity,
        maxMergeRounds
      })

      const knowledgePoints = await this._extractKnowledgePoints(allCards, options)
      if (knowledgePoints.length === 0) {
        throw new Error('未能提取任何知识点')
      }

      const topics = await this._clusterKnowledgePoints(knowledgePoints, granularity, options)
      if (topics.length === 0) {
        throw new Error('未能生成任何主题')
      }

      const mergedTopics = await this._mergeTopics(topics, knowledgePoints, maxMergeRounds, options)
      const classificationResult = this._convertTopicsToResult(mergedTopics, knowledgePoints, allCards)

      this.currentResult = classificationResult
      this.stateMachine.dispatch('COMPLETE', { result: classificationResult })
      return { knowledgePoints, topics: mergedTopics, result: classificationResult }

    } catch (error) {
      if (error.name === 'AbortError') {
        this.stateMachine.dispatch('CANCEL')
        throw new Error('操作已取消')
      }
      this.stateMachine.dispatch('FAIL', { error: error.message })
      throw error
    } finally {
      this.abortController = null
    }
  }

  async _extractKnowledgePoints(allCards, options) {
    this.stateMachine.dispatch('START_EXTRACT')

    if (this.isWeakModel()) {
      return await this._extractKnowledgePointsWeakModel(allCards, options)
    } else {
      return await this._extractKnowledgePointsStrongModel(allCards, options)
    }
  }

  async _extractKnowledgePointsStrongModel(allCards, options) {
    const text = allCards.map((c, i) => `卡${i}: ${c.knowledge_point || c.front || ''}`).join('\n')
    const result = await this.aiAdapter.extractKnowledgePoints(text, {
      ...options,
      signal: this.abortController?.signal
    })
    return result.map((kp, i) => new KnowledgePoint(i, kp.content || kp, i))
  }

  _calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()
    if (s1 === s2) return 1
    const len1 = s1.length
    const len2 = s2.length
    const matrix = []
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
      }
    }
    const maxLen = Math.max(len1, len2)
    return 1 - matrix[len1][len2] / maxLen
  }

  async _extractKnowledgePointsWeakModel(allCards, options) {
    const BATCH_SIZE = 50
    const allPoints = []
    const seenKnowledgePoints = new Map()
    const DEDUPE_THRESHOLD = 0.85

    for (let i = 0; i < allCards.length; i += BATCH_SIZE) {
      if (this.abortController?.signal?.aborted) {
        throw new Error('操作已取消')
      }

      const batch = allCards.slice(i, i + BATCH_SIZE)
      const text = batch.map((c, j) => `卡${i + j}: ${c.knowledge_point || c.front || ''}`).join('\n')

      try {
        const result = await this.aiAdapter.extractKnowledgePoints(text, {
          ...options,
          signal: this.abortController?.signal
        })

        for (const kp of result) {
          const kpText = kp.content || kp || ''
          let isDuplicate = false
          let duplicateOf = null

          for (const [text, existingKp] of seenKnowledgePoints.entries()) {
            const similarity = this._calculateSimilarity(kpText, text)
            if (similarity >= DEDUPE_THRESHOLD) {
              isDuplicate = true
              duplicateOf = existingKp
              break
            }
          }

          if (isDuplicate) {
            if (duplicateOf && kp.sourceIndex !== undefined) {
              const adjustedSourceIndex = kp.sourceIndex + i
              if (adjustedSourceIndex >= 0 && adjustedSourceIndex < allCards.length) {
                duplicateOf.sourceIndices = duplicateOf.sourceIndices || []
                if (!duplicateOf.sourceIndices.includes(adjustedSourceIndex)) {
                  duplicateOf.sourceIndices.push(adjustedSourceIndex)
                }
              }
            }
            console.debug(`[ClassificationService] 检测到重复知识点: "${kpText.substring(0, 30)}..."`)
          } else {
            const newKp = new KnowledgePoint(allPoints.length, kpText, kp.sourceIndex !== undefined ? kp.sourceIndex + i : null)
            newKp.sourceIndices = [newKp.sourceIndex].filter(idx => idx !== null && idx !== undefined)
            allPoints.push(newKp)
            seenKnowledgePoints.set(kpText, newKp)
          }
        }
      } catch (err) {
        console.warn('弱模型知识点提取失败，跳过该批:', err.message)
      }
    }

    return allPoints
  }

  async _clusterKnowledgePoints(knowledgePoints, granularity, options) {
    this.stateMachine.dispatch('START_CLUSTER')

    if (this.isWeakModel()) {
      return await this._clusterKnowledgePointsWeakModel(knowledgePoints, granularity, options)
    } else {
      return await this._clusterKnowledgePointsStrongModel(knowledgePoints, granularity, options)
    }
  }

  async _clusterKnowledgePointsStrongModel(knowledgePoints, granularity, options) {
    const result = await this.aiAdapter.clusterKnowledgePoints(knowledgePoints, {
      ...options,
      granularity,
      signal: this.abortController?.signal
    })
    return result.map(t => new Topic(t.name || t.topicName, t.pointIndices || [], t.units?.map(u => Unit.fromJSON({ name: u.unitName, cardIndices: u.pointIndices })) || []))
  }

  async _clusterKnowledgePointsWeakModel(knowledgePoints, granularity, options) {
    const BATCH_SIZE = 100
    const allTopics = []

    for (let i = 0; i < knowledgePoints.length; i += BATCH_SIZE) {
      if (this.abortController?.signal?.aborted) {
        throw new Error('操作已取消')
      }

      const batch = knowledgePoints.slice(i, i + BATCH_SIZE)
      try {
        const result = await this.aiAdapter.clusterKnowledgePoints(batch, {
          ...options,
          granularity,
          signal: this.abortController?.signal
        })
        for (const t of result) {
          const adjustedIndices = (t.pointIndices || []).map(idx => idx + i)
          allTopics.push(new Topic(t.name || t.topicName, adjustedIndices, []))
        }
      } catch (err) {
        console.warn('弱模型主题聚类失败，跳过该批:', err.message)
      }
    }

    return allTopics
  }

  async _mergeTopics(topics, knowledgePoints, maxRounds, options) {
    this.stateMachine.dispatch('START_MERGE')

    let currentTopics = [...topics]
    let round = 0

    while (round < maxRounds && currentTopics.length > 1) {
      if (this.abortController?.signal?.aborted) {
        throw new Error('操作已取消')
      }

      this.stateMachine.dispatch('SET_CONTEXT', { mergeRound: round + 1, totalTopics: currentTopics.length })

      const mergePairs = this._findSimilarTopics(currentTopics)
      if (mergePairs.length === 0) {
        break
      }

      const mergedTopics = []
      const mergedIndices = new Set()

      for (const [idx1, idx2] of mergePairs) {
        if (mergedIndices.has(idx1) || mergedIndices.has(idx2)) continue

        const t1 = currentTopics[idx1]
        const t2 = currentTopics[idx2]
        const mergedName = this._mergeTopicNames(t1.name, t2.name)
        const mergedIndicesSet = new Set([...t1.pointIndices, ...t2.pointIndices])

        mergedTopics.push(new Topic(mergedName, Array.from(mergedIndicesSet), []))
        mergedIndices.add(idx1)
        mergedIndices.add(idx2)
      }

      for (let i = 0; i < currentTopics.length; i++) {
        if (!mergedIndices.has(i)) {
          mergedTopics.push(currentTopics[i])
        }
      }

      currentTopics = mergedTopics
      round++
    }

    return currentTopics
  }

  _findSimilarTopics(topics) {
    const pairs = []
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const similarity = this._calculateTopicSimilarity(topics[i], topics[j])
        if (similarity > 0.6) {
          pairs.push([i, j])
        }
      }
    }
    return pairs
  }

  _calculateTopicSimilarity(t1, t2) {
    const nameSim = this._calculateStringSimilarity(t1.name, t2.name)
    const pointOverlap = new Set(t1.pointIndices).size + new Set(t2.pointIndices).size > 0
      ? [...new Set(t1.pointIndices)].filter(i => t2.pointIndices.includes(i)).length /
        Math.max(t1.pointIndices.length, t2.pointIndices.length)
      : 0
    return (nameSim + pointOverlap) / 2
  }

  _calculateStringSimilarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2
    const shorter = s1.length > s2.length ? s2 : s1
    if (longer.length === 0) return 1.0
    return (longer.length - this._editDistance(longer, shorter)) / longer.length
  }

  _editDistance(s1, s2) {
    const costs = []
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j
        else {
          if (j > 0) {
            let newValue = costs[j - 1]
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
            }
            costs[j - 1] = lastValue
            lastValue = newValue
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue
    }
    return costs[s2.length]
  }

  _mergeTopicNames(name1, name2) {
    if (!name1 || !name2) return name1 || name2 || ''
    
    const s1 = name1.trim()
    const s2 = name2.trim()
    
    if (s1 === s2) return s1
    
    const s1Lower = s1.toLowerCase()
    const s2Lower = s2.toLowerCase()
    
    if (s1Lower.includes(s2Lower)) return s1
    if (s2Lower.includes(s1Lower)) return s2
    
    const commonPrefix = this._findCommonPrefix(s1, s2)
    const commonSuffix = this._findCommonSuffix(s1, s2)
    
    let result = ''
    
    if (commonPrefix.length >= 2) {
      const remaining1 = s1.substring(commonPrefix.length).replace(/^[、，,\/\\\-_\s]+/, '')
      const remaining2 = s2.substring(commonPrefix.length).replace(/^[、，,\/\\\-_\s]+/, '')
      
      if (remaining1 && remaining2) {
        result = `${commonPrefix}${remaining1}与${remaining2}`
      } else if (remaining1) {
        result = s1
      } else if (remaining2) {
        result = s2
      } else {
        result = s1
      }
    } else if (commonSuffix.length >= 2) {
      const remaining1 = s1.substring(0, s1.length - commonSuffix.length).replace(/[、，,\/\\\-_\s]+$/, '')
      const remaining2 = s2.substring(0, s2.length - commonSuffix.length).replace(/[、，,\/\\\-_\s]+$/, '')
      
      if (remaining1 && remaining2) {
        result = `${remaining1}与${remaining2}${commonSuffix}`
      } else if (remaining1) {
        result = s1
      } else if (remaining2) {
        result = s2
      } else {
        result = s1
      }
    } else {
      const keywords1 = this._extractKeywords(s1)
      const keywords2 = this._extractKeywords(s2)
      const commonKeywords = keywords1.filter(k => keywords2.includes(k))
      
      if (commonKeywords.length > 0) {
        const unique1 = keywords1.filter(k => !commonKeywords.includes(k))
        const unique2 = keywords2.filter(k => !commonKeywords.includes(k))
        const allKeywords = [...commonKeywords, ...unique1, ...unique2]
        
        if (allKeywords.length <= 4) {
          result = allKeywords.join('与')
        } else {
          result = `${s1}与${s2}`
        }
      } else {
        result = `${s1}与${s2}`
      }
    }
    
    if (result.length > 50) {
      result = result.substring(0, 50) + '...'
    }
    
    return result
  }

  _findCommonPrefix(str1, str2) {
    let prefix = ''
    const minLen = Math.min(str1.length, str2.length)
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) {
        prefix += str1[i]
      } else {
        break
      }
    }
    const lastSeparator = prefix.lastIndexOf('、')
    const lastComma = prefix.lastIndexOf('，')
    const lastSpace = prefix.lastIndexOf(' ')
    const lastDash = prefix.lastIndexOf('-')
    const lastSlash = prefix.lastIndexOf('/')
    const lastIndex = Math.max(lastSeparator, lastComma, lastSpace, lastDash, lastSlash)
    
    if (lastIndex > 0) {
      return prefix.substring(0, lastIndex + 1)
    }
    return prefix
  }

  _findCommonSuffix(str1, str2) {
    let suffix = ''
    const minLen = Math.min(str1.length, str2.length)
    for (let i = 0; i < minLen; i++) {
      if (str1[str1.length - 1 - i] === str2[str2.length - 1 - i]) {
        suffix = str1[str1.length - 1 - i] + suffix
      } else {
        break
      }
    }
    const firstSeparator = suffix.indexOf('、')
    const firstComma = suffix.indexOf('，')
    const firstSpace = suffix.indexOf(' ')
    const firstDash = suffix.indexOf('-')
    const firstSlash = suffix.indexOf('/')
    const firstIndex = Math.min(
      firstSeparator >= 0 ? firstSeparator : Infinity,
      firstComma >= 0 ? firstComma : Infinity,
      firstSpace >= 0 ? firstSpace : Infinity,
      firstDash >= 0 ? firstDash : Infinity,
      firstSlash >= 0 ? firstSlash : Infinity
    )
    
    if (firstIndex < Infinity) {
      return suffix.substring(firstIndex)
    }
    return suffix
  }

  _extractKeywords(str) {
    const separators = ['、', '，', ',', ' ', '-', '/', '与', '和', '及', '以及']
    let keywords = [str]
    
    for (const sep of separators) {
      keywords = keywords.flatMap(k => k.split(sep).map(s => s.trim()).filter(s => s))
    }
    
    return keywords.filter(k => k.length >= 2)
  }

  _convertTopicsToResult(topics, knowledgePoints, allCards) {
    const chapters = []
    const units = []
    const assignments = []
    const resultTopics = []
    const assignedCardIndices = new Set()
    const missingCards = []

    for (const topic of topics) {
      const resultTopic = new Topic(topic.name)
      for (const pointIdx of topic.pointIndices) {
        const kp = knowledgePoints[pointIdx]
        if (kp) {
          resultTopic.addKnowledgePoint(kp)
        }
      }
      if (topic.units && topic.units.length > 0) {
        for (const u of topic.units) {
          const unit = new Unit(u.name)
          for (const pointIdx of u.cardIndices || []) {
            const kp = knowledgePoints[pointIdx]
            if (kp && kp.sourceIndex !== null && kp.sourceIndex >= 0 && kp.sourceIndex < allCards.length) {
              unit.addCard(kp.sourceIndex)
              unit.addKnowledgePoint(kp)
              assignedCardIndices.add(kp.sourceIndex)
            } else if (kp && kp.sourceIndex !== null) {
              missingCards.push({ cardIndex: kp.sourceIndex, reason: '索引越界', knowledgePoint: kp.text })
            } else if (kp) {
              missingCards.push({ cardIndex: -1, reason: 'sourceIndex为空', knowledgePoint: kp.text })
            }
          }
          if (unit.getCardCount() > 0) {
            resultTopic.units.push(unit)
          }
        }
      } else {
        const unit = new Unit(topic.name)
        for (const pointIdx of topic.pointIndices) {
          const kp = knowledgePoints[pointIdx]
          if (kp && kp.sourceIndex !== null && kp.sourceIndex >= 0 && kp.sourceIndex < allCards.length) {
            unit.addCard(kp.sourceIndex)
            unit.addKnowledgePoint(kp)
            assignments.push(new CardAssignment(kp.sourceIndex, null, topic.name))
            assignedCardIndices.add(kp.sourceIndex)
          } else if (kp && kp.sourceIndex !== null) {
            missingCards.push({ cardIndex: kp.sourceIndex, reason: '索引越界', knowledgePoint: kp.text })
          } else if (kp) {
            missingCards.push({ cardIndex: -1, reason: 'sourceIndex为空', knowledgePoint: kp.text })
          }
        }
        if (unit.getCardCount() > 0) {
          resultTopic.units.push(unit)
        }
      }
      resultTopics.push(resultTopic)
    }

    for (let i = 0; i < allCards.length; i++) {
      if (!assignedCardIndices.has(i)) {
        missingCards.push({ cardIndex: i, reason: '未被分配', knowledgePoint: allCards[i]?.knowledge_point || allCards[i]?.front || '未知' })
      }
    }

    if (missingCards.length > 0) {
      const fallbackUnit = new Unit('未分类卡片')
      for (const missing of missingCards) {
        if (missing.cardIndex >= 0 && missing.cardIndex < allCards.length) {
          fallbackUnit.addCard(missing.cardIndex)
        }
      }
      if (fallbackUnit.getCardCount() > 0) {
        const fallbackTopic = new Topic('未分类')
        fallbackTopic.units.push(fallbackUnit)
        resultTopics.push(fallbackTopic)
      }
    }

    let classificationResult
    if (resultTopics.length > 0) {
      classificationResult = new ClassificationResult([], [], assignments, resultTopics)
    } else {
      classificationResult = new ClassificationResult(chapters, units, assignments)
    }

    classificationResult.missingCards = missingCards
    classificationResult.totalCards = allCards.length
    classificationResult.assignedCount = assignedCardIndices.size

    return classificationResult
  }

  async classifyByUser(confirmedTopics, allCards, options = {}) {
    if (!confirmedTopics || confirmedTopics.length === 0) {
      throw new Error('没有确认的主题')
    }
    if (!allCards || allCards.length === 0) {
      throw new Error('该分类下没有卡片')
    }

    this.stateMachine.dispatch('START_MERGE')

    try {
      const timeoutMs = options.timeout || 30000
      const useAiRefinement = options.useAiRefinement !== false

      let classificationResult

      if (useAiRefinement) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

          this.stateMachine.dispatch('START_CLUSTER', { stage: 'ai-refinement' })
          classificationResult = await this._refineClassificationWithAi(confirmedTopics, allCards, {
            ...options,
            signal: controller.signal
          })

          clearTimeout(timeoutId)
        } catch (err) {
          if (err.name === 'AbortError' || err.name === 'AiTimeoutError') {
            console.warn('AI优化超时，使用用户确认的主题')
            classificationResult = this._buildResultFromUserTopics(confirmedTopics, allCards)
          } else {
            throw err
          }
        }
      } else {
        classificationResult = this._buildResultFromUserTopics(confirmedTopics, allCards)
      }

      this.currentResult = classificationResult
      this.stateMachine.dispatch('COMPLETE', { result: classificationResult })
      return classificationResult

    } catch (error) {
      this.stateMachine.dispatch('FAIL', { error: error.message })
      throw error
    }
  }

  async _refineClassificationWithAi(confirmedTopics, allCards, options) {
    const topicNames = confirmedTopics.map(t => t.name || t)
    const text = allCards.map((c, i) => `卡${i}: ${c.knowledge_point || c.front || ''}`).join('\n')

    const result = await this.aiAdapter.reorganizeUnits('分类优化', allCards, topicNames, {
      ...options,
      existingChapters: [],
      signal: options.signal
    })

    return this._parseReorganizeResult(result, allCards.length)
  }

  _buildResultFromUserTopics(confirmedTopics, allCards) {
    const units = []

    for (const topic of confirmedTopics) {
      const unitName = topic.name || topic
      const unit = new Unit(unitName)

      if (topic.pointIndices && topic.pointIndices.length > 0) {
        for (const idx of topic.pointIndices) {
          if (typeof idx === 'number' && idx >= 0 && idx < allCards.length) {
            unit.addCard(idx)
          }
        }
      } else if (topic.cardIndices && topic.cardIndices.length > 0) {
        for (const idx of topic.cardIndices) {
          if (typeof idx === 'number' && idx >= 0 && idx < allCards.length) {
            unit.addCard(idx)
          }
        }
      }

      if (unit.getCardCount() > 0) {
        units.push(unit)
      }
    }

    return new ClassificationResult([], units, [])
  }

  validateResult(result, totalCards) {
    if (!(result instanceof ClassificationResult)) {
      return { valid: false, errors: ['无效的分类结果'] }
    }
    return result.validate(totalCards)
  }
}

export function createClassificationService(config) {
  return new ClassificationService(config)
}
