export async function checkCameraPermission() {
  if (!navigator.permissions) return { granted: true, prompt: true }
  try {
    const result = await navigator.permissions.query({ name: 'camera' })
    return {
      granted: result.state === 'granted',
      denied: result.state === 'denied',
      prompt: result.state === 'prompt'
    }
  } catch {
    return { granted: true, prompt: true }
  }
}

export async function checkPhotosPermission() {
  if (!navigator.permissions) return { granted: true, prompt: true }
  try {
    const result = await navigator.permissions.query({ name: 'photos' })
    return {
      granted: result.state === 'granted',
      denied: result.state === 'denied',
      prompt: result.state === 'prompt'
    }
  } catch {
    try {
      const result = await navigator.permissions.query({ name: 'read-only-storage' })
      return {
        granted: result.state === 'granted',
        denied: result.state === 'denied',
        prompt: result.state === 'prompt'
      }
    } catch {
      return { granted: true, prompt: true }
    }
  }
}

export async function requestCameraPermission() {
  const status = await checkCameraPermission()
  return status
}

export async function requestPhotosPermission() {
  const status = await checkPhotosPermission()
  return status
}

export function openAppSettings() {
  if (typeof Capacitor !== 'undefined' && Capacitor.getPlatform() === 'android') {
    try {
      Capacitor.Plugins.AppLauncher.openUrl({
        url: 'app-settings://'
      })
    } catch {
      window.location.href = 'intent://settings#Intent;scheme=app-settings;end'
    }
  } else if (typeof Capacitor !== 'undefined' && Capacitor.getPlatform() === 'ios') {
    try {
      Capacitor.Plugins.AppLauncher.openUrl({
        url: 'app-settings://'
      })
    } catch {
      window.location.href = 'prefs:root=Privacy'
    }
  } else {
    alert('请手动打开应用设置以授权相机或相册权限')
  }
}

export function showPermissionDeniedDialog(message, onOpenSettings) {
  if (typeof window !== 'undefined' && window.confirm) {
    const confirmed = window.confirm(`${message}\n\n是否前往应用设置页面开启权限？`)
    if (confirmed) {
      onOpenSettings?.()
    }
  }
}