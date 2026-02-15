#!/usr/bin/env node
/**
 * Generate public/client-metadata.json for Bluesky OAuth from deployment URL.
 * Run before build so the built app has correct redirect_uris for the domain it's deployed to.
 *
 * In CI we pass (from GitHub Actions):
 *   VITE_APP_ORIGIN  = https://<repository_owner>.github.io
 *   VITE_BASE_PATH   = /<repository_name>/  (or /<repo>-dev/ for dev branch)
 * So forks get their own domain automatically—no hardcoded slrgt.github.io.
 *
 * Locally: set VITE_APP_ORIGIN and optionally VITE_BASE_PATH, or we derive from
 * GITHUB_REPOSITORY (owner/repo) when set.
 */

const fs = require('fs');
const path = require('path');

const explicitOrigin = process.env.VITE_APP_ORIGIN || process.env.APP_ORIGIN;
const repo = process.env.GITHUB_REPOSITORY;
const repoOwner = repo && repo.split('/')[0];
const repoName = repo && repo.split('/')[1];

const origin =
  explicitOrigin ||
  (repoOwner ? `https://${repoOwner}.github.io` : null);

if (!origin) {
  console.error(
    'OAuth metadata needs deployment origin. Set VITE_APP_ORIGIN (e.g. https://YOUR_USERNAME.github.io) or run in CI where GITHUB_REPOSITORY is set.'
  );
  process.exit(1);
}

const explicitBasePath = process.env.VITE_BASE_PATH || process.env.BASE_PATH;
const basePathRaw = explicitBasePath || (repoName ? `/${repoName}/` : null) || '/';
const basePath = basePathRaw.replace(/^\/?/, '/').replace(/\/*$/, '') + '/';

const appBase = `${origin.replace(/\/$/, '')}${basePath}`;
const clientId = `${appBase}client-metadata.json`;

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
};

const outDir = path.join(__dirname, '..', 'public');
const outFile = path.join(outDir, 'client-metadata.json');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
console.log('Generated', outFile, '->', appBase);
