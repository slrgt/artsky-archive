#!/usr/bin/env node
/**
 * Generate public/client-metadata.json for Bluesky OAuth from deployment URL.
 * Run before build so the built app has correct redirect_uris for the domain it's deployed to.
 *
 * Env (CI sets from github.repository_owner + repository.name; or set locally):
 *   VITE_APP_ORIGIN or APP_ORIGIN  e.g. https://username.github.io (no trailing slash)
 *   VITE_BASE_PATH or BASE_PATH    e.g. /repo-name/ (leading and trailing slash)
 *
 * In GitHub Actions we pass both from the repo so forks get their URL and path automatically.
 * Fallback: GITHUB_REPOSITORY (owner/repo) → origin from owner, base path from repo name.
 */

const fs = require('fs')
const path = require('path')

const explicitOrigin = process.env.VITE_APP_ORIGIN || process.env.APP_ORIGIN
const repoOwner =
  process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.split('/')[0]
const origin =
  explicitOrigin ||
  (repoOwner ? `https://${repoOwner}.github.io` : null)
if (!origin) {
  console.error(
    'OAuth metadata needs deployment origin. Set VITE_APP_ORIGIN (e.g. https://YOUR_USERNAME.github.io) or run in CI where GITHUB_REPOSITORY is set.'
  )
  process.exit(1)
}
const explicitBasePath = process.env.VITE_BASE_PATH || process.env.BASE_PATH
const repoName =
  process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.split('/')[1]
const basePathRaw =
  explicitBasePath || (repoName ? `/${repoName}/` : null) || '/'
const basePath = basePathRaw.replace(/^\/?/, '/').replace(/\/?$/, '/') || '/'

const appBase = `${origin.replace(/\/$/, '')}${basePath}`
const clientId = `${appBase}client-metadata.json`

const metadata = {
  client_id: clientId,
  client_name: 'ArtSky',
  client_uri: appBase,
  redirect_uris: [appBase],
  scope:
    'atproto transition:generic rpc:app.bsky.feed.getFeed?aud=did:web:api.bsky.app%23bsky_appview',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  dpop_bound_access_tokens: true,
}

const outDir = path.join(__dirname, '..', 'public')
const outFile = path.join(outDir, 'client-metadata.json')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(metadata, null, 2) + '\n', 'utf8')
console.log('Generated', outFile, '->', appBase)
console.log('  client_id:', clientId)
console.log('  redirect_uris:', metadata.redirect_uris)
