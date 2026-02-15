import { hydrateStorage } from './src/lib/storage'
import { registerRootComponent } from 'expo'

if (typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = '#0f0f1a'
  document.body.style.backgroundColor = '#0f0f1a'
  document.body.style.minHeight = '100vh'
}

hydrateStorage()
  .then(() => import('./App'))
  .then((m) => registerRootComponent(m.default))
  .catch((err) => {
    console.error('App failed to load', err)
    if (typeof document !== 'undefined') {
      const root = document.getElementById('root') || document.body
      root.innerHTML = `<pre style="padding:16px;background:#1a1a2e;color:#f0f0f8;font-family:monospace;white-space:pre-wrap;">Failed to load app:\n${err?.message || err}\n\n${err?.stack || ''}</pre>`
      root.style.backgroundColor = '#0f0f1a'
    }
    throw err
  })
