import { Capacitor, registerPlugin } from '@capacitor/core'

let tailscalePlugin = null

function getTailscalePlugin() {
  if (tailscalePlugin) return tailscalePlugin
  if (Capacitor.isNativePlatform()) {
    try {
      tailscalePlugin = registerPlugin('TailscaleVPN')
      return tailscalePlugin
    } catch (e) {
      console.warn('registerPlugin TailscaleVPN failed, falling back:', e.message)
    }
    const plugins = Capacitor.Plugins
    if (plugins && plugins.TailscaleVPN) {
      tailscalePlugin = plugins.TailscaleVPN
      return tailscalePlugin
    }
    if (window.Capacitor && window.Capacitor.Plugins) {
      const plugin = window.Capacitor.Plugins.TailscaleVPN
      if (plugin) {
        tailscalePlugin = plugin
        return tailscalePlugin
      }
    }
  }
  return null
}

export async function isAvailable() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      return { available: false, running: false }
    }
    const ret = await plugin.isAvailable()
    return { available: ret.available ?? false, running: ret.running ?? false }
  } catch (e) {
    console.error('isAvailable failed:', e)
    return { available: false, running: false }
  }
}

export async function prepare() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      return { prepared: false, error: 'Tailscale 插件不可用' }
    }
    const ret = await plugin.prepare()
    return { prepared: ret.prepared ?? false, error: ret.error }
  } catch (e) {
    console.error('prepare failed:', e)
    return { prepared: false, error: e.message || '准备 VPN 失败' }
  }
}

export async function start(authKey) {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      throw new Error('Tailscale 插件不可用')
    }
    const params = authKey ? { authKey } : {}
    const ret = await plugin.start(params)
    if (ret && ret.success) {
      return true
    }
    throw new Error(ret?.error || '启动失败')
  } catch (e) {
    console.error('tailscale start failed:', e)
    throw e
  }
}

export async function stop() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return false
    const ret = await plugin.stop()
    return ret.success ?? false
  } catch (e) {
    console.error('tailscale stop failed:', e)
    return false
  }
}

export async function callLocalAPI(method, endpoint, body, timeout = 10000) {
  const plugin = getTailscalePlugin()
  if (!plugin) {
    throw new Error('Tailscale plugin not available')
  }
  const ret = await plugin.callLocalAPI({ method, endpoint, body: body || '', timeout })
  return { statusCode: ret.statusCode, body: ret.body }
}

export async function getStatus() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return null
    const ret = await plugin.getStatus()
    if (ret.statusCode === 200 && ret.body) {
      return JSON.parse(ret.body)
    }
    return null
  } catch (e) {
    console.error('getStatus failed:', e)
    return null
  }
}

export async function getPrefs() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return null
    const ret = await plugin.getPrefs()
    if (ret.statusCode === 200 && ret.body) {
      return JSON.parse(ret.body)
    }
    return null
  } catch (e) {
    console.error('getPrefs failed:', e)
    return null
  }
}

export async function editPrefs(prefs) {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      console.error('[editPrefs] plugin not available')
      return false
    }
    // Tailscale MaskedPrefs 使用嵌入式 Prefs + *Set 后缀的 mask 字段在同一层级
    const maskedPrefs = {}
    for (const key in prefs) {
      maskedPrefs[key] = prefs[key]
      maskedPrefs[`${key}Set`] = true
    }
    console.log('[editPrefs] calling plugin.editPrefs with:', JSON.stringify(maskedPrefs))
    const ret = await plugin.editPrefs({ body: JSON.stringify(maskedPrefs) })
    console.log('[editPrefs] response:', ret)
    return ret.statusCode === 200
  } catch (e) {
    console.error('[editPrefs] failed:', e.message || e)
    return false
  }
}

export async function startLoginInteractive(authKey) {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      throw new Error('Tailscale 插件不可用')
    }
    console.log('[startLoginInteractive] calling plugin.startLoginInteractive')
    const params = authKey ? { authKey } : {}
    const ret = await plugin.startLoginInteractive(params)
    console.log('[startLoginInteractive] response:', ret)
    return { statusCode: ret.statusCode, body: ret.body }
  } catch (e) {
    console.error('[startLoginInteractive] failed:', e.message || e)
    throw e
  }
}

export async function getLastNotification() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return ''
    const ret = await plugin.getLastNotification()
    return ret.data || ''
  } catch (e) {
    console.error('getLastNotification failed:', e)
    return ''
  }
}

export async function getLoginURL() {
  try {
    const status = await getStatus()
    if (status && (status.AuthURL || status.LoginURL || status.BrowseToURL)) {
      return status.AuthURL || status.LoginURL || status.BrowseToURL
    }
    return ''
  } catch (e) {
    console.error('getLoginURL failed:', e)
    return ''
  }
}

export async function logout() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return false
    const ret = await plugin.startLogout()
    return ret.statusCode === 200
  } catch (e) {
    console.error('logout failed:', e)
    return false
  }
}

export async function listPeers() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return []
    const ret = await plugin.listPeers()
    if (ret.statusCode === 200 && ret.body) {
      return JSON.parse(ret.body)
    }
    return []
  } catch (e) {
    console.error('listPeers failed:', e)
    return []
  }
}

export async function up() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) {
      throw new Error('Tailscale 插件不可用')
    }
    const ret = await plugin.up()
    return { statusCode: ret.statusCode, body: ret.body }
  } catch (e) {
    console.error('up failed:', e)
    throw e
  }
}

export async function down() {
  try {
    const plugin = getTailscalePlugin()
    if (!plugin) return false
    const ret = await plugin.down()
    return ret.statusCode === 200
  } catch (e) {
    console.error('down failed:', e)
    return false
  }
}

export async function fetchViaTailscale(url, options = {}) {
  const method = options.method || 'GET'
  const headers = options.headers || {}
  const body = options.body || ''
  const timeout = options.timeout || 60000

  // 判断是否是局域网地址（192.168.x.x / 10.x.x.x / 172.16-31.x.x / localhost）
  const isLan = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1)/.test(url)

  if (isLan) {
    // 局域网地址直接用 fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const fetchOptions = { method, headers, signal: controller.signal }
      if (method !== 'GET' && method !== 'HEAD' && body) {
        fetchOptions.body = body
      }
      const resp = await fetch(url, fetchOptions)
      const text = await resp.text()
      return { statusCode: resp.status, body: text }
    } catch (e) {
      return { statusCode: 0, body: e.message || '网络请求失败' }
    } finally {
      clearTimeout(timer)
    }
  }

  // Tailscale 地址（100.x.x.x）需要走 Tailscale netstack
  // 当前版本暂未实现原生 HTTP 代理，回退到 fetch（如果 Tailscale VPN 已连接，路由表会正确路由）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const fetchOptions = { method, headers, signal: controller.signal }
    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = body
    }
    const resp = await fetch(url, fetchOptions)
    const text = await resp.text()
    return { statusCode: resp.status, body: text }
  } catch (e) {
    return { statusCode: 0, body: e.message || '网络请求失败' }
  } finally {
    clearTimeout(timer)
  }
}
