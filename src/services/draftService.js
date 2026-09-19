import {
  addDraft,
  getPendingDrafts,
  getPendingDraftsByCategory,
  getRecentDrafts,
  getDraftCount,
  updateDraft,
  deleteDraft,
  deleteDraftsByStatus,
  getDraftById,
  addUnits,
  addCardsToUnit,
  getDraftsFromKnowledgeTree,
  getDraftCountFromKnowledgeTree,
  addKnowledgeTreeNode,
  updateKnowledgeTreeNode,
  deleteKnowledgeTreeNode,
} from './db'
import { generateCards } from './aiService'

/**
 * 保存一条草稿（悬浮窗发送入口）
 * @param {Object} params - { content, categoryId, chapterId, unitId, templateType }
 * @returns {Object} 草稿对象
 */
export async function saveDraft(params) {
  if (!params.content || !String(params.content).trim()) {
    throw new Error('内容不能为空')
  }
  
  const draft = await addDraft(params)
  
  // 有归属分类时才写入知识树节点
  if (params.categoryId) {
    await addKnowledgeTreeNode({
      level: 'card',
      parentId: params.unitId || null,
      categoryId: params.categoryId,
      chapterId: params.chapterId || null,
      unitId: params.unitId || null,
      content: params.content,
      front: params.content,
      back: null,
      status: 'pending',
      source: 'manual',
      templateType: params.templateType || null,
    })
  }
  
  return draft
}

/**
 * 批量生成草稿为卡片
 * - 每条草稿独立调用 generateCards
 * - 失败自动重试，最多3次
 * - 3次仍失败则标记 status='failed'，errorMessage 记录原因
 * - 如果 draft.unitId 存在 → 追加到已有单元（addCardsToUnit）
 * - 如果 draft.unitId 为空 → 新建单元并写入卡片（addUnits）
 * @param {Array<string>} draftIds - 草稿 ID 列表（空数组或 null 则处理全部 pending）
 * @param {Object} aiConfig - { apiKey, model, aiServiceMode, sparkApiKey, sparkApiSecret, volcanoApiKey, dashscopeApiKey, summaryLevel }
 * @param {Function} onProgress - (current, total, draftId, status, error) => void
 * @returns {Object} { total, success, failed, results: [{ id, status, error }] }
 */
export async function generateCardsFromDrafts(draftIds, aiConfig, onProgress) {
  let drafts
  if (draftIds && draftIds.length > 0) {
    drafts = []
    for (const id of draftIds) {
      const d = await getDraftById(id)
      if (d) drafts.push(d)
    }
  } else {
    drafts = await getPendingDrafts()
  }

  const results = []
  let success = 0
  let failed = 0

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    let lastError = null

    // 标记为生成中
    await updateDraft(draft.id, { status: 'generating', errorMessage: null })

    // 自动重试3次
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // 调用现有 generateCards（返回 AI 文本）
        const aiContent = await generateCards(
          draft.content,
          aiConfig.apiKey,
          aiConfig.model,
          aiConfig.aiServiceMode,
          aiConfig.summaryLevel || 'medium',
          aiConfig.sparkApiKey,
          aiConfig.sparkApiSecret,
          aiConfig.volcanoApiKey,
          aiConfig.dashscopeApiKey,
        )

        // 解析 AI 返回的内容为卡片数组
        const cards = parseAiContentToCards(aiContent, draft)

        if (cards.length === 0) {
          throw new Error('AI 未返回有效卡片内容')
        }

        // 写入数据库：根据是否有 unitId 分支
        if (draft.unitId) {
          // 追加到已有单元
          await addCardsToUnit(draft.unitId, draft.categoryId, cards)
        } else {
          // 新建单元并写入卡片
          await addUnits(draft.categoryId, [{
            name: extractUnitName(draft),
            chapterId: draft.chapterId || null,
            cards,
          }])
        }

        // 标记成功
        await updateDraft(draft.id, {
          status: 'done',
          generatedAt: Date.now(),
          retryCount: attempt - 1,
          errorMessage: null,
        })
        success++
        results.push({ id: draft.id, status: 'done', error: null })
        lastError = null
        break
      } catch (err) {
        lastError = err?.message || String(err)
        if (attempt < 3) {
          // 等待 1 秒后重试
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    // 3次仍失败
    if (lastError) {
      await updateDraft(draft.id, {
        status: 'failed',
        retryCount: 3,
        errorMessage: lastError,
      })
      failed++
      results.push({ id: draft.id, status: 'failed', error: lastError })
    }

    if (typeof onProgress === 'function') {
      onProgress(i + 1, drafts.length, draft.id, lastError ? 'failed' : 'done', lastError)
    }
  }

  return { total: drafts.length, success, failed, results }
}

/**
 * 解析 AI 返回内容为卡片数组
 * 兼容现有 generateCards 的 JSON 输出格式：{ units: [{ name, cards: [{front, back, knowledge_point}] }] }
 * 或纯文本格式
 */
function parseAiContentToCards(aiContent, draft) {
  try {
    // 尝试 JSON 解析
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.units && Array.isArray(parsed.units)) {
        // 取第一个单元的卡片
        return (parsed.units[0]?.cards || []).map(c => ({
          front: c.front || c.question || '',
          back: c.back || c.answer || '',
          knowledge_point: c.knowledge_point || draft.content,
        }))
      }
      if (parsed.cards && Array.isArray(parsed.cards)) {
        return parsed.cards.map(c => ({
          front: c.front || c.question || '',
          back: c.back || c.answer || '',
          knowledge_point: c.knowledge_point || draft.content,
        }))
      }
    }
  } catch (_) {
    // JSON 解析失败，降级为纯文本处理
  }

  // 降级：把整段 AI 内容作为一张卡片的 back，原始输入作为 front
  return [{
    front: draft.content,
    back: aiContent.slice(0, 500),
    knowledge_point: draft.content,
  }]
}

/**
 * 从草稿提取单元名（用于自动命名新建的单元）
 */
function extractUnitName(draft) {
  const text = draft.content || ''
  // 取前 20 字符作为单元名
  return text.slice(0, 20) + (text.length > 20 ? '...' : '') || '快速录入'
}

/**
 * 重试单条失败的草稿
 */
export async function retryDraft(draftId, aiConfig) {
  const result = await generateCardsFromDrafts([draftId], aiConfig)
  return result.results[0]
}

/**
 * 获取草稿统计信息（用于悬浮窗红点提示）
 * 优先从 knowledgeTree 获取，回退到旧 drafts 表
 */
export async function getDraftStats(categoryId) {
  try {
    const pending = await getDraftCountFromKnowledgeTree('pending', categoryId)
    const failed = await getDraftCountFromKnowledgeTree('failed', categoryId)
    if (pending + failed > 0) {
      return { pending, failed, total: pending + failed, source: 'knowledgeTree' }
    }
  } catch (_) {}
  
  const pending = await getDraftCount('pending')
  const failed = await getDraftCount('failed')
  return { pending, failed, total: pending + failed, source: 'drafts' }
}

export {
  addDraft,
  getPendingDrafts,
  getPendingDraftsByCategory,
  getRecentDrafts,
  getDraftCount,
  updateDraft,
  deleteDraft,
  deleteDraftsByStatus,
  getDraftsFromKnowledgeTree,
  getDraftCountFromKnowledgeTree,
}
