import './SettingsCategoryIcon.css'

const iconPaths = {
  'ai-service': (
    <>
      <circle cx="12" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="9" r="0.8" fill="currentColor" />
      <circle cx="14" cy="9" r="0.8" fill="currentColor" />
      <path d="M10 12.5a3 3 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M7 9H5M19 9h-2M12 4V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M12 17v5M9 20h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </>
  ),
  speech: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 11a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M10 6v3M14 6v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </>
  ),
  ocr: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 16l-5-5L5 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4h2a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  display: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.5" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18a5 5 0 01-1-9.9 7 7 0 0113.5 2.5A4.5 4.5 0 0117 18H7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13l1-1M13 12l1-1M17 13l1-1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </>
  ),
  developer: (
    <>
      <path d="M7 7l-4 5 4 5M17 7l4 5-4 5M14 4l-4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
}

const gradients = {
  'ai-service': { from: 'rgba(139, 92, 246, 0.15)', to: 'rgba(99, 102, 241, 0.1)', accent: '#8B5CF6' },
  speech: { from: 'rgba(249, 115, 22, 0.15)', to: 'rgba(239, 68, 68, 0.1)', accent: '#F97316' },
  ocr: { from: 'rgba(16, 185, 129, 0.15)', to: 'rgba(5, 150, 105, 0.1)', accent: '#10B981' },
  display: { from: 'rgba(236, 72, 153, 0.15)', to: 'rgba(244, 63, 94, 0.1)', accent: '#EC4899' },
  cloud: { from: 'rgba(14, 165, 233, 0.15)', to: 'rgba(59, 130, 246, 0.1)', accent: '#0EA5E9' },
  developer: { from: 'rgba(245, 158, 11, 0.15)', to: 'rgba(217, 119, 6, 0.1)', accent: '#F59E0B' },
}

const particleConfigs = {
  'ai-service': [
    { top: '20%', left: '25%', size: 2, delay: '0s' },
    { top: '55%', left: '70%', size: 1.5, delay: '0.6s' },
    { top: '70%', left: '30%', size: 2, delay: '1.2s' },
  ],
  speech: [
    { top: '25%', left: '70%', size: 2, delay: '0.2s' },
    { top: '60%', left: '20%', size: 1.5, delay: '0.8s' },
    { top: '75%', left: '65%', size: 2, delay: '1.4s' },
  ],
  ocr: [
    { top: '30%', left: '30%', size: 2, delay: '0s' },
    { top: '65%', left: '65%', size: 1.5, delay: '0.7s' },
    { top: '70%', left: '25%', size: 2, delay: '1.3s' },
  ],
  display: [
    { top: '18%', left: '55%', size: 2, delay: '0.3s' },
    { top: '60%', left: '25%', size: 1.5, delay: '0.9s' },
    { top: '75%', left: '60%', size: 2, delay: '1.5s' },
  ],
  cloud: [
    { top: '15%', left: '35%', size: 2, delay: '0.1s' },
    { top: '75%', left: '45%', size: 1.5, delay: '0.7s' },
    { top: '50%', left: '75%', size: 2, delay: '1.3s' },
  ],
  developer: [
    { top: '25%', left: '65%', size: 2, delay: '0s' },
    { top: '60%', left: '25%', size: 1.5, delay: '0.6s' },
    { top: '78%', left: '55%', size: 2, delay: '1.2s' },
  ],
}

export default function SettingsCategoryIcon({ type, size = 40 }) {
  const gradient = gradients[type] || gradients['ai-service']
  const particles = particleConfigs[type] || []

  return (
    <div
      className="settings-icon-wrapper"
      style={{
        width: size,
        height: size,
      }}
    >
      <div
        className="settings-icon-bg"
        style={{
          background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
        }}
      />
      <div className="settings-icon-border" style={{ borderColor: `${gradient.accent}30` }} />
      <div className="settings-icon-glow" style={{ background: `radial-gradient(circle, ${gradient.accent}20 0%, transparent 60%)` }} />
      
      <div className="settings-icon-svg" style={{ color: gradient.accent }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={{ width: '55%', height: '55%' }}
        >
          {iconPaths[type]}
        </svg>
      </div>

      <div className="settings-icon-particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className="settings-icon-particle"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              background: `radial-gradient(circle, ${gradient.accent} 0%, ${gradient.accent}40 100%)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
