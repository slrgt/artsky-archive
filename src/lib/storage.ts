/**
 * Cross-platform storage: web uses localStorage; native uses in-memory + AsyncStorage.
 * Call hydrateStorage() before rendering app on native so global.localStorage is set.
 */

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

let impl: StorageLike

function getImpl(): StorageLike {
  if (typeof impl !== 'undefined') return impl
  if (typeof localStorage !== 'undefined') return localStorage
  // Fallback before hydrate (e.g. SSR): no-op storage
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
}

export function getItem(key: string): string | null {
  return getImpl().getItem(key)
}

export function setItem(key: string, value: string): void {
  getImpl().setItem(key, value)
}

export function removeItem(key: string): void {
  getImpl().removeItem(key)
}

/** Call once at app startup. On native, loads AsyncStorage into memory and sets global.localStorage. */
export async function hydrateStorage(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    impl = localStorage
    return
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
  const keys = await AsyncStorage.getAllKeys()
  const pairs = await AsyncStorage.multiGet(keys)
  const mem: Record<string, string> = {}
  pairs.forEach(([k, v]) => {
    if (v != null) mem[k] = v
  })
  const adapter: StorageLike = {
    getItem: (k) => mem[k] ?? null,
    setItem: (k, v) => {
      mem[k] = v
      void AsyncStorage.setItem(k, v)
    },
    removeItem: (k) => {
      delete mem[k]
      void AsyncStorage.removeItem(k)
    },
  }
  impl = adapter
  ;(global as unknown as { localStorage: StorageLike }).localStorage = adapter
}
