const TEMPLATES = [
  { key: 'noun', name: '名词解释', content: '[名词]：\n定义：\n特征：\n例子：' },
  { key: 'qa', name: '问答', content: '[问题]：\n答案：\n考点：' },
  { key: 'event', name: '历史事件', content: '[时间]：\n事件：\n影响：' },
  { key: 'formula', name: '公式', content: '[公式]：\n推导：\n应用场景：' },
]

/**
 * 模板条：点击模板填入输入框作为骨架
 */
export default function FloatingTemplates({ onApply }) {
  return (
    <div className="floating-template">
      <div className="floating-template-label">💡 模板：</div>
      <div className="floating-template-list">
        {TEMPLATES.map(t => (
          <button
            key={t.key}
            className="floating-template-item"
            onClick={() => onApply(t.content, t.key)}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}
