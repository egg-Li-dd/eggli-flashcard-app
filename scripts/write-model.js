const fs = require('fs');
const path = 'c:\\\\creategame\\\\EggLi-Flashcards\\\\eggli-flashcard-app\\\\src\\\\services\\\\ai\\\\dataModels.js';
const content = 'export class KnowledgePoint { constructor(id, content, sourceIndex = null) { this.id = id; this.content = content; this.sourceIndex = sourceIndex; } static fromJSON(json) { return new KnowledgePoint(json.id, json.content, json.sourceIndex); } toJSON() { return { id: this.id, content: this.content, sourceIndex: this.sourceIndex }; } }';
fs.writeFileSync(path, content, 'utf8');
