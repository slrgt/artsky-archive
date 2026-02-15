/** Design tokens for React Native (matches index.css). */
export const colors = {
  dark: {
    bg: '#0f0f1a',
    surface: '#1a1a2e',
    border: '#2d2d44',
    text: '#f0f0f8',
    muted: '#9a9ab0',
    accent: '#7c3aed',
    error: '#f87171',
    textOnAccent: '#fff',
    overlay: 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#ebeae6',
    surface: '#ffffff',
    border: '#c9c8c4',
    text: '#141414',
    muted: '#525254',
    accent: '#5b21b6',
    error: '#b91c1c',
    textOnAccent: '#ffffff',
    overlay: 'rgba(0,0,0,0.4)',
  },
} as const

export type ColorScheme = 'light' | 'dark'
