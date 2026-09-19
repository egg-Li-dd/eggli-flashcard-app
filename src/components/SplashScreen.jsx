import { useEffect, useState } from 'react'

/**
 * 应用启动闪屏页
 * - 显示 3 秒，用于后台应用加载
 * - 简洁清爽风格：浅色背景 + 蓝色主色
 * - 内容：App 名称 + Logo + 进度条
 * - 3 秒后必定切换（不依赖后台状态）
 */
const SPLASH_DURATION = 3000 // 总时长 3 秒
const PROGRESS_TICK = 30 // 进度刷新间隔 30ms，平滑动画

export default function SplashScreen({ onFinish }) {
  const [progress, setProgress] = useState(0)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const startTs = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTs
      // 使用 ease-out 曲线，前段快速推进，后段缓慢到达 100%
      const ratio = Math.min(elapsed / SPLASH_DURATION, 1)
      const eased = 1 - Math.pow(1 - ratio, 3) // easeOutCubic
      setProgress(Math.round(eased * 100))

      if (ratio >= 1) {
        clearInterval(timer)
        // 触发淡出动画，动画结束后再回调
        setClosing(true)
        setTimeout(() => {
          if (typeof onFinish === 'function') onFinish()
        }, 240)
      }
    }, PROGRESS_TICK)

    return () => clearInterval(timer)
  }, [onFinish])

  return (
    <div
      className={'splash-screen' + (closing ? ' splash-closing' : '')}
      role="status"
      aria-live="polite"
      aria-label="应用加载中"
    >
      <div className="splash-content">
        {/* Logo 区域 */}
        <div className="splash-logo">
          <div className="splash-logo-icon" aria-hidden="true">
            <span className="splash-logo-emoji">🥚</span>
          </div>
          <div className="splash-logo-ring" aria-hidden="true" />
          <div className="splash-logo-ring" aria-hidden="true" />
        </div>

        {/* App 名称 - 逐字动画 */}
        <h1 className="splash-title" aria-label="egg李">
          <span>e</span>
          <span>g</span>
          <span>g</span>
          <span>李</span>
        </h1>
        <p className="splash-subtitle">考研背诵神器</p>

        {/* 进度条 */}
        <div className="splash-progress" aria-hidden="true">
          <div
            className="splash-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 加载百分比 */}
        <div className="splash-percent">{progress}%</div>
      </div>
    </div>
  )
}
