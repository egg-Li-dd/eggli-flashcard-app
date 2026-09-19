import { describe, expect, it, vi } from 'vitest'
import { isTransientSupabaseNetworkError, runSupabaseWithStartupRetry } from '../services/cloudbase'

describe('Supabase 启动期网络重试', () => {
  it('应识别 APK 刚启动时常见的临时网络错误', () => {
    expect(isTransientSupabaseNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientSupabaseNetworkError(new Error('fetch failed'))).toBe(true)
    expect(isTransientSupabaseNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isTransientSupabaseNetworkError(new Error('Invalid login credentials'))).toBe(false)
  })

  it('遇到临时网络错误应自动重试，后续成功时不向用户暴露首次失败', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })

    const result = await runSupabaseWithStartupRetry(operation, {
      retries: 2,
      baseDelayMs: 1,
    })

    expect(result).toEqual({ data: { user: { id: 'u1' } }, error: null })
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('遇到账号密码错误等业务错误不应重试', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Invalid login credentials'))

    await expect(runSupabaseWithStartupRetry(operation, {
      retries: 2,
      baseDelayMs: 1,
    })).rejects.toThrow('Invalid login credentials')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
