import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 捕获到错误:', error)
    console.error('[ErrorBoundary] 错误详情:', errorInfo)
    // 同时在页面显示组件栈信息
    if (errorInfo && errorInfo.componentStack) {
      this.setState({ componentStack: errorInfo.componentStack })
    }
  }

  handleRefresh = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload()
    }
  }

  handleBack = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined' && window.history) {
      window.history.back()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: '300px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--color-bg, #FFFFFF)',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
              padding: '32px 24px',
              background: 'var(--color-bg-offset, #F8FAFC)',
              borderRadius: '16px',
              border: '1px solid var(--color-border-light, #E2E8F0)',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                marginBottom: '16px',
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: '600',
                color: 'var(--color-text, #0F172A)',
                margin: '0 0 8px 0',
              }}
            >
              遇到了一些问题
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary, #64748B)',
                margin: '0 0 24px 0',
                lineHeight: '1.5',
              }}
            >
              {this.state.error && this.state.error.message
                ? this.state.error.message
                : '页面出现了意外错误，请尝试刷新或返回上一页。'}
            </p>
            {this.state.componentStack && (
              <div style={{
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: '#f1f5f9',
                padding: '8px 12px',
                borderRadius: 8,
                marginBottom: 16,
                textAlign: 'left',
                maxHeight: 150,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                lineHeight: 1.4,
              }}>{this.state.componentStack}</div>
            )}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={this.handleRefresh}
                style={{
                  minHeight: '44px',
                  padding: '0 24px',
                  fontSize: '15px',
                  fontWeight: '500',
                  color: '#FFFFFF',
                  background: 'var(--color-primary, #2563EB)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                刷新重试
              </button>
              <button
                onClick={this.handleBack}
                style={{
                  minHeight: '44px',
                  padding: '0 24px',
                  fontSize: '15px',
                  fontWeight: '500',
                  color: 'var(--color-text, #0F172A)',
                  background: 'var(--color-bg, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                返回上一页
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
