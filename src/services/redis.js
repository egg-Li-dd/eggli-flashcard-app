import { httpPost } from '../utils/httpClient'

const DEEPSEEK_EMBEDDING_URL = 'https://api.deepseek.com/embeddings'
const REDIS_INDEX_NAME = 'cards_vector_idx'

let redisAvailable = true

export function setRedisAvailable(available) {
  redisAvailable = available
}

export function isRedisAvailable() {
  return redisAvailable
}

export async function initCardVectorIndex(redisClient) {
  if (!redisAvailable || !redisClient) {
    console.warn('[redis-vector] Redis 不可用，跳过索引初始化')
    return false
  }

  try {
    const dimensions = 1024
    await redisClient.createIndex({
      name: REDIS_INDEX_NAME,
      algorithm: 'HNSW',
      vectorType: 'FLOAT32',
      dimensions: dimensions,
      distanceMetric: 'COSINE',
      parameters: {
        M: 6,
        EF_CONSTRUCTION: 200,
      },
    })
    return true
  } catch (err) {
    console.error('[redis-vector] 创建索引失败:', err?.message)
    redisAvailable = false
    return false
  }
}

export async function getEmbedding(text, apiKey, model = 'deepseek-embedding') {
  if (!text || !apiKey) {
    console.warn('[redis-vector] 缺少 text 或 apiKey 参数')
    return null
  }

  try {
    const response = await httpPost(DEEPSEEK_EMBEDDING_URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      data: {
        input: text,
        model: model,
      },
      timeout: 30000,
    })

    if (!response.ok) {
      const msg = response.data?.error?.message || 'Embedding 请求失败 (' + response.status + ')'
      console.error('[redis-embedding] HTTP 错误:', response.status, msg)
      return null
    }

    const embedding = response.data?.data?.[0]?.embedding
    if (!embedding || !Array.isArray(embedding)) {
      console.error('[redis-embedding] 返回的 embedding 数据格式无效')
      return null
    }

    return embedding
  } catch (err) {
    console.error('[redis-embedding] 调用失败:', err?.message)
    return null
  }
}

export async function indexCard(redisClient, cardId, front, back, unitId, categoryId, embedding) {
  if (!redisAvailable || !redisClient) {
    console.warn('[redis-vector] Redis 不可用，跳过卡片索引')
    return false
  }

  if (!cardId || !embedding || !Array.isArray(embedding)) {
    console.warn('[redis-vector] 缺少必要参数 cardId 或 embedding')
    return false
  }

  try {
    const cardHashKey = `card:${cardId}`
    const metadataKey = `card:${cardId}:meta`

    await redisClient.setHash(cardHashKey, {
      id: String(cardId),
      front: front || '',
      back: back || '',
      unitId: unitId ? String(unitId) : '',
      categoryId: categoryId ? String(categoryId) : '',
      vector: embedding,
    })

    await redisClient.setHash(metadataKey, {
      id: String(cardId),
      unitId: unitId ? String(unitId) : '',
      categoryId: categoryId ? String(categoryId) : '',
    })

    return true
  } catch (err) {
    console.error('[redis-vector] 索引卡片失败:', err?.message)
    return false
  }
}

export async function findSimilarCards(redisClient, categoryId, embedding, threshold = 0.7, limit = 5) {
  if (!redisAvailable || !redisClient) {
    console.warn('[redis-vector] Redis 不可用，返回空结果')
    return []
  }

  if (!embedding || !Array.isArray(embedding)) {
    console.warn('[redis-vector] 缺少有效的 embedding')
    return []
  }

  try {
    const results = await redisClient.searchIndex(REDIS_INDEX_NAME, {
      vector: embedding,
      limit: limit * 2,
      returnFields: ['id', 'front', 'back', 'unitId', 'categoryId'],
    })

    if (!results || !Array.isArray(results)) {
      return []
    }

    const filteredResults = results
      .filter((item) => {
        const score = item?.score ?? 0
        const itemCategoryId = item?.categoryId || item?.fields?.categoryId
        const categoryMatch = categoryId ? String(itemCategoryId) === String(categoryId) : true
        const similarity = 1 - score
        return categoryMatch && similarity >= threshold
      })
      .slice(0, limit)
      .map((item) => ({
        id: item?.id || item?.fields?.id,
        front: item?.front || item?.fields?.front || '',
        back: item?.back || item?.fields?.back || '',
        unitId: item?.unitId || item?.fields?.unitId || '',
        categoryId: item?.categoryId || item?.fields?.categoryId || '',
        similarity: item?.score ? 1 - item.score : 0,
      }))

    return filteredResults
  } catch (err) {
    console.error('[redis-vector] 相似卡片查询失败:', err?.message)
    return []
  }
}

export async function deleteCardIndex(redisClient, cardId) {
  if (!redisAvailable || !redisClient) {
    return false
  }

  if (!cardId) {
    return false
  }

  try {
    const cardHashKey = `card:${cardId}`
    const metadataKey = `card:${cardId}:meta`
    await redisClient.deleteKey(cardHashKey)
    await redisClient.deleteKey(metadataKey)
    return true
  } catch (err) {
    console.error('[redis-vector] 删除卡片索引失败:', err?.message)
    return false
  }
}

export async function clearAllIndexes(redisClient) {
  if (!redisAvailable || !redisClient) {
    return false
  }

  try {
    await redisClient.deleteIndex(REDIS_INDEX_NAME)
    return true
  } catch (err) {
    console.error('[redis-vector] 清除索引失败:', err?.message)
    return false
  }
}
