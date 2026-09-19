import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import db, { getCategories } from '../services/db'

export default function StatsLongTerm() {
  const navigate = useNavigate()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState({})
  
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        // 加载分类
        const cats = await getCategories()
        const catMap = {}
        for (const c of cats) {
          catMap[c.id] = c.name
        }
        setCategories(catMap)
        
        // 加载长期记忆卡片
        const allStatuses = await db.cardStatus.toArray()
        const longTermStatuses = allStatuses.filter(s => (s.repetitions || 0) >= 5)
        
        // 获取卡片详情
        const cardIds = longTermStatuses.map(s => s.cardId)
        const cardDetails = await db.cards.bulkGet(cardIds)
        
        const result = []
        for (let i = 0; i < longTermStatuses.length; i++) {
          const status = longTermStatuses[i]
          const card = cardDetails[i]
          if (card) {
            result.push({
              ...card,
              status,
              categoryName: catMap[card.categoryId] || '未知分类',
            })
          }
        }
        
        setCards(result)
      } catch (err) {
        console.error('[StatsLongTerm] loadData error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])
  
  return (
    <div className="stats-longterm-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>←</button>
        <h1>长期记忆卡片</h1>
      </div>
      
      <div className="page-content">
        <div className="total-count">
          共 <span className="count">{cards.length}</span> 张卡片
        </div>
        
        {loading ? (
          <div className="loading">加载中...</div>
        ) : cards.length === 0 ? (
          <div className="empty-state">
            <p>暂无长期记忆卡片</p>
            <p className="hint">在艾宾浩斯模式下持续复习，达到 5 次成功复习后将变为长期记忆卡片</p>
          </div>
        ) : (
          <div className="card-list">
            {cards.map(card => (
              <div key={card.id} className="card-item">
                <div className="card-front">{card.front}</div>
                <div className="card-back">{card.back}</div>
                <div className="card-meta">
                  <span className="category">{card.categoryName}</span>
                  <span className="interval">间隔 {card.status.interval} 天</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <style>{`
        .stats-longterm-page {
          min-height: 100vh;
          background: #f5f5f5;
        }
        
        .page-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: white;
          border-bottom: 1px solid #eee;
        }
        
        .back-btn {
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          font-size: 20px;
          cursor: pointer;
        }
        
        .page-header h1 {
          flex: 1;
          text-align: center;
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          margin-right: 36px;
        }
        
        .page-content {
          padding: 16px;
        }
        
        .total-count {
          text-align: center;
          font-size: 14px;
          color: #666;
          margin-bottom: 16px;
        }
        
        .total-count .count {
          color: #6BCB77;
          font-weight: 600;
          font-size: 18px;
        }
        
        .loading {
          text-align: center;
          padding: 40px;
          color: #999;
        }
        
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          background: white;
          border-radius: 12px;
        }
        
        .empty-state p {
          margin: 0 0 8px 0;
          color: #666;
        }
        
        .empty-state .hint {
          font-size: 13px;
          color: #999;
        }
        
        .card-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .card-item {
          background: white;
          border-radius: 12px;
          padding: 16px;
        }
        
        .card-front {
          font-size: 15px;
          font-weight: 500;
          color: #333;
          margin-bottom: 8px;
        }
        
        .card-back {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
        }
        
        .card-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #999;
        }
        
        .interval {
          color: #6BCB77;
        }
      `}</style>
    </div>
  )
}
