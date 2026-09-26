import { Link } from 'react-router-dom'
import SettingsCategoryIcon from '../components/SettingsCategoryIcon'

const SETTINGS_CATEGORIES = [
  {
    id: 'ai-service',
    icon: '🤖',
    title: 'AI 服务',
    description: '配置 AI 服务提供商、API Key 和模型选择',
    path: '/settings/ai-service',
  },
  {
    id: 'speech',
    icon: '🎤',
    title: '语音识别',
    description: '设置语音识别模式和相关服务配置',
    path: '/settings/speech',
  },
  {
    id: 'ocr',
    icon: '🖼️',
    title: '图像识别',
    description: '配置 OCR 引擎（AI 大模型 / PaddleOCR / 百度智能云）',
    path: '/settings/ocr',
  },
  {
    id: 'display',
    icon: '🎨',
    title: '显示与偏好',
    description: '调整字体大小、护眼模式、背景风格和输入栏样式',
    path: '/settings/display',
  },
  
  {
    id: 'developer',
    icon: '🔧',
    title: '开发者选项',
    description: 'AI 生成调试面板、测试功能等',
    path: '/settings/developer',
  },
]

const Arrow = () => (
  <svg className="settings-row-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
  </svg>
)

export default function SettingsMain() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--color-bg)',
    }}>
      <div className="settings-scroll anim-slide-in-up">
        <div className="settings-section">
          {SETTINGS_CATEGORIES.map((category, i) => (
            <Link
              key={category.id}
              to={category.path}
              className="settings-category-card card-interactive"
              style={{ textDecoration: 'none', animationDelay: `${i * 60}ms` }}
            >
              <div className="settings-category-icon">
                <SettingsCategoryIcon type={category.id} />
              </div>
              <div className="settings-category-content">
                <div className="settings-category-title">{category.title}</div>
                <div className="settings-category-desc">{category.description}</div>
              </div>
              <Arrow />
            </Link>
          ))}
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 24px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          AI 背诵卡片
        </div>
      </div>
    </div>
  )
}