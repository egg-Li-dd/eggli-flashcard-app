import { useState, useEffect } from 'react'

export default function BackToTop({ scrollContainerSelector }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const getEl = () => {
      if (scrollContainerSelector) {
        return document.querySelector(scrollContainerSelector)
      }
      return window
    }

    const el = getEl()
    if (!el) return

    const onScroll = () => {
      const scrollTop = el === window
        ? window.scrollY || document.documentElement.scrollTop
        : el.scrollTop
      setVisible(scrollTop > 300)
    }

    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollContainerSelector])

  const scrollToTop = () => {
    if (scrollContainerSelector) {
      const el = document.querySelector(scrollContainerSelector)
      if (el) {
        el.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!visible) return null

  return (
    <button
      onClick={scrollToTop}
      className="back-to-top-btn"
      aria-label="回到顶部"
      title="回到顶部"
    >
      <svg
        width="20" height="20"
        viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  )
}