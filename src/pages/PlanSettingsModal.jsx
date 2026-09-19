import { useState, useEffect } from 'react'
import { getStudyPlanByCategory, upsertStudyPlan } from '../services/db'

export default function PlanSettingsModal({ categoryId, categoryName, chapterId, chapterName, onClose }) {
  const [dailyReviewLimit, setDailyReviewLimit] = useState(50)
  const [dailyNewLimit, setDailyNewLimit] = useState(20)
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  
  useEffect(() => {
    async function loadPlan() {
      const plan = await getStudyPlanByCategory(categoryId, chapterId || '')
      if (plan) {
        setDailyReviewLimit(plan.dailyReviewLimit || 50)
        setDailyNewLimit(plan.dailyNewLimit || 20)
        setPriority(plan.priority || 'medium')
      }
    }
    loadPlan()
  }, [categoryId, chapterId])
  
  const handleSave = async () => {
    setSaving(true)
    try {
      await upsertStudyPlan({
        categoryId,
        chapterId: chapterId || '',
        dailyReviewLimit,
        dailyNewLimit,
        priority,
      })
      onClose()
    } catch (err) {
      console.error('[PlanSettingsModal] save error:', err)
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <div className="settings-modal" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <h3>学习计划设置</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        {/* 内容 */}
        <div className="modal-body">
          {categoryName && (
            <div className="category-name">
              {chapterName ? (
                <>分类：<strong>{categoryName}</strong> / 章节：<strong>{chapterName}</strong></>
              ) : (
                <>分类：<strong>{categoryName}</strong></>
              )}
            </div>
          )}
          
          {/* 每日复习上限 */}
          <div className="setting-item">
            <label>每日复习上限</label>
            <p className="setting-desc">每日最多复习多少张卡片</p>
            <div className="setting-control">
              <input
                type="number"
                value={dailyReviewLimit}
                onChange={e => setDailyReviewLimit(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                max="200"
              />
              <span>张</span>
            </div>
          </div>
          
          {/* 每日新学上限 */}
          <div className="setting-item">
            <label>每日新学上限</label>
            <p className="setting-desc">每日最多学习多少张新卡片</p>
            <div className="setting-control">
              <input
                type="number"
                value={dailyNewLimit}
                onChange={e => setDailyNewLimit(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="100"
              />
              <span>张</span>
            </div>
          </div>
          
          {/* 优先级 */}
          <div className="setting-item">
            <label>优先级</label>
            <p className="setting-desc">优先级高的分类会优先安排复习</p>
            <div className="priority-options">
              {[
                { value: 'low', label: '低', color: '#6BCB77' },
                { value: 'medium', label: '中', color: '#FFD93D' },
                { value: 'high', label: '高', color: '#FF6B6B' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`priority-btn ${priority === opt.value ? 'active' : ''}`}
                  onClick={() => setPriority(opt.value)}
                  style={{
                    backgroundColor: priority === opt.value ? opt.color : 'transparent',
                    borderColor: opt.color,
                    color: priority === opt.value ? 'white' : opt.color,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* 底部 */}
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button 
            className="save-btn" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      
      <style>{`
        .settings-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 1000;
        }
        
        .settings-modal .modal-content {
          background: white;
          border-radius: 16px 16px 0 0;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #eee;
        }
        
        .modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        
        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: #f0f0f0;
          border-radius: 50%;
          font-size: 18px;
          cursor: pointer;
        }
        
        .modal-body {
          padding: 16px;
        }
        
        .category-name {
          padding: 12px;
          background: #f5f5f5;
          border-radius: 8px;
          font-size: 14px;
          color: #333;
          margin-bottom: 16px;
        }
        
        .setting-item {
          margin-bottom: 20px;
        }
        
        .setting-item label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #333;
          margin-bottom: 4px;
        }
        
        .setting-desc {
          font-size: 12px;
          color: #999;
          margin: 0 0 8px 0;
        }
        
        .setting-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .setting-control input {
          width: 80px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          text-align: center;
        }
        
        .setting-control span {
          font-size: 14px;
          color: #666;
        }
        
        .priority-options {
          display: flex;
          gap: 12px;
        }
        
        .priority-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .modal-footer {
          display: flex;
          gap: 12px;
          padding: 16px;
          border-top: 1px solid #eee;
        }
        
        .cancel-btn, .save-btn {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .cancel-btn {
          background: #f0f0f0;
          color: #666;
        }
        
        .save-btn {
          background: #4A90D9;
          color: white;
        }
        
        .save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}