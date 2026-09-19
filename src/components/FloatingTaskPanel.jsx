import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useBackgroundTask, TASK_STATUS, TASK_TYPE_LABELS, TASK_STATUS_LABELS, FLOW_STATUS, FLOW_TYPE_LABELS, FLOW_STATUS_LABELS } from '../context/BackgroundTaskContext'

/**
 * 后台任务 & 流程悬浮面板
 * - 有任务/流程时显示悬浮按钮
 * - 点击按钮展开任务列表
 * - 拖拽按钮：自由拖动到任意位置，位置记忆在 localStorage
 * - flow 类型：显示当前步骤名、进度、状态；当处于 awaiting_action 状态时
 *   显示醒目的"待操作"按钮，点击后恢复到完整操作界面
 * - awaiting_action 状态提供呼吸闪烁的红点，提示用户及时操作
 */

const POSITION_STORAGE_KEY = 'floating_task_btn_pos_v1'
const DRAG_THRESHOLD = 5 // 像素：移动超过此阈值视为拖拽而非点击
const BTN_SIZE = 48 // 按钮尺寸（px），用于边界约束

function loadPosition() {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return parsed
    }
  } catch (_) {
    // ignore
  }
  return null
}

function savePosition(pos) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos))
  } catch (_) {
    // ignore
  }
}

export default function FloatingTaskPanel({ onResumeFlow }) {
  const {
    tasks,
    stats,
    cancelTask,
    removeTask,
    clearFinishedTasks,
    flows,
    flowStats,
    cancelFlow,
    removeFlow,
    retryFlow,
    clearFinishedFlows,
  } = useBackgroundTask()

  const [expanded, setExpanded] = useState(false)

  // 按钮位置（相对于视口的左上角）
  const [pos, setPos] = useState(() => {
    const saved = loadPosition()
    if (saved) return saved
    // 默认位置：右下角（bottom: 170px, right: 16px）
    if (typeof window !== 'undefined') {
      return {
        x: Math.max(0, window.innerWidth - BTN_SIZE - 16),
        y: Math.max(0, window.innerHeight - BTN_SIZE - 170),
      }
    }
    return { x: 0, y: 0 }
  })

  // 拖拽状态用 ref 存储，避免每帧 setPos 造成大量重渲染
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  })

  // 窗口大小变化时，约束按钮在可视区域内
  useEffect(() => {
    const handleResize = () => {
      setPos(prev => ({
        x: Math.min(Math.max(0, prev.x), window.innerWidth - BTN_SIZE),
        y: Math.min(Math.max(0, prev.y), window.innerHeight - BTN_SIZE),
      }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 拖拽：处理全局 mousemove / touchmove / mouseup / touchend
  useEffect(() => {
    const ds = dragStateRef.current

    const handleMove = (clientX, clientY) => {
      if (!ds.isDragging) return
      const dx = clientX - ds.startX
      const dy = clientY - ds.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        ds.moved = true
      }
      let newX = clientX - ds.offsetX
      let newY = clientY - ds.offsetY
      // 约束到视口
      newX = Math.min(Math.max(0, newX), window.innerWidth - BTN_SIZE)
      newY = Math.min(Math.max(0, newY), window.innerHeight - BTN_SIZE)
      // 使用 ref 临时存储，避免每帧 setState 造成重渲染
      ds.currentX = newX
      ds.currentY = newY
      // 通过 transform 直接移动 DOM，避免 React 渲染开销
      if (ds.btnEl) {
        ds.btnEl.style.transform = `translate(0, 0) scale(1.02)`
        ds.btnEl.style.left = newX + 'px'
        ds.btnEl.style.top = newY + 'px'
      }
    }

    const handleEnd = () => {
      if (!ds.isDragging) return
      if (ds.moved && typeof ds.currentX === 'number' && typeof ds.currentY === 'number') {
        const newPos = { x: ds.currentX, y: ds.currentY }
        setPos(newPos)
        savePosition(newPos)
      }
      ds.isDragging = false
      ds.moved = false
      if (ds.btnEl) {
        ds.btnEl.style.transform = ''
      }
      // 清除全局事件监听
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }

    const onMouseMove = (e) => handleMove(e.clientX, e.clientY)
    const onMouseUp = () => handleEnd()
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault()
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    const onTouchEnd = () => handleEnd()

    // 保存用于清理
    dragStateRef.current._cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }

    dragStateRef.current._onMouseMove = onMouseMove
    dragStateRef.current._onMouseUp = onMouseUp
    dragStateRef.current._onTouchMove = onTouchMove
    dragStateRef.current._onTouchEnd = onTouchEnd
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (dragStateRef.current._cleanup) {
        dragStateRef.current._cleanup()
      }
    }
  }, [])

  const handlePointerDown = useCallback((e, btnEl) => {
    const ds = dragStateRef.current
    ds.btnEl = btnEl
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0
    ds.isDragging = true
    ds.moved = false
    ds.startX = clientX
    ds.startY = clientY
    // 记录点击位置与按钮位置的偏移
    const rect = btnEl.getBoundingClientRect()
    ds.offsetX = clientX - rect.left
    ds.offsetY = clientY - rect.top
    ds.currentX = rect.left
    ds.currentY = rect.top

    // 添加全局事件监听
    window.addEventListener('mousemove', ds._onMouseMove)
    window.addEventListener('mouseup', ds._onMouseUp)
    window.addEventListener('touchmove', ds._onTouchMove, { passive: false })
    window.addEventListener('touchend', ds._onTouchEnd)
  }, [])

  const handleBtnClick = useCallback(() => {
    const ds = dragStateRef.current
    if (ds.moved) {
      // 这是一次拖拽操作，不是点击
      ds.moved = false
      return
    }
    setExpanded(true)
  }, [])

  // 仅当存在任何任务或流程时显示
  const hasAnything = tasks.length > 0 || flows.length > 0
  const hasActiveTasks = stats.running > 0 || flowStats.running > 0
  const hasAwaitingAction = flowStats.awaitingAction > 0

  // 按状态排序 flows：awaiting_action > running > failed > cancelled > completed
  const sortedFlows = useMemo(() => {
    const order = {
      [FLOW_STATUS.AWAITING_ACTION]: 0,
      [FLOW_STATUS.RUNNING]: 1,
      [FLOW_STATUS.FAILED]: 2,
      [FLOW_STATUS.CANCELLED]: 3,
      [FLOW_STATUS.COMPLETED]: 4,
    }
    return [...flows].sort((a, b) => {
      const oa = order[a.status] ?? 99
      const ob = order[b.status] ?? 99
      if (oa !== ob) return oa - ob
      return b.updatedAt - a.updatedAt
    })
  }, [flows])

  const sortedTasks = useMemo(() => {
    const order = {
      [TASK_STATUS.RUNNING]: 0,
      [TASK_STATUS.PENDING]: 1,
      [TASK_STATUS.FAILED]: 2,
      [TASK_STATUS.CANCELLED]: 3,
      [TASK_STATUS.COMPLETED]: 4,
    }
    return [...tasks].sort((a, b) => {
      const oa = order[a.status] ?? 99
      const ob = order[b.status] ?? 99
      if (oa !== ob) return oa - ob
      return b.startTime - a.startTime
    })
  }, [tasks])

  // 自动滚动到"待操作"项（展开面板后）
  useEffect(() => {
    if (!expanded) return
    const timer = setTimeout(() => {
      const pending = document.querySelector('.floating-task-item--awaiting_action')
      if (pending && pending.scrollIntoView) {
        pending.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [expanded, flows.length])

  if (!hasAnything) return null

  // 流程信息文字（用于悬浮按钮的 tooltip）
  const awaitingHint = hasAwaitingAction
    ? `${flowStats.awaitingAction} 个流程等待你的操作`
    : hasActiveTasks
      ? `${stats.running + flowStats.running} 个运行中`
      : `${stats.completed + flowStats.completed} 个已完成`

  // 计算面板位置与尺寸
  // 根据按钮位置智能展开方向，确保面板在可视区域内
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600
  const isBtnInRightHalf = pos.x + BTN_SIZE / 2 > vw / 2
  const isBtnInBottomHalf = pos.y + BTN_SIZE / 2 > vh / 2

  // 移动端适配：小屏幕使用更紧凑的布局
  const isSmallScreen = vw < 480
  // 面板宽度：中等屏幕约 380-440px，大屏幕可略大，但不超视口宽度 - 32px
  const panelWidth = Math.min(
    isSmallScreen ? vw - 32 : 420,
    vw - 32
  )
  // 面板高度：最大占视口 65-70%，但最小 200px
  const maxPanelHeight = Math.min(
    Math.max(vh * (isSmallScreen ? 0.72 : 0.65), 260),
    vh - 80
  )

  // 计算定位坐标，保证面板完全在可视区域内
  let topPos = null
  let bottomPos = null
  let leftPos = null
  let rightPos = null

  // 垂直方向
  if (isBtnInBottomHalf) {
    // 面板向上展开：bottom 定位
    bottomPos = Math.max(16, vh - pos.y - BTN_SIZE + 8)
  } else {
    // 面板向下展开：top 定位
    topPos = Math.max(16, pos.y + BTN_SIZE + 8)
  }

  // 水平方向
  if (isBtnInRightHalf) {
    // 面板向左展开
    rightPos = Math.max(16, vw - pos.x - BTN_SIZE + 8)
    // 避免面板超出左侧
    if (rightPos + panelWidth > vw - 16) {
      rightPos = Math.max(16, vw - panelWidth - 16)
    }
  } else {
    // 面板向右展开
    leftPos = Math.max(16, pos.x + BTN_SIZE + 8)
    // 避免面板超出右侧
    if (leftPos + panelWidth > vw - 16) {
      leftPos = Math.max(16, vw - panelWidth - 16)
    }
  }

  // 面板定位样式（相对按钮智能展开）
  // z-index: 960 - 必须高于遮罩层(955)，用户才能点击面板内容
  const panelStyle = {
    position: 'fixed',
    zIndex: 960,
    width: `${panelWidth}px`,
    maxHeight: `${maxPanelHeight}px`,
    display: 'flex',
    flexDirection: 'column',
    ...(topPos !== null ? { top: `${topPos}px` } : {}),
    ...(bottomPos !== null ? { bottom: `${bottomPos}px` } : {}),
    ...(leftPos !== null ? { left: `${leftPos}px` } : {}),
    ...(rightPos !== null ? { right: `${rightPos}px` } : {}),
  }

  // 按钮样式：使用 left/top 固定定位
  const btnStyle = {
    position: 'fixed',
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    right: 'auto',
    bottom: 'auto',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  }

  return (
    <>
      {/* 悬浮按钮 — 显示"待操作"的醒目角标 */}
      <button
        ref={(el) => {
          if (el) dragStateRef.current.btnEl = el
        }}
        style={btnStyle}
        className={
          'floating-task-btn floating-task-btn--draggable' +
          (hasAwaitingAction ? ' floating-task-btn--attention floating-task-btn--pulse' : '')
        }
        aria-label={awaitingHint}
        title={awaitingHint + '（可拖拽移动位置）'}
        aria-pressed={expanded}
        onMouseDown={(e) => handlePointerDown(e, e.currentTarget)}
        onTouchStart={(e) => handlePointerDown(e, e.currentTarget)}
        onClick={handleBtnClick}
      >
        {/* 优先级：待操作 > 运行中 > 默认 */}
        {hasAwaitingAction ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round" className="floating-task-icon floating-task-icon--attention">
            <path d="M12 3L2 20h20L12 3z" />
            <line x1="12" y1="10" x2="12" y2="15" />
            <circle cx="12" cy="18" r="1.2" fill="currentColor" />
          </svg>
        ) : hasActiveTasks ? (
          <svg className="floating-task-icon spinning" width="22" height="22" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        )}

        {/* badge：显示待操作数量或运行中数量；待操作状态下显示呼吸红点 */}
        {hasAwaitingAction ? (
          <span
            className="floating-task-badge floating-task-badge--attention floating-task-badge--pulse"
            aria-label={`${flowStats.awaitingAction} 个流程等待操作`}
          >
            {flowStats.awaitingAction}
          </span>
        ) : (stats.running + flowStats.running) > 0 ? (
          <span className="floating-task-badge">
            {stats.running + flowStats.running}
          </span>
        ) : null}
      </button>

      {/* 任务列表面板 */}
      {expanded && (
        <>
          <div className="floating-task-overlay" onClick={() => setExpanded(false)} />
          <div className="floating-task-panel floating-task-panel--in" style={panelStyle}>
            {/* 头部 */}
            <div className="floating-task-header">
              <div className="floating-task-header-title">
                <span>后台任务 & 流程</span>
                {hasAwaitingAction && (
                  <span className="floating-task-header-count floating-task-header-count--attention">
                    {flowStats.awaitingAction} 个待操作
                  </span>
                )}
                {(stats.running + flowStats.running) > 0 && !hasAwaitingAction && (
                  <span className="floating-task-header-count">
                    {stats.running + flowStats.running} 个运行中
                  </span>
                )}
              </div>
              <div className="floating-task-header-actions">
                {(stats.completed > 0 || flowStats.completed > 0 || stats.failed > 0 || flowStats.failed > 0) && (
                  <button
                    className="floating-task-clear-btn"
                    onClick={() => {
                      clearFinishedTasks()
                      clearFinishedFlows()
                    }}
                  >
                    清除已完成
                  </button>
                )}
                <button
                  className="floating-task-close-btn"
                  onClick={() => setExpanded(false)}
                  aria-label="关闭"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 任务列表 */}
            <div className="floating-task-list">
              {/* FLOWS: 流程（优先显示） */}
              {sortedFlows.map(flow => (
                <FlowItem
                  key={flow.id}
                  flow={flow}
                  onCancel={() => cancelFlow(flow.id)}
                  onRemove={() => removeFlow(flow.id)}
                  onRetry={() => retryFlow(flow.id)}
                  onResume={() => {
                    setExpanded(false)
                    if (typeof onResumeFlow === 'function') {
                      onResumeFlow(flow)
                    } else if (flow.onResumeRoute) {
                      window.location.hash = flow.onResumeRoute
                    }
                  }}
                />
              ))}

              {/* TASKS: 原有一次性任务 */}
              {sortedTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onCancel={() => cancelTask(task.id)}
                  onRemove={() => removeTask(task.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/**
 * 单个流程项（FlowItem）
 */
function FlowItem({ flow, onCancel, onRemove, onRetry, onResume }) {
  const isAwaitingAction = flow.status === FLOW_STATUS.AWAITING_ACTION
  const isActive = flow.status === FLOW_STATUS.RUNNING || flow.status === FLOW_STATUS.AWAITING_ACTION
  const isFailed = flow.status === FLOW_STATUS.FAILED

  const statusLabel = FLOW_STATUS_LABELS[flow.status] || flow.status
  const typeLabel = FLOW_TYPE_LABELS[flow.type] || '流程'

  const lastHours = Math.floor((Date.now() - flow.updatedAt) / 1000 / 3600)
  const lastMinutes = Math.floor((Date.now() - flow.updatedAt) / 1000 / 60)
  const lastSeconds = Math.floor((Date.now() - flow.updatedAt) / 1000)
  const lastTimeLabel =
    lastHours >= 1 ? `${lastHours} 小时前`
    : lastMinutes >= 1 ? `${lastMinutes} 分钟前`
    : `${lastSeconds} 秒前`

  // 根据状态生成小图标
  const flowStatusIcon = isAwaitingAction ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ) : flow.status === 'completed' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : isFailed ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ) : flow.status === 'cancelled' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinning-inline">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )

  return (
    <div
      className={`floating-task-item floating-task-item--${flow.status}`}
      aria-live={isAwaitingAction ? 'polite' : 'off'}
    >
      <div className="floating-task-item-header">
        <div className="floating-task-item-title">
          <span className="floating-task-item-type">{typeLabel}</span>
          <span className="floating-task-item-name">
            {flow.title}
            {isAwaitingAction && (
              <span className="floating-task-item-pulse-dot" aria-hidden="true" />
            )}
          </span>
        </div>
        <span className={`floating-task-item-status floating-task-item-status--${flow.status}`}>
          <span className="floating-task-item-status-icon">{flowStatusIcon}</span>
          {statusLabel}
        </span>
      </div>

      {/* 当前步骤（flow 特有） */}
      {flow.currentStep?.name && (
        <div className="floating-task-item-step">
          <span className="floating-task-item-step-label">📍</span>
          <span className="floating-task-item-step-name">{flow.currentStep.name}</span>
          {flow.currentStep?.description && (
            <span className="floating-task-item-step-desc">· {flow.currentStep.description}</span>
          )}
        </div>
      )}

      {/* 进度条 */}
      {(isActive || flow.progress > 0) && (
        <div className="floating-task-item-progress">
          <div className="floating-task-item-progress-bar">
            <div
              className={
                'floating-task-item-progress-fill' +
                (isAwaitingAction ? ' floating-task-item-progress-fill--attention' : '')
              }
              style={{ width: `${flow.progress}%` }}
            />
          </div>
          <span className="floating-task-item-progress-text">
            {flow.progress > 0 ? `${Math.round(flow.progress)}%` : ''}
          </span>
        </div>
      )}

      {/* 等待操作的提示 */}
      {isAwaitingAction && flow.awaitingAction && (
        <div className="floating-task-item-awaiting-action">
          <div className="floating-task-item-awaiting-action-icon floating-task-item-awaiting-action-icon--pulse">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L2 20h20L12 3z" />
              <line x1="12" y1="10" x2="12" y2="15" />
              <circle cx="12" cy="18" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <div className="floating-task-item-awaiting-action-content">
            <div className="floating-task-item-awaiting-action-title">
              {flow.awaitingAction?.title}
            </div>
            {flow.awaitingAction?.message && (
              <div className="floating-task-item-awaiting-action-message">
                {flow.awaitingAction.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {isFailed && flow.error && (
        <div className="floating-task-item-error">{flow.error}</div>
      )}

      {/* 底部操作栏 */}
      <div className="floating-task-item-footer">
        <span className="floating-task-item-time">🕒 {lastTimeLabel}</span>
        <div className="floating-task-item-actions">
          {isAwaitingAction && (
            <button
              className="floating-task-item-action-attention floating-task-item-action-attention--pulse"
              onClick={onResume}
              aria-label={`继续：${flow.awaitingAction?.title || '待操作'}`}
            >
              {flow.awaitingAction?.confirmLabel || '继续操作'}
            </button>
          )}
          {isActive && flow.cancelable && !isAwaitingAction && (
            <button className="floating-task-item-cancel-btn" onClick={onCancel}>
              取消
            </button>
          )}
          {isFailed && onRetry && (
            <button
              className="floating-task-item-retry-btn"
              onClick={onRetry}
              aria-label="重试此任务"
            >
              重试
            </button>
          )}
          {!isActive && (
            <button className="floating-task-item-remove-btn" onClick={onRemove}>
              移除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 原有单个任务项（TaskItem）
 */
function TaskItem({ task, onCancel, onRemove }) {
  const isActive = task.status === TASK_STATUS.RUNNING || task.status === TASK_STATUS.PENDING
  const isFailed = task.status === TASK_STATUS.FAILED

  const duration = Math.round((Date.now() - task.startTime) / 1000)
  const durationText = duration < 60
    ? `${duration}秒`
    : `${Math.floor(duration / 60)}分${duration % 60}秒`

  // 根据任务状态显示对应图标
  const taskStatusIcon = task.status === 'completed' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : isFailed ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ) : task.status === 'cancelled' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spinning-inline">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )

  return (
    <div className={`floating-task-item floating-task-item--${task.status}`}>
      <div className="floating-task-item-header">
        <div className="floating-task-item-title">
          <span className="floating-task-item-type">
            {TASK_TYPE_LABELS[task.type] || '任务'}
          </span>
          <span className="floating-task-item-name">{task.title}</span>
        </div>
        <span className={`floating-task-item-status floating-task-item-status--${task.status}`}>
          <span className="floating-task-item-status-icon">{taskStatusIcon}</span>
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>

      {isActive && (
        <div className="floating-task-item-progress">
          <div className="floating-task-item-progress-bar">
            <div
              className="floating-task-item-progress-fill"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="floating-task-item-progress-text">
            {task.progress > 0 ? `${Math.round(task.progress)}%` : ''}
          </span>
        </div>
      )}

      {task.detail && <div className="floating-task-item-detail">{task.detail}</div>}
      {isFailed && task.error && (
        <div className="floating-task-item-error">{task.error}</div>
      )}

      <div className="floating-task-item-footer">
        <span className="floating-task-item-time">🕒 {durationText}</span>
        <div className="floating-task-item-actions">
          {isActive && task.cancelable && (
            <button className="floating-task-item-cancel-btn" onClick={onCancel}>
              取消
            </button>
          )}
          {!isActive && (
            <button className="floating-task-item-remove-btn" onClick={onRemove}>
              移除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
