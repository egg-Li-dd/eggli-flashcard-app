export class AiServiceInterface {
  async extractKnowledgePoints(text, options = {}) {
    throw new Error('extractKnowledgePoints not implemented')
  }

  async clusterKnowledgePoints(knowledgePoints, options = {}) {
    throw new Error('clusterKnowledgePoints not implemented')
  }

  async reorganizeUnits(categoryName, allCards, existingUnitNames, options = {}) {
    throw new Error('reorganizeUnits not implemented')
  }

  async generateCards(knowledgePoints, options = {}) {
    throw new Error('generateCards not implemented')
  }

  async judgeTopicMerge(newTopics, existingChapters, existingUnits, newCards, options = {}) {
    throw new Error('judgeTopicMerge not implemented')
  }

  async judgeUnitMerge(newUnits, existingUnits, newCards, options = {}) {
    throw new Error('judgeUnitMerge not implemented')
  }

  async deduplicateKnowledgePoints(knowledgePoints, options = {}) {
    throw new Error('deduplicateKnowledgePoints not implemented')
  }

  getModelType() {
    return 'unknown'
  }

  supportsBatchProcessing() {
    return false
  }
}

export const AI_SERVICE_MODES = {
  DEEPSEEK: 'deepseek',
  SPARK: 'iflytek-spark',
  VOLCANO: 'volcano',
  DASHSCOPE: 'dashscope',
}

export const MODEL_TYPES = {
  STRONG: 'strong',
  WEAK: 'weak',
}
