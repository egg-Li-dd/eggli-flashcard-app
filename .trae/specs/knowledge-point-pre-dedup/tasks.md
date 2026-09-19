# Tasks - 知识点预去重机制

## 任务清单

### Task 1: 创建知识点去重核心函数 `deduplicateKnowledgePoints`

- [ ] SubTask 1.1: 在 `aiService.js` 中新增 `deduplicateKnowledgePoints` 主函数
- [ ] SubTask 1.2: 实现强模型路径 `deduplicateWithStrongModel`
  - [ ] batchSize = 30-50
  - [ ] maxExistingInPrompt = 100
  - [ ] 相似度阈值 = 0.75
- [ ] SubTask 1.3: 实现弱模型路径 `deduplicateWithSpark`
  - [ ] batchSize = 20-30
  - [ ] maxExistingInPrompt = 50
  - [ ] 相似度阈值 = 0.70
  - [ ] markdown 格式剥离
  - [ ] 容错 JSON 解析
- [ ] SubTask 1.4: 实现分批处理逻辑（根据模型类型自适应）
- [ ] SubTask 1.5: 实现结果合并与全局索引修正

### Task 2: 创建本地 fallback 降级函数 `localDedupFallback`

- [ ] SubTask 2.1: 实现精确匹配（Set 查找）
- [ ] SubTask 2.2: 实现子串匹配（包含关系）
- [ ] SubTask 2.3: 合并两种匹配结果

### Task 3: 获取本分类现有知识点 `getExistingKnowledgePointsByCategory`

- [ ] SubTask 3.1: 分析现有数据结构（cards 表的 knowledge_point 字段）
- [ ] SubTask 3.2: 实现从数据库批量获取本分类所有唯一知识点
- [ ] SubTask 3.3: 性能优化（避免全量加载所有卡片）

### Task 4: 修改 `handleKpConfirm` 流程集成去重

- [ ] SubTask 4.1: 在主题聚类前调用 `deduplicateKnowledgePoints`
- [ ] SubTask 4.2: 添加去重结果 Toast 提示
- [ ] SubTask 4.3: 处理去重失败降级逻辑

### Task 5: 测试验证

- [ ] SubTask 5.1: 强模型去重测试（40个知识点，部分重复）
- [ ] SubTask 5.2: 弱模型去重测试（40个知识点，部分重复）
- [ ] SubTask 5.3: 本地 fallback 降级测试
- [ ] SubTask 5.4: 验证去重后知识点数量正确

## 任务依赖关系

```
Task 3 (获取现有知识点)
     │
     └───────────────────────┐
                             ▼
Task 1 (核心函数) ──────────────────▶ Task 2 (本地 fallback)
     │                              │
     └──────────────────────────────┘
                    │
                    ▼
            Task 4 (集成到 handleKpConfirm)
                    │
                    ▼
            Task 5 (测试验证)
```

## 关键实现细节

### Task 1: deduplicateKnowledgePoints 伪代码

```javascript
// aiService.js

// 配置常量
const STRONG_MODEL_BATCH = { maxBatchSize: 50, maxExistingInPrompt: 100, threshold: 0.75 };
const WEAK_MODEL_BATCH = { maxBatchSize: 25, maxExistingInPrompt: 50, threshold: 0.70 };

async function deduplicateKnowledgePoints(tempPoints, existingPoints, aiConfig, onProgress) {
  // 1. 空值保护
  if (!Array.isArray(tempPoints) || tempPoints.length === 0) {
    return { uniquePoints: [], duplicatePairs: [], stats: { totalTemp: 0, duplicatesFound: 0, uniqueCount: 0 } };
  }
  if (!Array.isArray(existingPoints) || existingPoints.length === 0) {
    return { uniquePoints: tempPoints, duplicatePairs: [], stats: { totalTemp: tempPoints.length, duplicatesFound: 0, uniqueCount: tempPoints.length } };
  }

  // 2. 判断模型类型
  const isWeakModel = aiConfig.aiServiceMode === 'iflytek-spark' && (!aiConfig.model || aiConfig.model === 'lite');
  const batchConfig = isWeakModel ? WEAK_MODEL_BATCH : STRONG_MODEL_BATCH;

  // 3. 截断现有知识点
  const truncatedExisting = existingPoints.slice(0, batchConfig.maxExistingInPrompt);

  // 4. 分批处理
  const allDuplicates = [];
  const duplicateIndices = new Set();
  const BATCH_SIZE = batchConfig.maxBatchSize;

  for (let i = 0; i < tempPoints.length; i += BATCH_SIZE) {
    const batch = tempPoints.slice(i, i + BATCH_SIZE);
    
    let batchResults;
    if (isWeakModel) {
      batchResults = await deduplicateWithSpark(batch, truncatedExisting, aiConfig);
    } else {
      batchResults = await deduplicateWithStrongModel(batch, truncatedExisting, aiConfig);
    }

    // 5. 合并结果（修正全局索引）
    for (const dup of batchResults) {
      if (dup.isDuplicate && dup.similarity > batchConfig.threshold) {
        const globalIndex = dup.tempIndex + i;
        duplicateIndices.add(globalIndex);
        allDuplicates.push({
          tempIndex: globalIndex,
          existingIndex: dup.matchedExistingIndex,
          similarity: dup.similarity,
          reason: dup.reason
        });
      }
    }

    onProgress?.('dedup', Math.min(i + BATCH_SIZE, tempPoints.length), tempPoints.length);
  }

  // 6. 生成去重结果
  const uniquePoints = tempPoints.filter((_, idx) => !duplicateIndices.has(idx));

  return {
    uniquePoints,
    duplicatePairs: allDuplicates,
    stats: {
      totalTemp: tempPoints.length,
      totalExisting: existingPoints.length,
      duplicatesFound: duplicateIndices.size,
      uniqueCount: uniquePoints.length,
      modelType: isWeakModel ? 'weak' : 'strong'
    }
  };
}
```

### Task 2: 本地 fallback 伪代码

```javascript
function localDedupFallback(tempPoints, existingPoints) {
  // 1. 精确匹配
  const exactSet = new Set(existingPoints.map(p => String(p).toLowerCase().trim()));
  const exactDuplicates = [];
  
  for (let i = 0; i < tempPoints.length; i++) {
    const tp = String(tempPoints[i]).toLowerCase().trim();
    if (exactSet.has(tp)) {
      exactDuplicates.push(i);
    }
  }

  // 2. 子串匹配（只在未精确匹配的知识点中找）
  const partialDuplicates = [];
  for (let i = 0; i < tempPoints.length; i++) {
    if (exactDuplicates.includes(i)) continue;
    
    const tp = String(tempPoints[i]).toLowerCase().trim();
    if (tp.length < 4) continue;  // 跳过太短的字符串
    
    for (const ep of existingPoints) {
      const epLower = String(ep).toLowerCase().trim();
      if (epLower.length < 4) continue;
      
      // 检查是否包含
      if (epLower.includes(tp) || tp.includes(epLower)) {
        partialDuplicates.push({ index: i, matched: ep });
        break;
      }
    }
  }

  const allDuplicateIndices = [...new Set([...exactDuplicates, ...partialDuplicates.map(p => p.index)])];
  const uniquePoints = tempPoints.filter((_, idx) => !allDuplicateIndices.includes(idx));

  return {
    uniquePoints,
    duplicatePairs: [
      ...exactDuplicates.map(i => ({ tempIndex: i, type: 'exact' })),
      ...partialDuplicates.map(p => ({ tempIndex: p.index, matchedExisting: p.matched, type: 'partial' }))
    ],
    viaLocalFallback: true
  };
}
```
