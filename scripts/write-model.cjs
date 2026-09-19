const fs = require('fs');
const path = 'c:\\creategame\\EggLi-Flashcards\\eggli-flashcard-app\\src\\services\\ai\\dataModels.js';

const content = `export class KnowledgePoint {
  constructor(id, content, sourceIndex = null) {
    this.id = id;
    this.content = content;
    this.sourceIndex = sourceIndex;
  }
  static fromJSON(json) { return new KnowledgePoint(json.id, json.content, json.sourceIndex); }
  toJSON() { return { id: this.id, content: this.content, sourceIndex: this.sourceIndex }; }
}

export class Unit {
  constructor(name, cardIndices = []) {
    this.name = name;
    this.cardIndices = cardIndices;
  }
  static fromJSON(json) { return new Unit(json.name, json.cardIndices || []); }
  toJSON() { return { name: this.name, cardIndices: this.cardIndices }; }
  getCardCount() { return this.cardIndices.length; }
  addCard(index) { if (!this.cardIndices.includes(index)) this.cardIndices.push(index); }
  removeCard(index) { this.cardIndices = this.cardIndices.filter(i => i !== index); }
}

export class Chapter {
  constructor(name, units = []) {
    this.name = name;
    this.units = units;
  }
  static fromJSON(json) { return new Chapter(json.name, (json.units || []).map(u => Unit.fromJSON(u))); }
  toJSON() { return { name: this.name, units: this.units.map(u => u.toJSON()) }; }
  getUnitCount() { return this.units.length; }
  getCardCount() { return this.units.reduce((sum, u) => sum + u.getCardCount(), 0); }
  addUnit(unit) { this.units.push(unit); }
  removeUnit(unitName) { this.units = this.units.filter(u => u.name !== unitName); }
}

export class Topic {
  constructor(name, pointIndices = [], units = []) {
    this.name = name;
    this.pointIndices = pointIndices;
    this.units = units;
  }
  static fromJSON(json) { return new Topic(json.name || json.topicName, json.pointIndices || [], (json.units || []).map(u => Unit.fromJSON({ name: u.unitName, cardIndices: u.pointIndices }))); }
  toJSON() { return { topicName: this.name, pointIndices: this.pointIndices, units: this.units.map(u => ({ unitName: u.name, pointIndices: u.cardIndices })) }; }
  getPointCount() { return this.pointIndices.length; }
  getUnitCount() { return this.units.length; }
  addPoint(index) { if (!this.pointIndices.includes(index)) this.pointIndices.push(index); }
  removePoint(index) { this.pointIndices = this.pointIndices.filter(i => i !== index); }
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
  constructor(chapters = [], units = [], assignments = []) {
    this.chapters = chapters;
    this.units = units;
    this.assignments = assignments;
  }
  static fromJSON(json) { return new ClassificationResult((json.chapters || []).map(c => Chapter.fromJSON(c)), (json.units || []).map(u => Unit.fromJSON(u)), (json.assignments || []).map(a => CardAssignment.fromJSON(a))); }
  toJSON() { return { chapters: this.chapters.map(c => c.toJSON()), units: this.units.map(u => u.toJSON()), assignments: this.assignments.map(a => a.toJSON()) }; }
  getMode() {
    if (this.chapters.length > 0) {
      const hasUnits = this.chapters.some(c => c.units.length > 0);
      return hasUnits ? 'chapter-and-unit' : 'chapter-only';
    }
    return 'unit-only';
  }
  getTotalCardCount() {
    if (this.chapters.length > 0) { return this.chapters.reduce((sum, c) => sum + c.getCardCount(), 0); }
    return this.units.reduce((sum, u) => sum + u.getCardCount(), 0);
  }
  validate(totalCards) {
    const errors = []; const warnings = []; const mode = this.getMode(); const assignedIndices = new Set(); const duplicates = [];
    if (mode === 'chapter-and-unit') {
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
}

export function serializeClassificationResult(result) { return JSON.stringify(result.toJSON()); }
export function deserializeClassificationResult(jsonString) {
  try { const json = JSON.parse(jsonString); return ClassificationResult.fromJSON(json); }
  catch (_) { return new ClassificationResult(); }
}
`;

fs.writeFileSync(path, content, 'utf8');
console.log('File written successfully');