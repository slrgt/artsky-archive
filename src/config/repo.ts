/**
 * URL of the git repository this app was built from.
 * Set VITE_REPO_URL at build time for GitHub Pages, Tangled, Codeberg, etc.
 * Example: VITE_REPO_URL=https://codeberg.org/owner/artsky vite build
 */
export const REPO_URL: string =
  import.meta.env.VITE_REPO_URL || 'https://github.com/slrgt/artsky'
