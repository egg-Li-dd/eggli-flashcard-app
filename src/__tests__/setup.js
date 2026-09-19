import 'fake-indexeddb/auto'

// 全局模拟 IndexedDB，供 Dexie 在 Node.js 环境中使用
// 模拟 localStorage，供 sync.js 在 Node.js 环境中使用
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index) => [...store.keys()][index] ?? null,
  }
}