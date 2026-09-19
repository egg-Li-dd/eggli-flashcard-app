import { registerPlugin } from '@capacitor/core'

export interface SystemFloatingWindowPlugin {
  canDrawOverlays(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ opened: boolean, granted?: boolean }>
  show(): Promise<{ shown: boolean }>
  hide(): Promise<{ hidden: boolean }>
  isShowing(): Promise<{ showing: boolean }>
}

const SystemFloatingWindow = registerPlugin<SystemFloatingWindowPlugin>('SystemFloatingWindow')

export default SystemFloatingWindow
