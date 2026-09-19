export class KnowledgePoint {
  constructor(id, content, sourceIndex = null) {
    this.id = id;
    this.content = content;
    this.sourceIndex = sourceIndex;
  }
  static fromJSON(json) { return new KnowledgePoint(json.id, json.content, json.sourceIndex); }
  toJSON() { return { id: this.id, content: this.content, sourceIndex: this.sourceIndex }; }
}

export class KnowledgeTreeNode {
  constructor(data) {
    this.id = data.id || '';
    this.parentId = data.parentId || null;
    this.level = data.level || 'category';
    this.name = data.name || null;
    this.categoryId = data.categoryId || null;
    this.topicId = data.topicId || null;
    this.chapterId = data.chapterId || null;
    this.unitId = data.unitId || null;
    this.knowledgePointId = data.knowledgePointId || null;
    
    this.purpose = data.purpose || null;
    this.description = data.description || null;
    this.color = data.color || '#3b82f6';
    this.icon = data.icon || '📚';
    
    this.isProcessed = data.isProcessed || false;
    this.position = data.position || 0;
    
    this.content = data.content || null;
    
    this.front = data.front || null;
    this.back = data.back || null;
    this.hint = data.hint || null;
    this.explanation = data.explanation || null;
    this.type = data.type || 'short';
    this.options = data.options || null;
    this.answerBlank = data.answerBlank || null;
    
    this.status = data.status || 'active';
    this.retryCount = data.retryCount || 0;
    this.source = data.source || 'manual';
    this.errorMessage = data.errorMessage || null;
    this.generatedAt = data.generatedAt || null;
    this.templateType = data.templateType || null;
    
    this.order = data.order || 0;
    this.userId = data.userId || '';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    
    this.children = [];
  }
  
  static fromJSON(json) {
    const node = new KnowledgeTreeNode(json);
    if (json.children && Array.isArray(json.children)) {
      node.children = json.children.map(c => KnowledgeTreeNode.fromJSON(c));
    }
    return node;
  }
  
  toJSON() {
    return {
      id: this.id,
      parentId: this.parentId,
      level: this.level,
      name: this.name,
      categoryId: this.categoryId,
      topicId: this.topicId,
      chapterId: this.chapterId,
      unitId: this.unitId,
      knowledgePointId: this.knowledgePointId,
      purpose: this.purpose,
      description: this.description,
      color: this.color,
      icon: this.icon,
      isProcessed: this.isProcessed,
      position: this.position,
      content: this.content,
      front: this.front,
      back: this.back,
      hint: this.hint,
      explanation: this.explanation,
      type: this.type,
      options: this.options,
      answerBlank: this.answerBlank,
      status: this.status,
      retryCount: this.retryCount,
      source: this.source,
      errorMessage: this.errorMessage,
      generatedAt: this.generatedAt,
      templateType: this.templateType,
      order: this.order,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      children: this.children.map(c => c.toJSON()),
    };
  }
  
  addChild(child) {
    this.children.push(child);
  }
  
  removeChild(childId) {
    this.children = this.children.filter(c => c.id !== childId);
  }
  
  isRoot() {
    return this.level === 'category';
  }
  
  isLeaf() {
    return this.level === 'card';
  }
  
  getCardCount() {
    if (this.isLeaf()) return 1;
    return this.children.reduce((sum, c) => sum + c.getCardCount(), 0);
  }
  
  getDescendantIds() {
    const ids = [];
    function collect(node) {
      ids.push(node.id);
      node.children.forEach(collect);
    }
    this.children.forEach(collect);
    return ids;
  }
}

export class Unit {
  constructor(name, cardIndices = [], knowledgePoints = []) {
    this.name = name;
    this.cardIndices = cardIndices;
    this.knowledgePoints = knowledgePoints;
  }
  static fromJSON(json) { return new Unit(json.name, json.cardIndices || [], (json.knowledgePoints || []).map(kp => KnowledgePoint.fromJSON(kp))); }
  toJSON() { return { name: this.name, cardIndices: this.cardIndices, knowledgePoints: this.knowledgePoints.map(kp => kp.toJSON()) }; }
  getCardCount() { return this.cardIndices.length; }
  getKnowledgePointCount() { return this.knowledgePoints.length; }
  addCard(index) { if (!this.cardIndices.includes(index)) this.cardIndices.push(index); }
  removeCard(index) { this.cardIndices = this.cardIndices.filter(i => i !== index); }
  addKnowledgePoint(kp) { if (!this.knowledgePoints.some(k => k.id === kp.id)) this.knowledgePoints.push(kp); }
  removeKnowledgePoint(id) { this.knowledgePoints = this.knowledgePoints.filter(k => k.id !== id); }
  toKnowledgeTreeNodes(parentId, categoryId, chapterId, order) {
    const node = new KnowledgeTreeNode({
      id: `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      parentId,
      level: 'unit',
      name: this.name,
      categoryId,
      topicId: null,
      chapterId,
      unitId: null,
      knowledgePointId: null,
      order,
    });
    let kpOrder = 0;
    for (const kp of this.knowledgePoints) {
      const kpNode = new KnowledgeTreeNode({
        id: `kp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        parentId: node.id,
        level: 'knowledge_point',
        name: kp.content,
        categoryId,
        topicId: null,
        chapterId,
        unitId: node.id,
        knowledgePointId: null,
        content: kp.content,
        order: kpOrder++,
      });
      node.addChild(kpNode);
    }
    return node;
  }
}

export class Chapter {
  constructor(name, units = [], knowledgePoints = []) {
    this.name = name;
    this.units = units;
    this.knowledgePoints = knowledgePoints;
  }
  static fromJSON(json) { return new Chapter(json.name, (json.units || []).map(u => Unit.fromJSON(u)), (json.knowledgePoints || []).map(kp => KnowledgePoint.fromJSON(kp))); }
  toJSON() { return { name: this.name, units: this.units.map(u => u.toJSON()), knowledgePoints: this.knowledgePoints.map(kp => kp.toJSON()) }; }
  getUnitCount() { return this.units.length; }
  getCardCount() { return this.units.reduce((sum, u) => sum + u.getCardCount(), 0); }
  getKnowledgePointCount() { return this.knowledgePoints.length + this.units.reduce((sum, u) => sum + u.getKnowledgePointCount(), 0); }
  addUnit(unit) { this.units.push(unit); }
  removeUnit(unitName) { this.units = this.units.filter(u => u.name !== unitName); }
  addKnowledgePoint(kp) { if (!this.knowledgePoints.some(k => k.id === kp.id)) this.knowledgePoints.push(kp); }
  removeKnowledgePoint(id) { this.knowledgePoints = this.knowledgePoints.filter(k => k.id !== id); }
  toKnowledgeTreeNodes(parentId, categoryId, topicId, order) {
    const node = new KnowledgeTreeNode({
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      parentId,
      level: 'chapter',
      name: this.name,
      categoryId,
      topicId,
      chapterId: null,
      unitId: null,
      knowledgePointId: null,
      order,
    });
    let unitOrder = 0;
    for (const unit of this.units) {
      const unitNode = unit.toKnowledgeTreeNodes(node.id, categoryId, node.id, unitOrder++);
      unitNode.chapterId = node.id;
      node.addChild(unitNode);
    }
    let kpOrder = this.units.length;
    for (const kp of this.knowledgePoints) {
      const kpNode = new KnowledgeTreeNode({
        id: `kp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        parentId: node.id,
        level: 'knowledge_point',
        name: kp.content,
        categoryId,
        topicId,
        chapterId: node.id,
        unitId: null,
        knowledgePointId: null,
        content: kp.content,
        order: kpOrder++,
      });
      node.addChild(kpNode);
    }
    return node;
  }
}

export class Topic {
  constructor(name, pointIndices = [], units = [], knowledgePoints = [], chapters = []) {
    this.name = name;
    this.pointIndices = pointIndices;
    this.units = units;
    this.knowledgePoints = knowledgePoints;
    this.chapters = chapters;
  }
  static fromJSON(json) { return new Topic(json.name || json.topicName, json.pointIndices || [], (json.units || []).map(u => Unit.fromJSON({ name: u.unitName, cardIndices: u.pointIndices })), (json.knowledgePoints || []).map(kp => KnowledgePoint.fromJSON(kp)), (json.chapters || []).map(c => Chapter.fromJSON(c))); }
  toJSON() { return { topicName: this.name, pointIndices: this.pointIndices, units: this.units.map(u => ({ unitName: u.name, pointIndices: u.cardIndices })), knowledgePoints: this.knowledgePoints.map(kp => kp.toJSON()), chapters: this.chapters.map(c => c.toJSON()) }; }
  getPointCount() { return this.pointIndices.length; }
  getUnitCount() { return this.units.length; }
  getChapterCount() { return this.chapters.length; }
  getKnowledgePointCount() { return this.knowledgePoints.length + this.units.reduce((sum, u) => sum + u.getKnowledgePointCount(), 0) + this.chapters.reduce((sum, c) => sum + c.getKnowledgePointCount(), 0); }
  addPoint(index) { if (!this.pointIndices.includes(index)) this.pointIndices.push(index); }
  removePoint(index) { this.pointIndices = this.pointIndices.filter(i => i !== index); }
  addKnowledgePoint(kp) { if (!this.knowledgePoints.some(k => k.id === kp.id)) this.knowledgePoints.push(kp); }
  removeKnowledgePoint(id) { this.knowledgePoints = this.knowledgePoints.filter(k => k.id !== id); }
  addChapter(chapter) { this.chapters.push(chapter); }
  removeChapter(chapterName) { this.chapters = this.chapters.filter(c => c.name !== chapterName); }
  toKnowledgeTreeNodes(parentId, categoryId, order) {
    const node = new KnowledgeTreeNode({
      id: `topic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      parentId,
      level: 'topic',
      name: this.name,
      categoryId,
      topicId: null,
      chapterId: null,
      unitId: null,
      knowledgePointId: null,
      order,
    });
    let chOrder = 0;
    for (const chapter of this.chapters) {
      const chNode = chapter.toKnowledgeTreeNodes(node.id, categoryId, node.id, chOrder++);
      chNode.topicId = node.id;
      node.addChild(chNode);
    }
    let unitOrder = this.chapters.length;
    for (const unit of this.units) {
      const unitNode = unit.toKnowledgeTreeNodes(node.id, categoryId, null, unitOrder++);
      unitNode.topicId = node.id;
      node.addChild(unitNode);
    }
    let kpOrder = this.chapters.length + this.units.length;
    for (const kp of this.knowledgePoints) {
      const kpNode = new KnowledgeTreeNode({
        id: `kp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        parentId: node.id,
        level: 'knowledge_point',
        name: kp.content,
        categoryId,
        topicId: node.id,
        chapterId: null,
        unitId: null,
        knowledgePointId: null,
        content: kp.content,
        order: kpOrder++,
      });
      node.addChild(kpNode);
    }
    return node;
  }
}

export class CardAssignment {
  constructor(cardIndex, chapterName = null, unitName = null) {
    this.cardIndex = cardIndex;
    this.chapterName = chapterName;
    this.unitName = unitName;
  }
  static fromJSON(json) { return new CardAssignment(json.cardIndex, json.chapterName, json.unitName); }
  toJSON() { return { cardIndex: this.cardIndex, chapterName: this.chapterName, unitName: this.unitName }; }
  isValid() { return typeof this.cardIndex === 'number' && this.cardIndex >= 0; }
}

export class ClassificationResult {
  constructor(chapters = [], units = [], assignments = [], topics = []) {
    this.chapters = chapters;
    this.units = units;
    this.assignments = assignments;
    this.topics = topics;
  }
  static fromJSON(json) { return new ClassificationResult((json.chapters || []).map(c => Chapter.fromJSON(c)), (json.units || []).map(u => Unit.fromJSON(u)), (json.assignments || []).map(a => CardAssignment.fromJSON(a)), (json.topics || []).map(t => Topic.fromJSON(t))); }
  toJSON() { return { chapters: this.chapters.map(c => c.toJSON()), units: this.units.map(u => u.toJSON()), assignments: this.assignments.map(a => a.toJSON()), topics: this.topics.map(t => t.toJSON()) }; }
  getMode() {
    if (this.topics.length > 0) {
      const hasChapters = this.topics.some(t => t.chapters.length > 0);
      const hasUnits = this.topics.some(t => t.units.length > 0);
      if (hasChapters && hasUnits) return 'full-hierarchy';
      if (hasChapters) return 'topic-and-chapter';
      if (hasUnits) return 'topic-and-unit';
      return 'topic-only';
    }
    if (this.chapters.length > 0) {
      const hasUnits = this.chapters.some(c => c.units.length > 0);
      return hasUnits ? 'chapter-and-unit' : 'chapter-only';
    }
    return 'unit-only';
  }
  getTotalCardCount() {
    if (this.topics.length > 0) {
      return this.topics.reduce((sum, t) => {
        return sum + t.chapters.reduce((s, c) => s + c.getCardCount(), 0) +
               t.units.reduce((s, u) => s + u.getCardCount(), 0);
      }, 0);
    }
    if (this.chapters.length > 0) { return this.chapters.reduce((sum, c) => sum + c.getCardCount(), 0); }
    return this.units.reduce((sum, u) => sum + u.getCardCount(), 0);
  }
  validate(totalCards) {
    const errors = []; const warnings = []; const mode = this.getMode(); const assignedIndices = new Set(); const duplicates = [];
    if (mode === 'full-hierarchy' || mode === 'topic-and-chapter' || mode === 'topic-and-unit' || mode === 'topic-only') {
      if (this.topics.length < 1) errors.push('主题数不能为空');
      else if (this.topics.length > 10) errors.push('主题数 ' + this.topics.length + ' 超出范围（1-10）');
      for (const topic of this.topics) {
        if (topic.name.length > 20) errors.push('主题 "' + topic.name + '" 长度超过20字限制');
        for (const ch of topic.chapters) {
          if (ch.name.length > 12) errors.push('章节 "' + ch.name + '" 长度超过12字限制');
          if (ch.units.length < 2) errors.push('章节 "' + ch.name + '" 单元数 ' + ch.units.length + ' 低于下限（2）');
          else if (ch.units.length > 10) errors.push('章节 "' + ch.name + '" 单元数 ' + ch.units.length + ' 超出上限（10）');
          for (const u of ch.units) {
            if (u.name.length > 16) errors.push('单元 "' + u.name + '" 长度超过16字限制');
            const cardCount = u.getCardCount();
            if (cardCount < 2) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 低于下限（2）');
            else if (cardCount > 50) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 超出上限（50）');
            for (const idx of u.cardIndices) { if (assignedIndices.has(idx)) duplicates.push(idx); assignedIndices.add(idx); }
          }
        }
        for (const u of topic.units) {
          if (u.name.length > 16) errors.push('单元 "' + u.name + '" 长度超过16字限制');
          const cardCount = u.getCardCount();
          if (cardCount < 2) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 低于下限（2）');
          else if (cardCount > 50) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 超出上限（50）');
          for (const idx of u.cardIndices) { if (assignedIndices.has(idx)) duplicates.push(idx); assignedIndices.add(idx); }
        }
      }
    } else if (mode === 'chapter-and-unit') {
      if (this.chapters.length < 1) errors.push('章节数不能为空');
      else if (this.chapters.length > 10) errors.push('章节数 ' + this.chapters.length + ' 超出范围（1-10）');
      for (const ch of this.chapters) {
        if (ch.name.length > 12) errors.push('章节 "' + ch.name + '" 长度超过12字限制');
        if (ch.units.length < 2) errors.push('章节 "' + ch.name + '" 单元数 ' + ch.units.length + ' 低于下限（2）');
        else if (ch.units.length > 10) errors.push('章节 "' + ch.name + '" 单元数 ' + ch.units.length + ' 超出上限（10）');
        for (const u of ch.units) {
          if (u.name.length > 16) errors.push('单元 "' + u.name + '" 长度超过16字限制');
          const cardCount = u.getCardCount();
          if (cardCount < 2) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 低于下限（2）');
          else if (cardCount > 50) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 超出上限（50）');
          for (const idx of u.cardIndices) { if (assignedIndices.has(idx)) duplicates.push(idx); assignedIndices.add(idx); }
        }
      }
    } else if (mode === 'chapter-only') {
      if (this.chapters.length < 1) errors.push('章节数不能为空');
      else if (this.chapters.length > 10) errors.push('章节数 ' + this.chapters.length + ' 超出范围（1-10）');
      for (const ch of this.chapters) {
        if (ch.name.length > 12) errors.push('章节 "' + ch.name + '" 长度超过12字限制');
        const cardCount = ch.getCardCount();
        if (cardCount < 2) errors.push('章节 "' + ch.name + '" 卡片数 ' + cardCount + ' 低于下限（2）');
        else if (cardCount > 50) errors.push('章节 "' + ch.name + '" 卡片数 ' + cardCount + ' 超出上限（50）');
        for (const idx of ch.cardIndices) { if (assignedIndices.has(idx)) duplicates.push(idx); assignedIndices.add(idx); }
      }
    } else {
      if (this.units.length < 1) errors.push('单元数不能为空');
      else if (this.units.length > 10) warnings.push('单元数 ' + this.units.length + ' 偏多，建议不超过10个');
      for (const u of this.units) {
        if (u.name.length > 16) errors.push('单元 "' + u.name + '" 长度超过16字限制');
        const cardCount = u.getCardCount();
        if (cardCount < 2) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 低于下限（2）');
        else if (cardCount > 50) errors.push('单元 "' + u.name + '" 卡片数 ' + cardCount + ' 超出上限（50）');
        for (const idx of u.cardIndices) { if (assignedIndices.has(idx)) duplicates.push(idx); assignedIndices.add(idx); }
      }
    }
    if (duplicates.length > 0) errors.push('发现 ' + duplicates.length + ' 张重复分配的卡片');
    if (assignedIndices.size < totalCards) errors.push('卡片分配不完整：已分配 ' + assignedIndices.size + '/' + totalCards + ' 张');
    else if (assignedIndices.size > totalCards) errors.push('卡片分配超出范围：已分配 ' + assignedIndices.size + '/' + totalCards + ' 张');
    return { valid: errors.length === 0, errors, warnings, mode };
  }
  toKnowledgeTreeNodes(categoryId) {
    const nodes = [];
    if (this.topics.length > 0) {
      let topicOrder = 0;
      for (const topic of this.topics) {
        const topicNode = topic.toKnowledgeTreeNodes(categoryId, categoryId, topicOrder++);
        topicNode.categoryId = categoryId;
        nodes.push(topicNode);
      }
    } else if (this.chapters.length > 0) {
      let chOrder = 0;
      for (const chapter of this.chapters) {
        const chNode = chapter.toKnowledgeTreeNodes(categoryId, categoryId, null, chOrder++);
        chNode.categoryId = categoryId;
        nodes.push(chNode);
      }
    } else if (this.units.length > 0) {
      let unitOrder = 0;
      for (const unit of this.units) {
        const unitNode = unit.toKnowledgeTreeNodes(categoryId, categoryId, null, unitOrder++);
        unitNode.categoryId = categoryId;
        nodes.push(unitNode);
      }
    }
    return nodes;
  }
  flattenKnowledgeTreeNodes() {
    const allNodes = [];
    function collect(node) {
      allNodes.push(node);
      node.children.forEach(collect);
    }
    for (const node of this.toKnowledgeTreeNodes()) {
      collect(node);
    }
    return allNodes;
  }
}

export function serializeClassificationResult(result) { return JSON.stringify(result.toJSON()); }
export function deserializeClassificationResult(jsonString) {
  try { const json = JSON.parse(jsonString); return ClassificationResult.fromJSON(json); }
  catch (_) { return new ClassificationResult(); }
}
