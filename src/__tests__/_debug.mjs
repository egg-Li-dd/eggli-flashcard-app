import { LITE_QUESTION_TYPES, LITE_BATCH_SIZE } from '../utils/constants.js'
import { analyzeQuestionMatrix } from '../services/testQuestionService.js'

const sampleCards = Array.from({ length: 5 }, (_, i) => ({
  id: `card_${i + 1}`,
  knowledge_point: `知识点${i + 1}`,
  front: `问题${i + 1}？`,
  back: `答案${i + 1}`,
}))

const matrix = analyzeQuestionMatrix(sampleCards, [])

const batches = []
for (let i = 0; i < sampleCards.length; i += LITE_BATCH_SIZE) {
  batches.push(sampleCards.slice(i, i + LITE_BATCH_SIZE))
}

const maxFullBatches = 2
const questionTypes = LITE_QUESTION_TYPES.map(t => t.type)

const tasks = []
const cardHasTask = new Map()
for (const card of sampleCards) cardHasTask.set(String(card.id || '').trim(), false)

batches.forEach((batch, batchIdx) => {
  const typesForBatch = batchIdx < maxFullBatches ? questionTypes : ['single_choice', 'true_false']
  for (const type of typesForBatch) {
    const allOverflow = batch.every(card => {
      const cid = String(card.id || '').trim()
      if (!cid) return false
      const have = matrix.byCardType.get(cid) || {}
      return (have[type] || 0) >= 5
    })
    if (allOverflow) continue
    for (const card of batch) {
      const cid = String(card.id || '').trim()
      if (cid) cardHasTask.set(cid, true)
    }
    tasks.push({ batchIdx, type })
  }
})

const cardsWithoutTask = []
cardHasTask.forEach((hasTask, cid) => {
  if (!hasTask && cid) {
    const card = sampleCards.find(c => String(card.id || '').trim() === cid)
    if (card) cardsWithoutTask.push(card)
  }
})

console.log('batches:', batches.length)
console.log('tasks:', tasks.length, tasks.map(t => `batch${t.batchIdx}-${t.type}`))
console.log('cardsWithoutTask:', cardsWithoutTask.length)
console.log('cardHasTask:', [...cardHasTask.entries()])
